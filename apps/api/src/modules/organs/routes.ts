import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../plugins/auth.js";
import { requireFeature } from "../../plugins/tenant.js";
import { holderAssign, holderParam, idParam, organCreate, organUpdate, postCreate, postUpdate } from "./schemas.js";
import * as svc from "./service.js";

/** ORG-01 à ORG-04, SOC-06, SEC-05. organs.custom est ouvert à tous les paliers ; la profondeur dépend du palier. */
export default async function organRoutes(app: FastifyInstance) {
  const guard = { preHandler: [requireAuth, requireFeature("organs.custom")] };

  app.get("/organs", guard, async (req) => ({ organs: await svc.listOrgans(req) }));
  app.post("/organs", guard, async (req, reply) =>
    reply.code(201).send(await svc.createOrgan(req, organCreate.parse(req.body))),
  );
  app.patch("/organs/:id", guard, async (req, reply) => {
    await svc.updateOrgan(req, idParam.parse(req.params).id, organUpdate.parse(req.body));
    return reply.code(204).send();
  });

  app.get("/organs/:id/posts", guard, async (req) => ({
    posts: await svc.listPosts(req, idParam.parse(req.params).id),
  }));
  app.post("/organs/:id/posts", guard, async (req, reply) =>
    reply.code(201).send(await svc.createPost(req, idParam.parse(req.params).id, postCreate.parse(req.body))),
  );
  app.patch("/posts/:id", guard, async (req, reply) => {
    await svc.updatePost(req, idParam.parse(req.params).id, postUpdate.parse(req.body));
    return reply.code(204).send();
  });

  app.post("/posts/:id/holders", guard, async (req, reply) =>
    reply.code(201).send(await svc.assignHolder(req, idParam.parse(req.params).id, holderAssign.parse(req.body))),
  );
  app.delete("/posts/:id/holders/:holderId", guard, async (req, reply) => {
    const p = holderParam.parse(req.params);
    await svc.endHolder(req, p.id, p.holderId);
    return reply.code(204).send();
  });
}
