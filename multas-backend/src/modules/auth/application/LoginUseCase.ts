import { createHash, randomBytes } from "node:crypto";
import type { Env } from "../../../config/env.js";
import type { AuditRepository } from "../../audit/application/AuditRepository.js";
import { HttpError } from "../../../shared/http/HttpError.js";
import type { AuthenticatedUser, SessionToken } from "../domain/Session.js";
import type { AuthRepository, PasswordHasher, RequestMetadata } from "./AuthRepository.js";

export type LoginInput = RequestMetadata & {
  identifier: string;
  password: string;
  requestId: string;
};

export type LoginOutput = {
  sessionId: string;
  sessionToken: string;
  expiresAt: Date;
  user: AuthenticatedUser;
};

export class LoginUseCase {
  public constructor(
    private readonly repository: AuthRepository,
    private readonly audit: AuditRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly env: Pick<Env, "LOGIN_MAX_ATTEMPTS" | "LOGIN_LOCK_MINUTES" | "SESSION_IDLE_MINUTES" | "SESSION_TTL_HOURS">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async execute(input: LoginInput): Promise<LoginOutput> {
    const identifier = input.identifier.trim().toLowerCase();
    const masked = maskIdentifier(identifier);
    const user = await this.repository.findUserByIdentifier(identifier);
    if (!user) {
      await this.passwordHasher.verifyDummy(input.password);
      await this.recordFailure(input, null, masked, "AUTH_INVALID_CREDENTIALS", "FAILURE");
      throw invalidCredentials();
    }

    const now = this.now();
    if (user.status === "DISABLED") {
      await this.recordFailure(input, user.id, masked, "AUTH_ACCOUNT_DISABLED", "BLOCKED");
      throw new HttpError({
        code: "AUTH_ACCOUNT_DISABLED",
        message: "La cuenta no está habilitada.",
        statusCode: 403,
      });
    }
    if (user.status === "LOCKED" || (user.lockedUntil !== null && user.lockedUntil > now)) {
      await this.recordFailure(input, user.id, masked, "AUTH_ACCOUNT_LOCKED", "BLOCKED");
      throw new HttpError({ code: "AUTH_ACCOUNT_LOCKED", message: "La cuenta está bloqueada.", statusCode: 423 });
    }

    const passwordValid = await this.passwordHasher.verify(user.passwordHash, input.password);
    if (!passwordValid) {
      const lockedUntil = await this.repository.registerFailedAttempt(
        user.id,
        this.env.LOGIN_MAX_ATTEMPTS,
        this.env.LOGIN_LOCK_MINUTES,
      );
      await this.recordFailure(
        input,
        user.id,
        masked,
        lockedUntil ? "AUTH_ACCOUNT_LOCKED" : "AUTH_INVALID_CREDENTIALS",
        lockedUntil ? "BLOCKED" : "FAILURE",
      );
      if (lockedUntil) {
        throw new HttpError({
          code: "AUTH_ACCOUNT_LOCKED",
          message: "La cuenta fue bloqueada temporalmente por intentos fallidos.",
          statusCode: 423,
          details: { lockedUntil: lockedUntil.toISOString() },
        });
      }
      throw invalidCredentials();
    }

    const token = createSessionToken();
    const idleExpiresAt = new Date(now.getTime() + this.env.SESSION_IDLE_MINUTES * 60_000);
    const expiresAt = new Date(now.getTime() + this.env.SESSION_TTL_HOURS * 3_600_000);
    const sessionId = await this.repository.createSession({
      userId: user.id,
      tokenHash: token.hash,
      sessionVersion: user.sessionVersion,
      idleExpiresAt,
      expiresAt,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    await this.repository.resetFailedAttempts(user.id);
    await this.repository.recordAuthenticationEvent({
      userId: user.id,
      identifierMasked: masked,
      eventType: "LOGIN",
      outcome: "SUCCESS",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    await this.audit.record({
      actorUserId: user.id,
      actorSessionId: sessionId,
      action: "LOGIN_SUCCEEDED",
      module: "auth",
      entityType: "user_session",
      entityId: sessionId,
      outcome: "SUCCESS",
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    const safeUser: AuthenticatedUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles,
      permissions: user.permissions,
      mustChangePassword: user.mustChangePassword,
    };
    return { sessionId, sessionToken: token.raw, expiresAt, user: safeUser };
  }

  private async recordFailure(
    input: LoginInput,
    userId: string | null,
    identifierMasked: string,
    failureCode: string,
    outcome: "FAILURE" | "BLOCKED",
  ): Promise<void> {
    await this.repository.recordAuthenticationEvent({
      userId,
      identifierMasked,
      eventType: "LOGIN",
      outcome,
      failureCode,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    await this.audit.record({
      actorUserId: userId,
      actorSessionId: null,
      action: failureCode === "AUTH_ACCOUNT_LOCKED" ? "ACCOUNT_LOCKED" : "LOGIN_FAILED",
      module: "auth",
      entityType: "user",
      entityId: userId,
      outcome: outcome === "BLOCKED" ? "DENIED" : "FAILURE",
      reason: failureCode,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }
}

function createSessionToken(): SessionToken {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: createHash("sha256").update(raw).digest() };
}

export function hashSessionToken(raw: string): Buffer {
  return createHash("sha256").update(raw).digest();
}

function maskIdentifier(identifier: string): string {
  const at = identifier.indexOf("@");
  if (at > 0) return `${identifier.slice(0, 1)}***${identifier.slice(at)}`;
  return `${identifier.slice(0, 2)}***`;
}

function invalidCredentials(): HttpError {
  return new HttpError({ code: "AUTH_INVALID_CREDENTIALS", message: "Usuario o contraseña incorrectos.", statusCode: 401 });
}
