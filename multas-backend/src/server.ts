import { createApp } from "./app.js";
import { createContainer } from "./bootstrap/container.js";
import { registerShutdown } from "./bootstrap/shutdown.js";
import { loadEnv } from "./config/env.js";

const env = loadEnv();
const container = createContainer(env);
const app = createApp(container);
const server = app.listen(env.PORT, env.HOST, () => {
  container.logger.info({ host: env.HOST, port: env.PORT, apiPrefix: env.API_PREFIX }, "Backend listening");
});
registerShutdown(server, container);
