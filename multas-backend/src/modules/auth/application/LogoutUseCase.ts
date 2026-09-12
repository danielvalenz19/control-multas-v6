import type { AuditRepository } from "../../audit/application/AuditRepository.js";
import { hashSessionToken } from "./LoginUseCase.js";
import type { AuthRepository, RequestMetadata } from "./AuthRepository.js";

export type LogoutInput = RequestMetadata & { sessionToken: string | null; requestId: string };
export type LogoutAllInput = RequestMetadata & { sessionId: string; userId: string; requestId: string };

export class LogoutUseCase {
  public constructor(private readonly repository: AuthRepository, private readonly audit: AuditRepository) {}

  public async execute(input: LogoutInput): Promise<void> {
    if (!input.sessionToken || !/^[a-zA-Z0-9_-]{43}$/.test(input.sessionToken)) return;
    const session = await this.repository.revokeSessionByTokenHash(
      hashSessionToken(input.sessionToken),
      "Cierre de sesión solicitado por el usuario",
    );
    if (!session?.changed) return;
    await this.repository.recordAuthenticationEvent({
      userId: session.userId, identifierMasked: null, eventType: "LOGOUT", outcome: "SUCCESS",
      ipAddress: input.ipAddress, userAgent: input.userAgent,
    });
    await this.audit.record({
      actorUserId: session.userId, actorSessionId: session.id, action: "LOGOUT", module: "auth",
      entityType: "user_session", entityId: session.id, outcome: "SUCCESS", requestId: input.requestId,
      ipAddress: input.ipAddress, userAgent: input.userAgent,
    });
  }
}

export class LogoutAllUseCase {
  public constructor(private readonly repository: AuthRepository, private readonly audit: AuditRepository) {}

  public async execute(input: LogoutAllInput): Promise<void> {
    await this.repository.revokeAllSessions(input.userId, "Revocación de todas las sesiones solicitada por el usuario");
    await this.repository.recordAuthenticationEvent({
      userId: input.userId, identifierMasked: null, eventType: "SESSION_REVOKE", outcome: "SUCCESS",
      ipAddress: input.ipAddress, userAgent: input.userAgent,
    });
    await this.audit.record({
      actorUserId: input.userId, actorSessionId: input.sessionId, action: "LOGOUT_ALL", module: "auth",
      entityType: "user", entityId: input.userId, outcome: "SUCCESS", requestId: input.requestId,
      ipAddress: input.ipAddress, userAgent: input.userAgent,
    });
  }
}
