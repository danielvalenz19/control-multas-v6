import type { Server } from "node:http";
import type { AppContainer } from "./container.js";

export function registerShutdown(server: Server, container: AppContainer): void {
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    container.logger.info({ signal }, "Shutdown started");
    const timeout = setTimeout(() => process.exit(1), 10_000);
    timeout.unref();
    server.close((error) => {
      if (error) {
        container.logger.error({ error }, "HTTP server shutdown failed");
        process.exit(1);
        return;
      }
      void container.database.close()
        .then(() => {
          clearTimeout(timeout);
          container.logger.info("HTTP server and MySQL pool closed");
          process.exit(0);
        })
        .catch((databaseError: unknown) => {
          container.logger.error({ error: databaseError }, "MySQL pool shutdown failed");
          process.exit(1);
        });
    });
    server.closeIdleConnections();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
