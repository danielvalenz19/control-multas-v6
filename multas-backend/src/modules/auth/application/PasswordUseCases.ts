import type { AuditRepository } from "../../audit/application/AuditRepository.js";
import { HttpError } from "../../../shared/http/HttpError.js";
import type { AuthRepository, PasswordHasher, RequestMetadata } from "./AuthRepository.js";

export type ChangePasswordInput = RequestMetadata & {
  userId: string;
  sessionId: string;
  currentPassword: string;
  newPassword: string;
  requestId: string;
};

export class ChangePasswordUseCase {
  public constructor(
    private readonly repository: AuthRepository,
    private readonly audit: AuditRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  public async execute(input: ChangePasswordInput): Promise<void> {
    const user = await this.repository.findUserById(input.userId);
    if (!user || !(await this.passwordHasher.verify(user.passwordHash, input.currentPassword))) {
      throw new HttpError({ code: "AUTH_INVALID_CURRENT_PASSWORD", message: "La contraseña actual no es correcta.", statusCode: 401 });
    }
    if (await this.passwordHasher.verify(user.passwordHash, input.newPassword)) {
      throw new HttpError({ code: "AUTH_PASSWORD_REUSED", message: "La contraseña nueva debe ser diferente.", statusCode: 400 });
    }
    await this.repository.changePassword(user.id, input.sessionId, await this.passwordHasher.hash(input.newPassword));
    await this.repository.recordAuthenticationEvent({
      userId: user.id, identifierMasked: null, eventType: "PASSWORD_CHANGE", outcome: "SUCCESS",
      ipAddress: input.ipAddress, userAgent: input.userAgent,
    });
    await this.audit.record({
      actorUserId: user.id, actorSessionId: input.sessionId, action: "PASSWORD_CHANGED", module: "auth",
      entityType: "user", entityId: user.id, outcome: "SUCCESS", requestId: input.requestId,
      ipAddress: input.ipAddress, userAgent: input.userAgent,
    });
  }
}

export class ResetAdminPasswordUseCase {
  public constructor(
    private readonly repository: AuthRepository,
    private readonly audit: AuditRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  public async execute(identifier: string, newPassword: string): Promise<void> {
    const user = await this.repository.findUserByIdentifier(identifier.trim().toLowerCase());
    if (!user?.roles.includes("ADMIN")) {
      throw new HttpError({ code: "ADMIN_NOT_FOUND", message: "No existe el administrador indicado.", statusCode: 404 });
    }
    if (await this.passwordHasher.verify(user.passwordHash, newPassword)) {
      throw new HttpError({ code: "AUTH_PASSWORD_REUSED", message: "La contraseña nueva debe ser diferente.", statusCode: 400 });
    }
    await this.repository.resetPassword(user.id, await this.passwordHasher.hash(newPassword));
    await this.repository.recordAuthenticationEvent({
      userId: user.id, identifierMasked: null, eventType: "PASSWORD_RESET", outcome: "SUCCESS",
      ipAddress: null, userAgent: "npm run admin:reset-password",
    });
    await this.audit.record({
      actorUserId: user.id, actorSessionId: null, action: "PASSWORD_RESET_BY_ADMIN", module: "auth",
      entityType: "user", entityId: user.id, outcome: "SUCCESS", reason: "Restablecimiento interactivo local",
      ipAddress: null, userAgent: "npm run admin:reset-password",
    });
  }
}
