import { randomUUID } from "node:crypto";
import express from "express";
import pino from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import type { AppContainer } from "../../src/bootstrap/container.js";
import { parseEnv } from "../../src/config/env.js";
import { LoginUseCase } from "../../src/modules/auth/application/LoginUseCase.js";
import { LogoutAllUseCase, LogoutUseCase } from "../../src/modules/auth/application/LogoutUseCase.js";
import { ChangePasswordUseCase } from "../../src/modules/auth/application/PasswordUseCases.js";
import { ListSessionsUseCase, RevokeSessionUseCase } from "../../src/modules/auth/application/SessionUseCases.js";
import { AuthController } from "../../src/modules/auth/http/auth.controller.js";
import { authorize } from "../../src/shared/http/authorize.js";
import { HttpError } from "../../src/shared/http/HttpError.js";
import { FakeAuditRepository, FakeAuthRepository, FakePasswordHasher, defaultUser, testPassword } from "../support/fakes.js";

function testEnv(nodeEnv: "test" | "production" = "test") {
  return parseEnv({
    NODE_ENV: nodeEnv,
    DB_HOST: "127.0.0.1",
    DB_NAME: "pmt_multas",
    DB_USER: "test",
    DB_PASSWORD: randomUUID(),
    CORS_ORIGINS: "http://localhost:5173",
    SESSION_SAME_SITE: "lax",
    LOG_LEVEL: "silent",
  });
}

function testContainer(options: { nodeEnv?: "test" | "production"; pingFails?: boolean } = {}) {
  const env = testEnv(options.nodeEnv);
  const authRepository = new FakeAuthRepository();
  const auditRepository = new FakeAuditRepository();
  const passwordHasher = new FakePasswordHasher();
  const authController = new AuthController(
    new LoginUseCase(authRepository, auditRepository, passwordHasher, env),
    new LogoutUseCase(authRepository, auditRepository),
    new LogoutAllUseCase(authRepository, auditRepository),
    new ListSessionsUseCase(authRepository),
    new RevokeSessionUseCase(authRepository, auditRepository),
    new ChangePasswordUseCase(authRepository, auditRepository, passwordHasher),
    env,
  );
  const container = {
    env,
    logger: pino({ level: "silent" }),
    database: {
      ping: () => options.pingFails ? Promise.reject(new Error("down")) : Promise.resolve(),
      close: () => Promise.resolve(),
    },
    schema: { inspect: () => Promise.resolve({ database: "pmt_multas", checkedAt: new Date().toISOString(), totalTables: 20, differences: [], baselineVersions: ["001", "002", "003"], matches: true }) },
    authRepository,
    auditRepository,
    passwordHasher,
    authController,
  } as unknown as AppContainer;
  return { container, authRepository, auditRepository };
}

describe("API REST de autenticación y sistema", () => {
  it("readiness devuelve 503 cuando MySQL no está disponible", async () => {
    const { container } = testContainer({ pingFails: true });
    const response = await request(createApp(container)).get("/api/v1/system/readiness");
    expect(response.status).toBe(503);
    expect((response.body as { error: { code: string } }).error.code).toBe("SYSTEM_NOT_READY");
  });

  it("configura una cookie HttpOnly, SameSite y Secure en producción", async () => {
    const { container } = testContainer({ nodeEnv: "production" });
    const response = await request(createApp(container)).post("/api/v1/auth/login").send({ identifier: "admin", password: testPassword });
    const cookie = response.headers["set-cookie"]?.[0] ?? "";
    expect(response.status).toBe(200);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(response.body).not.toHaveProperty("sessionToken");
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
  });

  it("GET /auth/me exige sesión y devuelve el usuario autenticado", async () => {
    const { container } = testContainer();
    const app = createApp(container);
    const anonymous = await request(app).get("/api/v1/auth/me");
    expect(anonymous.status).toBe(401);
    const login = await request(app).post("/api/v1/auth/login").send({ identifier: "admin", password: testPassword });
    const cookie = login.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
    const authenticated = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
    expect(authenticated.status).toBe(200);
    expect((authenticated.body as { data: { user: unknown } }).data.user).toMatchObject({ username: "admin", roles: ["ADMIN"] });
  });

  it("logout revoca la sesión y deja auditoría", async () => {
    const { container, authRepository, auditRepository } = testContainer();
    const app = createApp(container);
    const login = await request(app).post("/api/v1/auth/login").send({ identifier: "admin", password: testPassword });
    const cookie = login.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
    const logout = await request(app).post("/api/v1/auth/logout").set("Cookie", cookie);
    expect(logout.status).toBe(204);
    const repeated = await request(app).post("/api/v1/auth/logout").set("Cookie", cookie);
    expect(repeated.status).toBe(204);
    expect(authRepository.revoked).toBe(true);
    expect(auditRepository.events.at(-1)).toMatchObject({ action: "LOGOUT", outcome: "SUCCESS" });
  });

  it("un permiso insuficiente devuelve 403", async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.auth = { id: "1", expiresAt: new Date(Date.now() + 60_000), user: { ...defaultUser, permissions: [] } };
      next();
    });
    app.get("/restricted", authorize("users.create", new FakeAuditRepository()), (_req, res) => res.sendStatus(204));
    app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      void _next;
      res.status(error instanceof HttpError ? error.statusCode : 500).json({ code: error instanceof HttpError ? error.code : "ERROR" });
    });
    const response = await request(app).get("/restricted");
    expect(response.status).toBe(403);
    expect((response.body as { code: string }).code).toBe("AUTH_FORBIDDEN");
  });

  it("health confirma que el proceso está vivo sin consultar MySQL", async () => {
    const { container } = testContainer({ pingFails: true });
    const response = await request(createApp(container)).get("/api/v1/system/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ data: { status: "UP", service: "multas-backend" } });
  });

  it("login incorrecto devuelve respuesta genérica con requestId", async () => {
    const { container } = testContainer();
    const response = await request(createApp(container)).post("/api/v1/auth/login")
      .send({ identifier: "admin", password: `${testPassword}-incorrecta` });
    expect(response.status).toBe(401);
    const body = response.body as { error: { code: string }; meta: { requestId: string } };
    expect(body.error.code).toBe("AUTH_INVALID_CREDENTIALS");
    expect(typeof body.meta.requestId).toBe("string");
    expect(JSON.stringify(response.body)).not.toContain(testPassword);
  });

  it("lista y revoca individualmente una sesión propia", async () => {
    const { container } = testContainer();
    const app = createApp(container);
    const login = await request(app).post("/api/v1/auth/login").send({ identifier: "admin", password: testPassword });
    const cookie = login.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
    const listed = await request(app).get("/api/v1/auth/sessions").set("Cookie", cookie);
    const sessionId = (listed.body as { data: { sessions: { id: string; current: boolean }[] } }).data.sessions[0]?.id;
    expect(listed.status).toBe(200);
    expect(sessionId).toBeDefined();
    const revoked = await request(app).delete(`/api/v1/auth/sessions/${sessionId}`).set("Cookie", cookie);
    expect(revoked.status).toBe(204);
    const denied = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
    expect(denied.status).toBe(401);
    expect(denied.body).toMatchObject({ error: { code: "AUTH_SESSION_REVOKED" } });
  });

  it("change-password conserva la sesión actual y registra el cambio", async () => {
    const { container, auditRepository } = testContainer();
    const app = createApp(container);
    const login = await request(app).post("/api/v1/auth/login").send({ identifier: "admin", password: testPassword });
    const cookie = login.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
    const changed = await request(app).post("/api/v1/auth/change-password").set("Cookie", cookie)
      .send({ currentPassword: testPassword, newPassword: `${testPassword}N!` });
    expect(changed.status).toBe(204);
    expect(auditRepository.events.at(-1)).toMatchObject({ action: "PASSWORD_CHANGED" });
    expect((await request(app).get("/api/v1/auth/me").set("Cookie", cookie)).status).toBe(200);
  });

  it("una cuenta deshabilitada pierde acceso aunque conserve cookie", async () => {
    const { container, authRepository } = testContainer();
    const app = createApp(container);
    const login = await request(app).post("/api/v1/auth/login").send({ identifier: "admin", password: testPassword });
    const cookie = login.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
    if (authRepository.user) authRepository.user.status = "DISABLED";
    const response = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: "AUTH_ACCOUNT_DISABLED" } });
  });
});
