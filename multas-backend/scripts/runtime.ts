import type { AppContainer } from "../src/bootstrap/container.js";
import { createContainer } from "../src/bootstrap/container.js";
import { loadEnv } from "../src/config/env.js";

export async function withContainer(work: (container: AppContainer) => Promise<void>): Promise<void> {
  const container = createContainer(loadEnv());
  try {
    await work(container);
  } catch (error) {
    container.logger.fatal({ err: error }, "Database command failed");
    process.exitCode = 1;
  } finally {
    await container.database.close();
  }
}
