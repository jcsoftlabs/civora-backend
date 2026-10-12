import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../plugins/auth.js";
import { requireFeature } from "../../plugins/tenant.js";
import { POINT_ACTIONS } from "./points.js";
import { EngagementService } from "./service.js";

const idParam = z.object({ id: z.string().uuid() });
const settingsBody = z.object({
  referralEnabled: z.boolean().optional(),
  scale: z
    .object(
      Object.fromEntries(POINT_ACTIONS.map((a) => [a, z.number().int().min(0).max(1000)])) as Record<
        (typeof POINT_ACTIONS)[number],
        z.ZodNumber
      >,
    )
    .partial()
    .optional(),
});
const adjustBody = z.object({
  points: z
    .number()
    .int()
    .min(-10_000)
    .max(10_000)
    .refine((n) => n !== 0),
  note: z.string().trim().min(3).max(300),
});

/** ENG-01 (parrainage, toutes formules) ; GAM-01 et GAM-09 (points, formules Mouvement et National). */
export default async function engagementRoutes(app: FastifyInstance, opts: { partyOrigin: (slug: string) => string }) {
  const svc = new EngagementService(opts.partyOrigin);
  const auth = { preHandler: requireAuth };
  const points = { preHandler: [requireAuth, requireFeature("gamification")] };

  app.get("/members/me/points", auth, async (req) => svc.myPoints(req));
  app.get("/members/me/referrals", auth, async (req) => svc.myReferrals(req));
  app.get("/party/engagement", auth, async (req) => svc.settings(req));
  app.put("/party/engagement", auth, async (req) => svc.updateSettings(req, settingsBody.parse(req.body)));
  app.get("/members/:id/points", points, async (req) => svc.memberPoints(req, idParam.parse(req.params).id));
  app.post("/members/:id/points", points, async (req, reply) => {
    await svc.adjust(req, idParam.parse(req.params).id, adjustBody.parse(req.body));
    return reply.code(204).send();
  });
}
