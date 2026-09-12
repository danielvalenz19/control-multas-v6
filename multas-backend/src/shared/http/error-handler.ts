import type { ErrorRequestHandler, RequestHandler } from "express";
import type { Logger } from "pino";
import { ZodError } from "zod";
import { DomainError } from "../domain/DomainError.js";
import { HttpError } from "./HttpError.js";
import { getRequestId, getRequestLogger } from "./request-context.js";

export function outsideApiNotFoundHandler(): RequestHandler {
  return (_request, _response, next) => {
    next(new HttpError({ code: "ROUTE_NOT_FOUND", message: "La ruta solicitada no existe.", statusCode: 404 }));
  };
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _request, response, _next) => {
    void _next;
    const requestId = getRequestId();
    if (error instanceof ZodError) {
      response.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Los datos enviados no son válidos.", details: error.issues },
        meta: { requestId },
      });
      return;
    }

    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    const code = error instanceof DomainError ? error.code : "INTERNAL_ERROR";
    const message = statusCode >= 500 ? "Ocurrió un error interno." : error instanceof Error ? error.message : "Solicitud inválida.";
    getRequestLogger(logger)[statusCode >= 500 ? "error" : "warn"]({ err: error, code }, "Request failed");
    response.status(statusCode).json({
      error: { code, message, ...(error instanceof DomainError && error.details !== undefined ? { details: error.details } : {}) },
      meta: { requestId },
    });
  };
}
