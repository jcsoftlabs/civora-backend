// Définition des tâches de fond (docs/architecture.md, section 7). Chaque fonction est testable sans pg-boss.
import type { Logger } from "pino";
import { listPartyIdsForJobs, withParty } from "@civora/db";
import type { JobServices } from "@civora/api/jobs";

export interface JobDefinition {
  name: string;
  cron: string;
  tz?: string;
  run: (s: JobServices, log: Logger) => Promise<Record<string, number>>;
}

/** Applique `fn` à chaque parti ; l'erreur d'un parti est journalisée et n'arrête pas les autres. */
async function forEachParty(log: Logger, job: string, fn: (partyId: string) => Promise<Record<string, number>>) {
  const total: Record<string, number> = { parties: 0, errors: 0 };
  for (const partyId of await listPartyIdsForJobs()) {
    try {
      const out = await fn(partyId);
      for (const [k, v] of Object.entries(out)) total[k] = (total[k] ?? 0) + v;
      total.parties!++;
    } catch (err) {
      total.errors!++;
      log.error({ err, job, partyId }, "échec du job pour un parti");
    }
  }
  return total;
}

/** FIN-01 : vérification des paiements mobiles restés en attente. */
export const reconcilePayments: JobDefinition = {
  name: "payments.reconcile",
  cron: "*/5 * * * *",
  run: (s, log) => forEachParty(log, "payments.reconcile", (partyId) => s.online.reconcile(partyId)),
};

/** FIN-05 : génération des échéances de cotisation, chaque nuit à 2 h (heure d'Haïti). */
export const generateDues: JobDefinition = {
  name: "dues.generate",
  cron: "0 2 * * *",
  tz: "America/Port-au-Prince",
  run: (s, log) =>
    forEachParty(log, "dues.generate", async (partyId) => ({
      created: await withParty(partyId, (tx) => s.dues.generate(tx, partyId)),
    })),
};

/** COM-02 : envoi des campagnes push dont l'heure est venue, chaque minute. */
export const fanoutNotifications: JobDefinition = {
  name: "notifications.fanout",
  cron: "* * * * *",
  run: (s, log) => forEachParty(log, "notifications.fanout", (partyId) => s.push.dispatchDue(partyId)),
};

export const JOBS: JobDefinition[] = [reconcilePayments, generateDues, fanoutNotifications];
