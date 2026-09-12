import { createPool, type Pool } from "mysql2/promise";
import type { Env } from "./env.js";

export function createDatabasePool(env: Env): Pool {
  const pool = createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    connectionLimit: env.DB_CONNECTION_LIMIT,
    waitForConnections: true,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    timezone: "Z",
    charset: "utf8mb4",
    decimalNumbers: false,
    ...(env.DB_SSL ? { ssl: { minVersion: "TLSv1.2" } } : {}),
  });

  pool.on("connection", (connection) => {
    void connection.query("SET time_zone = '+00:00'");
  });

  return pool;
}
