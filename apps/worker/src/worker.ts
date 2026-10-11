// Worker civora : planifie et exécute les tâches de fond avec pg-boss.
import PgBoss from "pg-boss";
import pino from "pino";
import { assertAppRole, closeDb } from "@civora/db";
import { createJobServices, loadConfig } from "@civora/api/jobs";
import { JOB_QUEUES } from "@civora/shared";
import { JOBS } from "./jobs.js";

const config = loadConfig();
const log = pino({ level: config.LOG_LEVEL, base: { service: "worker" } });
await assertAppRole(); // jamais de super-utilisateur : la RLS s'applique aussi aux jobs

const services = createJobServices(config, log);
const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL ?? "",
  schema: "pgboss",
  // Schéma et files créés par les migrations (rôle propriétaire) : le worker n'a pas le droit de créer de table.
  migrate: false,
  ...(process.env.DATABASE_SSL === "require" ? { ssl: { rejectUnauthorized: false } } : {}),
});
boss.on("error", (err) => log.error({ err }, "pg-boss"));
await boss.start();

const missing = JOBS.filter((j) => !(JOB_QUEUES as readonly string[]).includes(j.name));
if (missing.length) throw new Error(`Files absentes de JOB_QUEUES : ${missing.map((j) => j.name).join(", ")}`);

for (const job of JOBS) {
  await boss.schedule(job.name, job.cron, {}, job.tz ? { tz: job.tz } : {});
  await boss.work(job.name, async () => {
    const started = Date.now();
    const out = await job.run(services, log);
    log.info({ job: job.name, ms: Date.now() - started, ...out }, "job terminé");
  });
  log.info({ job: job.name, cron: job.cron, tz: job.tz ?? "UTC" }, "job planifié");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    log.info({ signal }, "arrêt du worker");
    await boss.stop({ graceful: true, timeout: 30_000 });
    await closeDb();
    process.exit(0);
  });
}
