// Installation de pg-boss et de ses files par le rôle propriétaire, pendant les migrations.
import PgBoss from "pg-boss";
import { JOB_QUEUES } from "@civora/shared";

/**
 * File interne de pg-boss qui transforme une planification (cron) en job. pg-boss la crée au démarrage du worker,
 * mais civora_app n'a pas le droit de créer de table : sans elle, aucun job planifié ne part, sans aucune erreur.
 */
export const PGBOSS_INTERNAL_QUEUES = ["__pgboss__send-it"] as const;

export async function installJobQueues(connectionString: string, ssl: boolean): Promise<number> {
  const boss = new PgBoss({
    connectionString,
    schema: "pgboss",
    supervise: false,
    schedule: false,
    ...(ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  boss.on("error", () => {});
  await boss.start();
  const existing = new Set((await boss.getQueues()).map((q) => q.name));
  for (const name of [...JOB_QUEUES, ...PGBOSS_INTERNAL_QUEUES]) if (!existing.has(name)) await boss.createQueue(name);
  await boss.stop({ graceful: false, wait: true });
  return JOB_QUEUES.length;
}
