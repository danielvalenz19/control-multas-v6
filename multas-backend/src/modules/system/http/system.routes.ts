import { Router } from "express";
import type { AppContainer } from "../../../bootstrap/container.js";
import { HttpError } from "../../../shared/http/HttpError.js";
import { getRequestId } from "../../../shared/http/request-context.js";

export function createSystemRouter(container: AppContainer): Router {
  const router = Router();
  router.get("/health", (_request, response) => {
    response.status(200).json({
      data: { status: "UP", service: "multas-backend", timestamp: new Date().toISOString(), uptimeSeconds: Math.floor(process.uptime()) },
      meta: { requestId: getRequestId() },
    });
  });
  router.get("/readiness", async (_request, response, next) => {
    try {
      await container.database.ping();
      const schema = await container.schema.inspect("auth");
      if (!schema.matches) {
        throw new HttpError({
          code: "SYSTEM_SCHEMA_MISMATCH",
          message: "El esquema MySQL no coincide con el contrato esperado.",
          statusCode: 503,
          details: schema.differences,
        });
      }
      response.status(200).json({
        data: { status: "READY", dependencies: { mysql: "UP" }, schema: "MATCH", schemaScope: "auth", timestamp: new Date().toISOString() },
        meta: { requestId: getRequestId() },
      });
    } catch (error) {
      if (error instanceof HttpError) {
        next(error);
        return;
      }
      next(new HttpError({
        code: "SYSTEM_NOT_READY",
        message: "El servicio no está listo porque MySQL no está disponible.",
        statusCode: 503,
        details: [{ dependency: "mysql", status: "DOWN" }],
        cause: error,
      }));
    }
  });
  return router;
}
