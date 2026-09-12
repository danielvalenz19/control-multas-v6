import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { AuthRepository } from "../application/AuthRepository.js";
import type { AuthController } from "./auth.controller.js";
import type { Env } from "../../../config/env.js";
import { authenticate } from "../../../shared/http/authenticate.js";
import { authorize } from "../../../shared/http/authorize.js";
import { HttpError } from "../../../shared/http/HttpError.js";
import type { AuditRepository } from "../../audit/application/AuditRepository.js";

export function createAuthRouter(
  controller: AuthController,
  repository: AuthRepository,
  audit: AuditRepository,
  env: Pick<Env, "NODE_ENV" | "SESSION_COOKIE_NAME" | "SESSION_IDLE_MINUTES" | "LOGIN_RATE_LIMIT_WINDOW_MS" | "LOGIN_RATE_LIMIT_MAX">,
): Router {
  const router = Router();
  const requireSession = authenticate(repository, env);
  const loginLimiter = rateLimit({
    windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
    limit: env.LOGIN_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler(_request, _response, next) {
      next(new HttpError({ code: "AUTH_RATE_LIMITED", message: "Demasiados intentos de inicio de sesión.", statusCode: 429 }));
    },
  });
  router.post("/login", loginLimiter, controller.login);
  router.post("/logout", controller.logout);
  router.post("/logout-all", requireSession, controller.logoutAll);
  router.get("/me", requireSession, controller.me);
  router.get("/sessions", requireSession, controller.sessions);
  router.delete("/sessions/:sessionId", requireSession, controller.revokeSession);
  router.post("/change-password", requireSession, controller.changePassword);
  if (env.NODE_ENV === "test") {
    router.get("/test/permission", requireSession, authorize("users.create", audit), (_request, response) => response.sendStatus(204));
  }
  return router;
}
