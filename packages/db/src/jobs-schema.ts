// Installation de pg-boss et de ses files par le rôle propriétaire, pendant les migrations.
import PgBoss from "pg-boss";
import { JOB_QUEUES } from "@civora/shared";

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
  for (const name of JOB_QUEUES) if (!existing.has(name)) await boss.createQueue(name);
  await boss.stop({ graceful: false, wait: true });
  return JOB_QUEUES.length;
}
