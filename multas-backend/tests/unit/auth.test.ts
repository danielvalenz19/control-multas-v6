import { describe, expect, it } from "vitest";
import { Argon2PasswordHasher } from "../../src/modules/auth/infrastructure/Argon2PasswordHasher.js";
import { LoginUseCase } from "../../src/modules/auth/application/LoginUseCase.js";
import { CreateAdminUseCase } from "../../src/modules/auth/application/CreateAdminUseCase.js";
import { ChangePasswordUseCase, ResetAdminPasswordUseCase } from "../../src/modules/auth/application/PasswordUseCases.js";
import { LogoutAllUseCase } from "../../src/modules/auth/application/LogoutUseCase.js";
import { FakeAuditRepository, FakeAuthRepository, FakePasswordHasher, testPassword } from "../support/fakes.js";

const env = { LOGIN_MAX_ATTEMPTS: 3, LOGIN_LOCK_MINUTES: 15, SESSION_IDLE_MINUTES: 30, SESSION_TTL_HOURS: 12 };
const input = { identifier: "admin", password: testPassword, ipAddress: "127.0.0.1", userAgent: "vitest", requestId: "request-1" };

describe("autenticación", () => {
  it("almacena contraseñas como Argon2id y verifica el secreto", async () => {
    const hasher = new Argon2PasswordHasher();
    const hash = await hasher.hash(testPassword);
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(hasher.verify(hash, testPassword)).resolves.toBe(true);
    await expect(hasher.verify(hash, `${testPassword}-incorrecta`)).resolves.toBe(false);
  });

  it("crea el administrador sin entregar la contraseña al repositorio", async () => {
    const repository = new FakeAuthRepository();
    const audit = new FakeAuditRepository();
    const useCase = new CreateAdminUseCase(repository, audit, new FakePasswordHasher());
    const user = await useCase.execute({ username: "root-admin", email: null, firstName: "Ada", lastName: "Admin", password: testPassword });
    expect(user.username).toBe("root-admin");
    expect(repository.createdAdminInput?.passwordHash).toBe(`hashed:${testPassword}`);
    expect(repository.createdAdminInput).not.toHaveProperty("password");
    expect(audit.events[0]).toMatchObject({ action: "ADMIN_CREATED", outcome: "SUCCESS" });
  });

  it("inicia sesión, crea una sesión opaca y audita el acceso", async () => {
    const repository = new FakeAuthRepository();
    const audit = new FakeAuditRepository();
    const result = await new LoginUseCase(repository, audit, new FakePasswordHasher(), env).execute(input);
    expect(result.sessionToken).toMatch(/^[a-zA-Z0-9_-]{43}$/);
    expect(repository.sessions.size).toBe(1);
    expect(repository.authEvents.at(-1)).toMatchObject({ eventType: "LOGIN", outcome: "SUCCESS" });
    expect(audit.events.at(-1)).toMatchObject({ action: "LOGIN_SUCCEEDED", outcome: "SUCCESS" });
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("rechaza una contraseña incorrecta y registra el fallo", async () => {
    const repository = new FakeAuthRepository();
    const audit = new FakeAuditRepository();
    await expect(new LoginUseCase(repository, audit, new FakePasswordHasher(), env).execute({ ...input, password: `${testPassword}-wrong` }))
      .rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS", statusCode: 401 });
    expect(repository.failedAttempts).toBe(1);
    expect(repository.authEvents[0]).toMatchObject({ outcome: "FAILURE", failureCode: "AUTH_INVALID_CREDENTIALS" });
  });

  it("bloquea temporalmente al alcanzar el máximo de intentos", async () => {
    const repository = new FakeAuthRepository();
    repository.lockAtAttempt = 3;
    const useCase = new LoginUseCase(repository, new FakeAuditRepository(), new FakePasswordHasher(), env);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(useCase.execute({ ...input, password: `${testPassword}-wrong` })).rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
    }
    await expect(useCase.execute({ ...input, password: `${testPassword}-wrong` })).rejects.toMatchObject({ code: "AUTH_ACCOUNT_LOCKED", statusCode: 423 });
    expect(repository.authEvents.at(-1)).toMatchObject({ outcome: "BLOCKED" });
    expect((useCase as unknown)).toBeDefined();
  });

  it("responde igual para un usuario inexistente sin revelar existencia", async () => {
    const repository = new FakeAuthRepository();
    repository.user = null;
    await expect(new LoginUseCase(repository, new FakeAuditRepository(), new FakePasswordHasher(), env).execute(input))
      .rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS", statusCode: 401 });
  });

  it("rechaza una cuenta deshabilitada", async () => {
    const repository = new FakeAuthRepository();
    if (repository.user) repository.user.status = "DISABLED";
    await expect(new LoginUseCase(repository, new FakeAuditRepository(), new FakePasswordHasher(), env).execute(input))
      .rejects.toMatchObject({ code: "AUTH_ACCOUNT_DISABLED", statusCode: 403 });
  });

  it("cambia la contraseña y registra PASSWORD_CHANGED", async () => {
    const repository = new FakeAuthRepository();
    const audit = new FakeAuditRepository();
    await new ChangePasswordUseCase(repository, audit, new FakePasswordHasher()).execute({
      userId: "1", sessionId: "1", currentPassword: testPassword, newPassword: `${testPassword}N!`,
      requestId: "request-2", ipAddress: "127.0.0.1", userAgent: "vitest",
    });
    expect(repository.user?.passwordHash).toBe(`hashed:${testPassword}N!`);
    expect(audit.events.at(-1)).toMatchObject({ action: "PASSWORD_CHANGED" });
  });

  it("restablece contraseña de ADMIN, revoca sesiones y audita", async () => {
    const repository = new FakeAuthRepository();
    const audit = new FakeAuditRepository();
    await new ResetAdminPasswordUseCase(repository, audit, new FakePasswordHasher()).execute("admin", `${testPassword}R!`);
    expect(repository.sessions.size).toBe(0);
    expect(audit.events.at(-1)).toMatchObject({ action: "PASSWORD_RESET_BY_ADMIN" });
  });

  it("logout-all revoca todas las sesiones y registra su acción", async () => {
    const repository = new FakeAuthRepository();
    const audit = new FakeAuditRepository();
    await new LogoutAllUseCase(repository, audit).execute({
      userId: "1", sessionId: "1", requestId: "request-3", ipAddress: null, userAgent: "vitest",
    });
    expect(repository.revokedAll).toBe(true);
    expect(audit.events.at(-1)).toMatchObject({ action: "LOGOUT_ALL" });
  });
});
