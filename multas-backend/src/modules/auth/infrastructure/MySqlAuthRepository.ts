import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { HttpError } from "../../../shared/http/HttpError.js";
import type { MySqlDatabase } from "../../../shared/infrastructure/mysql/MySqlConnection.js";
import type {
  AuthenticationEvent,
  AuthRepository,
  CreateAdminInput,
  CreateSessionInput,
  LoginUser,
  RevokedTokenSession,
  SessionState,
  SessionSummary,
  StoredSession,
} from "../application/AuthRepository.js";
import type { AuthenticatedSession, AuthenticatedUser } from "../domain/Session.js";

type UserRow = RowDataPacket & {
  id: number | string;
  username: string;
  email: string | null;
  password_hash: string;
  first_name: string;
  last_name: string;
  status: LoginUser["status"];
  failed_login_attempts: number;
  locked_until: Date | null;
  session_version: number;
  must_change_password: number;
};

type SessionRow = UserRow & {
  session_id: number | string;
  session_user_id: number | string;
  session_version_value: number;
  idle_expires_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
};

type SessionSummaryRow = RowDataPacket & {
  id: number | string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
  last_seen_at: Date;
  idle_expires_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  revoke_reason: string | null;
};

export class MySqlAuthRepository implements AuthRepository {
  public constructor(private readonly database: MySqlDatabase) {}

  public async findUserByIdentifier(identifier: string): Promise<LoginUser | null> {
    const rows = await this.database.query<UserRow[]>(
      `SELECT id, username, email, password_hash, first_name, last_name, status,
              failed_login_attempts, locked_until, session_version, must_change_password
       FROM users
       WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)
       LIMIT 1`,
      [identifier, identifier],
    );
    const row = rows[0];
    return row ? this.toLoginUser(row, await this.loadAuthorization(String(row.id))) : null;
  }

  public async findUserById(userId: string): Promise<LoginUser | null> {
    const rows = await this.database.query<UserRow[]>(
      `SELECT id, username, email, password_hash, first_name, last_name, status,
              failed_login_attempts, locked_until, session_version, must_change_password
       FROM users WHERE id = ? LIMIT 1`,
      [userId],
    );
    const row = rows[0];
    return row ? this.toLoginUser(row, await this.loadAuthorization(String(row.id))) : null;
  }

  public async registerFailedAttempt(userId: string, maximumAttempts: number, lockMinutes: number): Promise<Date | null> {
    return this.database.withTransaction(async (connection) => {
      const [rows] = await connection.query<(RowDataPacket & { failed_login_attempts: number })[]>(
        "SELECT failed_login_attempts FROM users WHERE id = ? FOR UPDATE",
        [userId],
      );
      const nextAttempts = Math.min((rows[0]?.failed_login_attempts ?? 0) + 1, 100);
      await connection.query(
        `UPDATE users
         SET failed_login_attempts = ?,
             locked_until = CASE WHEN ? >= ? THEN DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? MINUTE) ELSE locked_until END
         WHERE id = ?`,
        [nextAttempts, nextAttempts, maximumAttempts, lockMinutes, userId],
      );
      if (nextAttempts < maximumAttempts) return null;
      const [lockRows] = await connection.query<(RowDataPacket & { locked_until: Date })[]>(
        "SELECT locked_until FROM users WHERE id = ?",
        [userId],
      );
      return lockRows[0]?.locked_until ?? null;
    });
  }

  public async resetFailedAttempts(userId: string): Promise<void> {
    await this.database.query<ResultSetHeader>(
      "UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP(3) WHERE id = ?",
      [userId],
    );
  }

  public async createSession(input: CreateSessionInput): Promise<string> {
    const result = await this.database.query<ResultSetHeader>(
      `INSERT INTO user_sessions
       (user_id, token_hash, session_version, ip_address, user_agent, idle_expires_at, expires_at)
       VALUES (?, ?, ?, INET6_ATON(?), ?, ?, ?)`,
      [input.userId, input.tokenHash, input.sessionVersion, input.ipAddress, input.userAgent, input.idleExpiresAt, input.expiresAt],
    );
    return String(result.insertId);
  }

  public async findSession(tokenHash: Buffer): Promise<AuthenticatedSession | null> {
    const state = await this.getSessionState(tokenHash);
    return state.status === "ACTIVE" ? state.session : null;
  }

  public async getSessionState(tokenHash: Buffer): Promise<SessionState> {
    const rows = await this.database.query<SessionRow[]>(
      `SELECT s.id AS session_id, s.user_id AS session_user_id, s.session_version AS session_version_value,
              s.idle_expires_at, s.expires_at, s.revoked_at,
              u.id, u.username, u.email, u.password_hash, u.first_name, u.last_name, u.status,
              u.failed_login_attempts, u.locked_until, u.session_version, u.must_change_password
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?
       LIMIT 1`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return { status: "NOT_FOUND" };
    if (row.revoked_at) return { status: "REVOKED" };
    const now = new Date();
    if (row.expires_at <= now || row.idle_expires_at <= now) return { status: "EXPIRED" };
    if (row.status !== "ACTIVE") return { status: "ACCOUNT_DISABLED" };
    if (row.session_version_value !== row.session_version) return { status: "VERSION_MISMATCH" };
    const authorization = await this.loadAuthorization(String(row.id));
    return { status: "ACTIVE", session: {
        id: String(row.session_id),
        expiresAt: row.expires_at,
        user: this.toUser(row, authorization),
      } };
  }

  public async touchSession(sessionId: string, idleExpiresAt: Date): Promise<void> {
    await this.database.query<ResultSetHeader>(
      "UPDATE user_sessions SET last_seen_at = UTC_TIMESTAMP(3), idle_expires_at = LEAST(?, expires_at) WHERE id = ? AND revoked_at IS NULL",
      [idleExpiresAt, sessionId],
    );
  }

  public async revokeSession(sessionId: string, userId: string, reason: string): Promise<void> {
    await this.database.query<ResultSetHeader>(
      `UPDATE user_sessions
       SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP(3)), revoked_by_user_id = ?, revoke_reason = ?
       WHERE id = ? AND user_id = ?`,
      [userId, reason, sessionId, userId],
    );
  }

  public async revokeAllSessions(userId: string, reason: string): Promise<void> {
    await this.database.withTransaction(async (connection) => {
      await connection.query(
        `UPDATE user_sessions
         SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP(3)), revoked_by_user_id = ?, revoke_reason = ?
         WHERE user_id = ? AND revoked_at IS NULL`,
        [userId, reason, userId],
      );
      await connection.query("UPDATE users SET session_version = session_version + 1 WHERE id = ?", [userId]);
    });
  }

  public async revokeSessionByTokenHash(tokenHash: Buffer, reason: string): Promise<RevokedTokenSession | null> {
    return this.database.withTransaction(async (connection) => {
      const [rows] = await connection.query<(RowDataPacket & { id: number | string; user_id: number | string; revoked_at: Date | null })[]>(
        "SELECT id, user_id, revoked_at FROM user_sessions WHERE token_hash = ? FOR UPDATE",
        [tokenHash],
      );
      const row = rows[0];
      if (!row) return null;
      const changed = row.revoked_at === null;
      if (changed) {
        await connection.query(
          `UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP(3), revoked_by_user_id = user_id, revoke_reason = ? WHERE id = ?`,
          [reason, row.id],
        );
      }
      return { id: String(row.id), userId: String(row.user_id), revokedAt: row.revoked_at, changed };
    });
  }

  public async listSessions(userId: string, currentSessionId: string): Promise<SessionSummary[]> {
    const rows = await this.database.query<SessionSummaryRow[]>(
      `SELECT id, INET6_NTOA(ip_address) AS ip_address, user_agent, created_at, last_seen_at,
              idle_expires_at, expires_at, revoked_at, revoke_reason
       FROM user_sessions WHERE user_id = ? ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map((row) => ({
      id: String(row.id),
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      idleExpiresAt: row.idle_expires_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      revokeReason: row.revoke_reason,
      current: String(row.id) === currentSessionId,
    }));
  }

  public async findStoredSession(sessionId: string): Promise<StoredSession | null> {
    const rows = await this.database.query<(RowDataPacket & { id: number | string; user_id: number | string; revoked_at: Date | null })[]>(
      "SELECT id, user_id, revoked_at FROM user_sessions WHERE id = ? LIMIT 1",
      [sessionId],
    );
    const row = rows[0];
    return row ? { id: String(row.id), userId: String(row.user_id), revokedAt: row.revoked_at } : null;
  }

  public async revokeSessionAsActor(sessionId: string, actorUserId: string, reason: string): Promise<boolean> {
    const result = await this.database.query<ResultSetHeader>(
      `UPDATE user_sessions
       SET revoked_at = UTC_TIMESTAMP(3), revoked_by_user_id = ?, revoke_reason = ?
       WHERE id = ? AND revoked_at IS NULL`,
      [actorUserId, reason, sessionId],
    );
    return result.affectedRows === 1;
  }

  public async changePassword(userId: string, currentSessionId: string, passwordHash: string): Promise<void> {
    await this.database.withTransaction(async (connection) => {
      const [users] = await connection.query<(RowDataPacket & { password_hash: string })[]>(
        "SELECT password_hash FROM users WHERE id = ? FOR UPDATE",
        [userId],
      );
      const user = users[0];
      if (!user) throw new HttpError({ code: "AUTH_REQUIRED", message: "Se requiere una sesión válida.", statusCode: 401 });
      await connection.query("INSERT INTO user_password_history (user_id, password_hash) VALUES (?, ?)", [userId, user.password_hash]);
      await connection.query(
        `UPDATE users SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(3), must_change_password = 0,
                          failed_login_attempts = 0, locked_until = NULL WHERE id = ?`,
        [passwordHash, userId],
      );
      await connection.query(
        `UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP(3), revoked_by_user_id = ?, revoke_reason = ?
         WHERE user_id = ? AND id <> ? AND revoked_at IS NULL`,
        [userId, "Cambio de contraseña: otras sesiones revocadas", userId, currentSessionId],
      );
    });
  }

  public async resetPassword(userId: string, passwordHash: string): Promise<void> {
    await this.database.withTransaction(async (connection) => {
      const [users] = await connection.query<(RowDataPacket & { password_hash: string })[]>(
        "SELECT password_hash FROM users WHERE id = ? FOR UPDATE",
        [userId],
      );
      const user = users[0];
      if (!user) throw new HttpError({ code: "ADMIN_NOT_FOUND", message: "No existe el administrador indicado.", statusCode: 404 });
      await connection.query("INSERT INTO user_password_history (user_id, password_hash) VALUES (?, ?)", [userId, user.password_hash]);
      await connection.query(
        `UPDATE users SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(3), must_change_password = 0,
                          failed_login_attempts = 0, locked_until = NULL, session_version = session_version + 1 WHERE id = ?`,
        [passwordHash, userId],
      );
      await connection.query(
        `UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP(3), revoked_by_user_id = ?, revoke_reason = ?
         WHERE user_id = ? AND revoked_at IS NULL`,
        [userId, "Restablecimiento administrativo de contraseña", userId],
      );
    });
  }

  public async cleanupExpiredSessions(): Promise<number> {
    const result = await this.database.query<ResultSetHeader>(
      `UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP(3), revoke_reason = 'Expirada por política de retención'
       WHERE revoked_at IS NULL AND (expires_at <= UTC_TIMESTAMP(3) OR idle_expires_at <= UTC_TIMESTAMP(3))`,
    );
    return result.affectedRows;
  }

  public async recordAuthenticationEvent(event: AuthenticationEvent): Promise<void> {
    await this.database.query<ResultSetHeader>(
      `INSERT INTO authentication_events
       (user_id, identifier_masked, event_type, outcome, failure_code, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, INET6_ATON(?), ?)`,
      [
        event.userId,
        event.identifierMasked,
        event.eventType,
        event.outcome,
        event.failureCode ?? null,
        event.ipAddress,
        event.userAgent,
      ],
    );
  }

  public async createAdmin(input: CreateAdminInput): Promise<AuthenticatedUser> {
    return this.database.withTransaction(async (connection) => {
      const [existing] = await connection.query<RowDataPacket[]>(
        "SELECT id FROM users WHERE LOWER(username) = LOWER(?) OR (? IS NOT NULL AND LOWER(email) = LOWER(?)) LIMIT 1",
        [input.username, input.email, input.email],
      );
      if (existing.length > 0) {
        throw new HttpError({ code: "ADMIN_ALREADY_EXISTS", message: "El usuario o correo ya existe.", statusCode: 409 });
      }
      const [roles] = await connection.query<(RowDataPacket & { id: number | string })[]>(
        "SELECT id FROM roles WHERE code = 'ADMIN' AND is_active = 1 LIMIT 1",
      );
      const role = roles[0];
      if (!role) {
        throw new HttpError({
          code: "ADMIN_ROLE_MISSING",
          message: "No existe el rol institucional ADMIN. Ejecute primero la verificación de esquema/RBAC.",
          statusCode: 409,
        });
      }
      const [site] = await connection.query<(RowDataPacket & { id: number | string })[]>(
        "SELECT id FROM sites WHERE code = 'CENTRAL' AND is_active = 1 LIMIT 1",
      );
      const [department] = await connection.query<(RowDataPacket & { id: number | string })[]>(
        "SELECT id FROM departments WHERE code = 'ADMINISTRACION' AND is_active = 1 LIMIT 1",
      );
      const [position] = await connection.query<(RowDataPacket & { id: number | string })[]>(
        "SELECT id FROM positions WHERE code = 'ADMINISTRADOR_SISTEMA' AND is_active = 1 LIMIT 1",
      );
      const [insert] = await connection.query<ResultSetHeader>(
        `INSERT INTO users
         (username, email, password_hash, first_name, last_name, site_id, department_id, position_id,
          status, must_change_password, password_changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 0, UTC_TIMESTAMP(3))`,
        [
          input.username,
          input.email,
          input.passwordHash,
          input.firstName,
          input.lastName,
          site[0]?.id ?? null,
          department[0]?.id ?? null,
          position[0]?.id ?? null,
        ],
      );
      const userId = String(insert.insertId);
      await connection.query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [userId, role.id]);
      const permissions = await this.loadAdminPermissions(connection, String(role.id));
      return {
        id: userId,
        username: input.username,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        roles: ["ADMIN"],
        permissions,
        mustChangePassword: false,
      };
    });
  }

  private async loadAuthorization(userId: string): Promise<{ roles: string[]; permissions: string[] }> {
    const roles = await this.database.query<(RowDataPacket & { code: string })[]>(
      `SELECT DISTINCT r.code
       FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND r.is_active = 1 AND (ur.expires_at IS NULL OR ur.expires_at > UTC_TIMESTAMP(3))
       ORDER BY r.code`,
      [userId],
    );
    const allowed = await this.database.query<(RowDataPacket & { code: string })[]>(
      `SELECT DISTINCT p.code
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id AND r.is_active = 1
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id AND p.is_active = 1
       WHERE ur.user_id = ? AND (ur.expires_at IS NULL OR ur.expires_at > UTC_TIMESTAMP(3))`,
      [userId],
    );
    const overrides = await this.database.query<(RowDataPacket & { code: string; effect: "ALLOW" | "DENY" })[]>(
      `SELECT p.code, o.effect
       FROM user_permission_overrides o JOIN permissions p ON p.id = o.permission_id AND p.is_active = 1
       WHERE o.user_id = ? AND (o.expires_at IS NULL OR o.expires_at > UTC_TIMESTAMP(3))`,
      [userId],
    );
    const permissions = new Set(allowed.map((row) => row.code));
    for (const override of overrides) {
      if (override.effect === "ALLOW") permissions.add(override.code);
      else permissions.delete(override.code);
    }
    return { roles: roles.map((row) => row.code), permissions: [...permissions].sort() };
  }

  private async loadAdminPermissions(connection: PoolConnection, roleId: string): Promise<string[]> {
    const [rows] = await connection.query<(RowDataPacket & { code: string })[]>(
      `SELECT p.code FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id AND p.is_active = 1
       WHERE rp.role_id = ? ORDER BY p.code`,
      [roleId],
    );
    return rows.map((row) => row.code);
  }

  private toLoginUser(row: UserRow, authorization: { roles: string[]; permissions: string[] }): LoginUser {
    return {
      ...this.toUser(row, authorization),
      passwordHash: row.password_hash,
      status: row.status,
      failedLoginAttempts: row.failed_login_attempts,
      lockedUntil: row.locked_until,
      sessionVersion: row.session_version,
    };
  }

  private toUser(row: UserRow, authorization: { roles: string[]; permissions: string[] }): AuthenticatedUser {
    return {
      id: String(row.id),
      username: row.username,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      roles: authorization.roles,
      permissions: authorization.permissions,
      mustChangePassword: row.must_change_password === 1,
    };
  }
}
