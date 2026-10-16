import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../plugins/auth.js";
import type { TrainingService } from "../training/service.js";
import { SyncService, syncBatch, type SyncHandler } from "./service.js";

/** NFR-01 : lot d'opérations faites hors ligne par l'application. */
export default async function syncRoutes(app: FastifyInstance, opts: { training: TrainingService }) {
  const handlers: Record<string, SyncHandler> = {
    // FOR-01 : chapitre ouvert sans réseau (texte lu, audio écouté depuis le téléphone).
    "training.chapter.view": {
      feature: "training",
      payload: z.object({ chapterId: z.string().uuid() }),
      apply: (req, p) => opts.training.markViewed(req, p.chapterId as string),
    },
  };
  const svc = new SyncService(handlers);
  app.post(
    "/sync",
    {
      preHandler: requireAuth,
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (req) => {
      // Les droits de la formule servent à chaque opération : on les charge une fois pour le lot.
      req.partyEntitlements ??= await app.entitlements.get(req.partyId!);
      return { results: await svc.batch(req, syncBatch.parse(req.body)) };
    },
  );
}
