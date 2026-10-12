// Démarrage sur Railway, depuis la racine du monorepo (Railpack lance `pnpm start`).
// Le service se choisit par son nom Railway : « worker » lance les tâches de fond, tout autre nom lance l'API.
// CIVORA_SERVICE=api|worker l'emporte sur le nom du service. Avant l'API : migrations et politiques RLS,
// avec le rôle propriétaire (DATABASE_URL_MIGRATOR), jamais avec le rôle de l'application.
import { spawnSync } from "node:child_process";

const service = (process.env.CIVORA_SERVICE || process.env.RAILWAY_SERVICE_NAME || "api").toLowerCase();
const run = (args) => {
  const r = spawnSync("pnpm", args, { stdio: "inherit", env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (service.includes("worker")) {
  run(["--filter", "@civora/worker", "start"]);
} else {
  if (process.env.DATABASE_URL_MIGRATOR) run(["--filter", "@civora/db", "exec", "tsx", "src/migrate.ts"]);
  else console.warn("DATABASE_URL_MIGRATOR absent : migrations non lancées.");
  run(["--filter", "@civora/api", "start"]);
}
