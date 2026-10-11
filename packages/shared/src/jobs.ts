/**
 * Files des tâches de fond. Créées par les migrations (rôle propriétaire) ; le worker n'y fait que lire et écrire
 * des jobs, sans droit de créer des tables. Ajouter une file ici, puis son job dans apps/worker/src/jobs.ts.
 */
export const JOB_QUEUES = ["payments.reconcile", "dues.generate", "notifications.fanout"] as const;
export type JobQueue = (typeof JOB_QUEUES)[number];
