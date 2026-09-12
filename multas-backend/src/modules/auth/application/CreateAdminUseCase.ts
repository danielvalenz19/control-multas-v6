import type { AuditRepository } from "../../audit/application/AuditRepository.js";
import type { AuthenticatedUser } from "../domain/Session.js";
import type { AuthRepository, PasswordHasher } from "./AuthRepository.js";

export type CreateAdminCommand = {
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  password: string;
};

export class CreateAdminUseCase {
  public constructor(
    private readonly repository: AuthRepository,
    private readonly audit: AuditRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  public async execute(command: CreateAdminCommand): Promise<AuthenticatedUser> {
    const user = await this.repository.createAdmin({
      username: command.username,
      email: command.email,
      firstName: command.firstName,
      lastName: command.lastName,
      passwordHash: await this.passwordHasher.hash(command.password),
    });
    await this.audit.record({
      actorUserId: user.id,
      actorSessionId: null,
      action: "ADMIN_CREATED",
      module: "auth",
      entityType: "user",
      entityId: user.id,
      outcome: "SUCCESS",
      reason: "Creación interactiva del primer administrador",
      ipAddress: null,
      userAgent: "npm run admin:create",
    });
    return user;
  }
}
