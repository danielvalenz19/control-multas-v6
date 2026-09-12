import { parse } from "cookie";
import type { RequestHandler } from "express";
import type { Env } from "../../config/env.js";
import type { AuthRepository } from "../../modules/auth/application/AuthRepository.js";
import { hashSessionToken } from "../../modules/auth/application/LoginUseCase.js";
import { HttpError } from "./HttpError.js";

export function authenticate(
  repository: AuthRepository,
  env: Pick<Env, "SESSION_COOKIE_NAME" | "SESSION_IDLE_MINUTES">,
  now: () => Date = () => new Date(),
): RequestHandler {
  return async (request, _response, next) => {
    try {
      const token = parse(request.headers.cookie ?? "")[env.SESSION_COOKIE_NAME];
      if (!token || !/^[a-zA-Z0-9_-]{40,60}$/.test(token)) throw unauthorized();
      const state = await repository.getSessionState(hashSessionToken(token));
      if (state.status !== "ACTIVE") throw unauthorized(state.status);
      const session = state.session;
      request.auth = session;
      const idleExpiresAt = new Date(now().getTime() + env.SESSION_IDLE_MINUTES * 60_000);
      await repository.touchSession(session.id, idleExpiresAt);
      next();
    } catch (error) {
      next(error);
    }
  };
}

function unauthorized(status: "NOT_FOUND" | "REVOKED" | "EXPIRED" | "ACCOUNT_DISABLED" | "VERSION_MISMATCH" = "NOT_FOUND"): HttpError {
  const code = status === "REVOKED" || status === "VERSION_MISMATCH"
    ? "AUTH_SESSION_REVOKED"
    : status === "EXPIRED"
      ? "AUTH_SESSION_EXPIRED"
      : status === "ACCOUNT_DISABLED"
        ? "AUTH_ACCOUNT_DISABLED"
        : "AUTH_REQUIRED";
  return new HttpError({ code, message: "Se requiere una sesión válida.", statusCode: 401 });
}
