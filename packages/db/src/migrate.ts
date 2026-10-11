import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { installJobQueues } from "./jobs-schema.js";
import { syncZones } from "./zones.js";

// Migrations avec le rôle propriétaire, puis réapplication des politiques RLS.
// Connexion directe obligatoire : PgBouncer en mode transaction casse les DDL multi-instructions et les verrous.
const url = process.env.DATABASE_URL_MIGRATOR ?? "";
if (/:6432\b|pgbouncer/i.test(url)) {
  console.error("DATABASE_URL_MIGRATOR pointe vers PgBouncer. Utilisez la connexion directe à Postgres.");
  process.exit(1);
}
const owner = postgres(url, {
  max: 1,
  ssl: process.env.DATABASE_SSL === "require" ? "require" : false,
  onnotice: () => {},
});

await owner.unsafe(readFileSync(new URL("../sql/roles.sql", import.meta.url), "utf8"));
await migrate(drizzle(owner), { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
await owner.unsafe(readFileSync(new URL("../sql/rls.sql", import.meta.url), "utf8"));
await owner.unsafe(readFileSync(new URL("../sql/audit.sql", import.meta.url), "utf8"));
await installJobQueues(url, process.env.DATABASE_SSL === "require"); // pg-boss, par le propriétaire
await owner.unsafe(readFileSync(new URL("../sql/jobs.sql", import.meta.url), "utf8"));
await owner.unsafe(readFileSync(new URL("../sql/console.sql", import.meta.url), "utf8")); // SOC-10
const zoneCount = await syncZones(owner); // SOC-05 : référentiel territorial
await owner.end();
console.log(`Migrations et politiques RLS appliquées, ${zoneCount} zones à jour.`);
