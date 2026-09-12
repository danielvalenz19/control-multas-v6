import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

loadDotEnv({ quiet: true });

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    API_PREFIX: z.string().regex(/^\/[a-z0-9/-]+$/).default("/api/v1"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    TRUST_PROXY: booleanFromString,
    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().min(1).max(65_535).default(3306),
    DB_NAME: z.literal("pmt_multas"),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
    DB_SSL: booleanFromString,
    CORS_ORIGINS: z.string().min(1),
    BODY_LIMIT: z.string().regex(/^\d+(?:b|kb|mb)$/i).default("1mb"),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
    PUBLIC_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(60_000),
    PUBLIC_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
    SESSION_COOKIE_NAME: z.string().regex(/^[a-zA-Z0-9_-]+$/).default("pmt_session"),
    SESSION_SAME_SITE: z.enum(["strict", "lax", "none"]).default("lax"),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(1_440).default(30),
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
    LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(1_440).default(15),
    LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(60_000),
    LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
    PRIVATE_UPLOAD_DIR: z.string().min(1).default("storage/private"),
    MAX_EVIDENCE_BYTES: z.coerce.number().int().min(1_024).max(25_000_000).default(10_000_000),
    HISTORICAL_MIGRATION_DIR: z.string().min(1).default("storage/private/historical-migrations"),
    HISTORICAL_MIGRATION_MAX_BYTES: z.coerce.number().int().min(1_024).max(100_000_000).default(20_000_000),
    HISTORICAL_MIGRATION_RETENTION_DAYS: z.coerce.number().int().min(1).max(3_650).default(90),
  })
  .superRefine((value, context) => {
    if (value.SESSION_SAME_SITE === "none" && value.NODE_ENV !== "production") {
      context.addIssue({
        code: "custom",
        path: ["SESSION_SAME_SITE"],
        message: "SameSite=None solo se admite en producción con cookie Secure.",
      });
    }
  })
  .transform((value) => ({
    ...value,
    CORS_ORIGINS: value.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
  }));

export type Env = z.output<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".") || "environment").join(", ");
    throw new Error(`Configuración de entorno inválida. Revise: ${fields}`);
  }
  return result.data;
}

export function loadEnv(): Env {
  return parseEnv(process.env);
}
