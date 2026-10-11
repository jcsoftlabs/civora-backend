import { assertAppRole, closeDb } from "@civora/db";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { LocalKeyProvider } from "./lib/crypto.js";

const config = loadConfig();
await assertAppRole(); // jamais de super-utilisateur : la RLS doit s'appliquer
LocalKeyProvider.fromEnv(); // échoue tôt si la clé maîtresse manque ou est mal formée
const app = await buildApp(config);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, "arrêt");
    await app.close();
    await closeDb();
    process.exit(0);
  });
}

await app.listen({ port: config.API_PORT, host: config.API_HOST });
