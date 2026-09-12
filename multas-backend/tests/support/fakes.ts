import { randomUUID } from "node:crypto";
import type { AuthenticatedSession, AuthenticatedUser } from "../../src/modules/auth/domain/Session.js";
import type {
  AuthenticationEvent,
  AuthRepository,
  CreateAdminInput,
  CreateSessionInput,
  LoginUser,
  PasswordHasher,
  SessionSummary,
} from "../../src/modules/auth/application/AuthRepository.js";
import type { AuditEvent, AuditRepository } from "../../src/modules/audit/application/AuditRepository.js";

export const testPassword = `T3st!Aa-${randomUUID()}`;

export const defaultUser: LoginUser = {
  id: "1",
  username: "admin",
  email: "admin@example.test",
  firstName: "Ada",
  lastName: "Admin",
  roles: ["ADMIN"],
  permissions: ["auth.sessions.read_own", "auth.sessions.revoke_own", "users.create"],
  mustChangePassword: false,
  passwordHash: `hashed:${testPassword}`,
  status: "ACTIVE",
  failedLoginAttempts: 0,
  lockedUntil: null,
  sessionVersion: 1,
};

export class FakePasswordHasher implements PasswordHasher {
  public hash(password: string): Promise<string> {
    return Promise.resolve(`hashed:${password}`);
  }
  public verify(hash: string, password: string): Promise<boolean> {
    return Promise.resolve(hash === `hashed:${password}`);
  }
  public verifyDummy(_password: string): Promise<void> {
    void _password;
    return Promise.resolve();
  }
}

export class FakeAuditRepository implements AuditRepository {
  public readonly events: AuditEvent[] = [];
  public record(event: AuditEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}

export class FakeAuthRepository implements AuthRepository {
  public user: LoginUser | null = { ...defaultUser };
  public failedAttempts = 0;
  public lockAtAttempt = 5;
  public readonly authEvents: AuthenticationEvent[] = [];
  public readonly sessions = new Map<string, AuthenticatedSession>();
  public readonly allTokenSessions = new Map<string, AuthenticatedSession>();
  public readonly revokedTokenHashes = new Set<string>();
  public revoked = false;
  public revokedAll = false;
  public createdAdminInput: CreateAdminInput | null = null;

  public findUserByIdentifier(identifier: string): Promise<LoginUser | null> {
    if (!this.user || ![this.user.username, this.user.email].includes(identifier)) return Promise.resolve(null);
    return Promise.resolve({ ...this.user, failedLoginAttempts: this.failedAttempts });
  }
  public findUserById(userId: string): Promise<LoginUser | null> {
    return Promise.resolve(this.user?.id === userId ? { ...this.user, failedLoginAttempts: this.failedAttempts } : null);
  }
  public registerFailedAttempt(_userId: string, maximumAttempts: number, lockMinutes: number): Promise<Date | null> {
    this.failedAttempts += 1;
    if (this.failedAttempts < Math.min(maximumAttempts, this.lockAtAttempt)) return Promise.resolve(null);
    return Promise.resolve(new Date(Date.now() + lockMinutes * 60_000));
  }
  public resetFailedAttempts(_userId: string): Promise<void> {
    void _userId;
    this.failedAttempts = 0;
    return Promise.resolve();
  }
  public createSession(input: CreateSessionInput): Promise<string> {
    if (!this.user) throw new Error("fake user missing");
    const id = String(this.sessions.size + 1);
    const session = { id, user: safeUser(this.user), expiresAt: input.expiresAt };
    this.sessions.set(input.tokenHash.toString("hex"), session);
    this.allTokenSessions.set(input.tokenHash.toString("hex"), session);
    return Promise.resolve(id);
  }
  public findSession(tokenHash: Buffer): Promise<AuthenticatedSession | null> {
    return Promise.resolve(this.sessions.get(tokenHash.toString("hex")) ?? null);
  }
  public getSessionState(tokenHash: Buffer) {
    const key = tokenHash.toString("hex");
    if (this.revokedTokenHashes.has(key)) return Promise.resolve({ status: "REVOKED" as const });
    if (this.user?.status !== "ACTIVE") return Promise.resolve({ status: "ACCOUNT_DISABLED" as const });
    const session = this.sessions.get(key);
    return Promise.resolve(session ? { status: "ACTIVE" as const, session } : { status: "NOT_FOUND" as const });
  }
  public touchSession(_sessionId: string, _idleExpiresAt: Date): Promise<void> {
    void _sessionId;
    void _idleExpiresAt;
    return Promise.resolve();
  }
  public revokeSession(_sessionId: string, _userId: string, _reason: string): Promise<void> {
    void _sessionId;
    void _userId;
    void _reason;
    this.revoked = true;
    this.sessions.clear();
    return Promise.resolve();
  }
  public revokeAllSessions(_userId: string, _reason: string): Promise<void> {
    void _userId;
    void _reason;
    this.revokedAll = true;
    this.sessions.clear();
    return Promise.resolve();
  }
  public revokeSessionByTokenHash(tokenHash: Buffer, _reason: string) {
    void _reason;
    const key = tokenHash.toString("hex");
    const session = this.allTokenSessions.get(key);
    if (!session) return Promise.resolve(null);
    const changed = !this.revokedTokenHashes.has(key);
    this.revokedTokenHashes.add(key);
    this.sessions.delete(key);
    this.revoked = true;
    return Promise.resolve({ id: session.id, userId: session.user.id, revokedAt: null, changed });
  }
  public listSessions(userId: string, currentSessionId: string): Promise<SessionSummary[]> {
    return Promise.resolve([...this.allTokenSessions.values()].filter((item) => item.user.id === userId).map((item) => ({
      id: item.id, ipAddress: "127.0.0.1", userAgent: "vitest", createdAt: new Date(), lastSeenAt: new Date(),
      idleExpiresAt: item.expiresAt, expiresAt: item.expiresAt, revokedAt: null, revokeReason: null, current: item.id === currentSessionId,
    })));
  }
  public findStoredSession(sessionId: string) {
    const session = [...this.allTokenSessions.values()].find((item) => item.id === sessionId);
    return Promise.resolve(session ? { id: session.id, userId: session.user.id, revokedAt: null } : null);
  }
  public revokeSessionAsActor(sessionId: string, _actorUserId: string, _reason: string): Promise<boolean> {
    void _actorUserId;
    void _reason;
    const entry = [...this.allTokenSessions.entries()].find(([, item]) => item.id === sessionId);
    if (!entry) return Promise.resolve(false);
    const [key] = entry;
    const changed = !this.revokedTokenHashes.has(key);
    this.revokedTokenHashes.add(key);
    this.sessions.delete(key);
    this.revoked = true;
    return Promise.resolve(changed);
  }
  public changePassword(userId: string, currentSessionId: string, passwordHash: string): Promise<void> {
    if (this.user?.id === userId) this.user.passwordHash = passwordHash;
    for (const [key, session] of this.sessions) if (session.id !== currentSessionId) this.sessions.delete(key);
    return Promise.resolve();
  }
  public resetPassword(userId: string, passwordHash: string): Promise<void> {
    if (this.user?.id === userId) this.user.passwordHash = passwordHash;
    this.sessions.clear();
    return Promise.resolve();
  }
  public cleanupExpiredSessions(): Promise<number> { return Promise.resolve(0); }
  public recordAuthenticationEvent(event: AuthenticationEvent): Promise<void> {
    this.authEvents.push(event);
    return Promise.resolve();
  }
  public createAdmin(input: CreateAdminInput): Promise<AuthenticatedUser> {
    this.createdAdminInput = input;
    return Promise.resolve({ ...safeUser(defaultUser), username: input.username, email: input.email, firstName: input.firstName, lastName: input.lastName });
  }
}

function safeUser(user: LoginUser): AuthenticatedUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roles: user.roles,
    permissions: user.permissions,
    mustChangePassword: user.mustChangePassword,
  };
}
