import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import type { Logger } from "pino";

type RequestContext = { requestId: string; logger: Logger };
const storage = new AsyncLocalStorage<RequestContext>();

export function requestContextMiddleware(logger: Logger): RequestHandler {
  return (request, response, next) => {
    const incoming = request.header("x-request-id");
    const requestId = incoming && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(incoming)
      ? incoming
      : randomUUID();
    response.setHeader("x-request-id", requestId);
    storage.run({ requestId, logger: logger.child({ requestId }) }, next);
  };
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string {
  return storage.getStore()?.requestId ?? "unknown";
}

export function getRequestLogger(fallback: Logger): Logger {
  return storage.getStore()?.logger ?? fallback;
}
