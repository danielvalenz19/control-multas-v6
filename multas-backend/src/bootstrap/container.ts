import { createDatabasePool } from "../config/database.js";
import type { Env } from "../config/env.js";
import { createLogger } from "../config/logger.js";
import { MySqlAuditRepository } from "../modules/audit/infrastructure/MySqlAuditRepository.js";
import { LoginUseCase } from "../modules/auth/application/LoginUseCase.js";
import { LogoutAllUseCase, LogoutUseCase } from "../modules/auth/application/LogoutUseCase.js";
import { ChangePasswordUseCase } from "../modules/auth/application/PasswordUseCases.js";
import { ListSessionsUseCase, RevokeSessionUseCase } from "../modules/auth/application/SessionUseCases.js";
import { Argon2PasswordHasher } from "../modules/auth/infrastructure/Argon2PasswordHasher.js";
import { MySqlAuthRepository } from "../modules/auth/infrastructure/MySqlAuthRepository.js";
import { AuthController } from "../modules/auth/http/auth.controller.js";
import { MySqlConnection } from "../shared/infrastructure/mysql/MySqlConnection.js";
import { RbacInspector } from "../shared/infrastructure/mysql/RbacInspector.js";
import { SchemaInspector } from "../shared/infrastructure/mysql/SchemaInspector.js";
import { NotificationService } from "../modules/notifications/application/NotificationService.js";
import { HistoricalMigrationService } from "../modules/historical-migrations/application/HistoricalMigrationService.js";

export function createContainer(env: Env) {
  const logger = createLogger(env);
  const database = new MySqlConnection(createDatabasePool(env));
  const authRepository = new MySqlAuthRepository(database);
  const auditRepository = new MySqlAuditRepository(database);
  const passwordHasher = new Argon2PasswordHasher();
  const loginUseCase = new LoginUseCase(authRepository, auditRepository, passwordHasher, env);
  const logoutUseCase = new LogoutUseCase(authRepository, auditRepository);
  const logoutAllUseCase = new LogoutAllUseCase(authRepository, auditRepository);
  const listSessionsUseCase = new ListSessionsUseCase(authRepository);
  const revokeSessionUseCase = new RevokeSessionUseCase(authRepository, auditRepository);
  const changePasswordUseCase = new ChangePasswordUseCase(authRepository, auditRepository, passwordHasher);
  const notifications = new NotificationService(database);
  const historicalMigrations = new HistoricalMigrationService(database, env.HISTORICAL_MIGRATION_DIR, env.HISTORICAL_MIGRATION_MAX_BYTES, env.HISTORICAL_MIGRATION_RETENTION_DAYS);
  return {
    env,
    logger,
    database,
    schema: new SchemaInspector(database, env.DB_NAME),
    rbac: new RbacInspector(database),
    authRepository,
    auditRepository,
    passwordHasher,
    notifications,
    historicalMigrations,
    authController: new AuthController(
      loginUseCase,
      logoutUseCase,
      logoutAllUseCase,
      listSessionsUseCase,
      revokeSessionUseCase,
      changePasswordUseCase,
      env,
    ),
  };
}

export type AppContainer = ReturnType<typeof createContainer>;
