import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = await buildApp(config);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, "arrêt");
    await app.close();
    process.exit(0);
  });
}

await app.listen({ port: config.API_PORT, host: config.API_HOST });
