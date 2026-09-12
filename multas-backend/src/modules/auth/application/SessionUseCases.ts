import type { AuditRepository } from "../../audit/application/AuditRepository.js";
import { HttpError } from "../../../shared/http/HttpError.js";
import type { AuthenticatedSession } from "../domain/Session.js";
import type { AuthRepository, RequestMetadata, SessionSummary } from "./AuthRepository.js";

export class ListSessionsUseCase {
  public constructor(private readonly repository: AuthRepository) {}
  public execute(session: AuthenticatedSession): Promise<SessionSummary[]> {
    return this.repository.listSessions(session.user.id, session.id);
  }
}

export type RevokeSessionInput = RequestMetadata & {
  actor: AuthenticatedSession;
  targetSessionId: string;
  requestId: string;
};

export class RevokeSessionUseCase {
  public constructor(private readonly repository: AuthRepository, private readonly audit: AuditRepository) {}

  public async execute(input: RevokeSessionInput): Promise<{ revokedCurrent: boolean }> {
    const target = await this.repository.findStoredSession(input.targetSessionId);
    if (!target) throw new HttpError({ code: "AUTH_SESSION_NOT_FOUND", message: "La sesión no existe.", statusCode: 404 });
    const isOwner = target.userId === input.actor.user.id;
    const canRevokeAny = input.actor.user.roles.includes("ADMIN") && input.actor.user.permissions.includes("auth.sessions.revoke_own");
    if (!isOwner && !canRevokeAny) {
      await this.audit.record({
        actorUserId: input.actor.user.id, actorSessionId: input.actor.id, action: "ACCESS_DENIED", module: "auth",
        entityType: "user_session", entityId: target.id, outcome: "DENIED", reason: "auth.sessions.revoke_any",
        requestId: input.requestId, ipAddress: input.ipAddress, userAgent: input.userAgent,
      });
      throw new HttpError({ code: "AUTH_FORBIDDEN", message: "No tiene permiso para revocar esta sesión.", statusCode: 403 });
    }
    const changed = await this.repository.revokeSessionAsActor(target.id, input.actor.user.id, "Revocación individual solicitada");
    if (changed) {
      await this.repository.recordAuthenticationEvent({
        userId: target.userId, identifierMasked: null, eventType: "SESSION_REVOKE", outcome: "SUCCESS",
        ipAddress: input.ipAddress, userAgent: input.userAgent,
      });
      await this.audit.record({
        actorUserId: input.actor.user.id, actorSessionId: input.actor.id, action: "SESSION_REVOKED", module: "auth",
        entityType: "user_session", entityId: target.id, outcome: "SUCCESS", requestId: input.requestId,
        ipAddress: input.ipAddress, userAgent: input.userAgent,
      });
    }
    return { revokedCurrent: target.id === input.actor.id };
  }
}
