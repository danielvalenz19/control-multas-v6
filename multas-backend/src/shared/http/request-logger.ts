import type { RequestHandler } from "express";
import type { Logger } from "pino";
import { getRequestLogger } from "./request-context.js";

export function requestLoggerMiddleware(logger: Logger): RequestHandler {
  return (request, response, next) => {
    const started = performance.now();
    response.on("finish", () => {
      getRequestLogger(logger).info(
        { method: request.method, path: request.path, statusCode: response.statusCode, durationMs: Math.round(performance.now() - started) },
        "Request completed",
      );
    });
    next();
  };
}
