import type { RequestHandler } from "express";
import type { AuditRepository } from "../../modules/audit/application/AuditRepository.js";
import { HttpError } from "./HttpError.js";
import { getRequestId } from "./request-context.js";

export function authorize(permission: string, audit: AuditRepository): RequestHandler {
  return async (request, _response, next) => {
    try {
      if (!request.auth) {
        throw new HttpError({ code: "AUTH_REQUIRED", message: "Se requiere una sesión válida.", statusCode: 401 });
      }
      if (!request.auth.user.permissions.includes(permission)) {
        await audit.record({
          actorUserId: request.auth.user.id,
          actorSessionId: request.auth.id,
          action: "ACCESS_DENIED",
          module: "auth",
          entityType: "permission",
          entityId: permission,
          outcome: "DENIED",
          reason: permission,
          requestId: getRequestId(),
          ipAddress: request.ip ?? null,
          userAgent: request.get("user-agent")?.slice(0, 500) ?? null,
        });
        throw new HttpError({ code: "AUTH_FORBIDDEN", message: "No tiene permiso para realizar esta acción.", statusCode: 403 });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function authorizeAny(permissions: readonly string[], audit: AuditRepository): RequestHandler {
  return async (request, _response, next) => {
    try {
      if (!request.auth) {
        throw new HttpError({ code: "AUTH_REQUIRED", message: "Se requiere una sesión válida.", statusCode: 401 });
      }
      if (!permissions.some((permission) => request.auth?.user.permissions.includes(permission))) {
        const required = permissions.join("|");
        await audit.record({
          actorUserId: request.auth.user.id,
          actorSessionId: request.auth.id,
          action: "ACCESS_DENIED",
          module: "auth",
          entityType: "permission",
          entityId: required,
          outcome: "DENIED",
          reason: required,
          requestId: getRequestId(),
          ipAddress: request.ip ?? null,
          userAgent: request.get("user-agent")?.slice(0, 500) ?? null,
        });
        throw new HttpError({ code: "AUTH_FORBIDDEN", message: "No tiene permiso para realizar esta acción.", statusCode: 403 });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
