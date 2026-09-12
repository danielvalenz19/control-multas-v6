import pino, { type Logger } from "pino";
import type { Env } from "./env.js";

export function createLogger(env: Pick<Env, "LOG_LEVEL" | "NODE_ENV">): Logger {
  return pino({
    level: env.LOG_LEVEL,
    messageKey: "message",
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { service: "multas-backend", environment: env.NODE_ENV },
    serializers: { err: pino.stdSerializers.err },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "request.headers.authorization",
        "request.headers.cookie",
        "password",
        "token",
        "sessionToken",
        "config.password",
        "err.config.password",
        "DB_PASSWORD",
      ],
      censor: "[REDACTED]",
    },
  });
}
