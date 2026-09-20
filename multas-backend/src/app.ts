import cors from "cors";
import express, { type Express, type Request } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { AppContainer } from "./bootstrap/container.js";
import { createApiRouter } from "./bootstrap/routes.js";
import { createErrorHandler, outsideApiNotFoundHandler } from "./shared/http/error-handler.js";
import { HttpError } from "./shared/http/HttpError.js";
import { requestContextMiddleware } from "./shared/http/request-context.js";
import { requestLoggerMiddleware } from "./shared/http/request-logger.js";

export function createApp(container: AppContainer): Express {
  const app = express();
  app.disable("x-powered-by");
  if (container.env.TRUST_PROXY) app.set("trust proxy", 1);
  app.use(requestContextMiddleware(container.logger));
  app.use(requestLoggerMiddleware(container.logger));
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || container.env.CORS_ORIGINS.includes(origin)) callback(null, true);
      else callback(new HttpError({ code: "CORS_ORIGIN_NOT_ALLOWED", message: "El origen no está permitido.", statusCode: 403 }));
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Request-Id", "Idempotency-Key", "X-File-Name", "X-Evidence-Type", "X-Device-Id", "X-Source-System", "X-Migration-Entity", "X-Payment-Signature"],
    exposedHeaders: ["X-Request-Id"],
    credentials: true,
    maxAge: 600,
  }));
  app.use(rateLimit({
    windowMs: container.env.RATE_LIMIT_WINDOW_MS,
    limit: container.env.RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler(_request, _response, next) {
      next(new HttpError({ code: "RATE_LIMIT_EXCEEDED", message: "Se excedió el límite de solicitudes.", statusCode: 429 }));
    },
  }));
  app.use(`${container.env.API_PREFIX}/admin/historical-migrations/uploads`, express.raw({ type: ["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"], limit: container.env.HISTORICAL_MIGRATION_MAX_BYTES }));
  app.use(express.json({
    limit: container.env.BODY_LIMIT,
    verify(request, _response, buffer) {
      (request as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  }));
  app.use(express.urlencoded({ extended: false, limit: container.env.BODY_LIMIT }));
  app.use(container.env.API_PREFIX, createApiRouter(container));
  app.use(outsideApiNotFoundHandler());
  app.use(createErrorHandler(container.logger));
  return app;
}
