import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../plugins/auth.js";
import { requireFeature } from "../../plugins/tenant.js";
import type { DuesService } from "./service.js";
import { generateBody, idParam, planCreate, planUpdate, subscribeBody, subscriptionParam } from "./schemas.js";

/** FIN-03, FIN-05. dues.customPlans est ouvert à tous les paliers ; le nombre de formules dépend du palier. */
export default async function duesRoutes(app: FastifyInstance, opts: { dues: DuesService }) {
  const svc = opts.dues;
  const guard = { preHandler: [requireAuth, requireFeature("dues.customPlans")] };

  app.get("/dues/plans", guard, async (req) => ({ plans: await svc.listPlans(req) }));
  app.post("/dues/plans", guard, async (req, reply) =>
    reply.code(201).send(await svc.createPlan(req, planCreate.parse(req.body))),
  );
  app.patch("/dues/plans/:id", guard, async (req, reply) => {
    await svc.updatePlan(req, idParam.parse(req.params).id, planUpdate.parse(req.body));
    return reply.code(204).send();
  });
  app.post("/dues/generate", guard, async (req) => svc.generateAll(req, generateBody.parse(req.body ?? {}).until));

  app.get("/members/me/dues", { preHandler: requireAuth }, async (req) => svc.myDues(req));
  app.get("/members/:id/dues", { preHandler: requireAuth }, async (req) =>
    svc.memberDues(req, idParam.parse(req.params).id),
  );
  app.post("/members/:id/dues-subscriptions", guard, async (req, reply) => {
    await svc.assign(req, idParam.parse(req.params).id, subscribeBody.parse(req.body).planId);
    return reply.code(204).send();
  });
  app.delete("/members/:id/dues-subscriptions/:planId", guard, async (req, reply) => {
    const p = subscriptionParam.parse(req.params);
    await svc.unassign(req, p.id, p.planId);
    return reply.code(204).send();
  });
}
