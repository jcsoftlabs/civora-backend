import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../plugins/auth.js";
import type { ApplicationsService } from "./applications.js";
import { exportMembers, exportRequest } from "./export.js";
import type { MembersService } from "./service.js";
import {
  admissionUpdate,
  idParam,
  identityParam,
  joinComplete,
  joinStart,
  meUpdate,
  memberAdminUpdate,
  decisionBody,
  scoreBody,
  slugParam,
  statusCreate,
  statusUpdate,
} from "./schemas.js";

/** ADH-01 à ADH-04. Les étapes d'adhésion sont publiques et limitées en débit par adresse IP. */
export default async function memberRoutes(
  app: FastifyInstance,
  opts: { members: MembersService; applications: ApplicationsService },
) {
  const svc = opts.members;
  const apps = opts.applications;

  app.get("/join/:slug", async (req) => svc.joinInfo(slugParam.parse(req.params).slug));
  app.post("/join/start", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (req, reply) =>
    reply.code(202).send(await svc.joinStart(joinStart.parse(req.body), req.ip)),
  );
  app.post("/join/complete", { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (req, reply) => {
    const ua = req.headers["user-agent"];
    return reply
      .code(201)
      .send(await svc.joinComplete(joinComplete.parse(req.body), { ip: req.ip, ...(ua ? { userAgent: ua } : {}) }));
  });

  app.get("/members/me", { preHandler: requireAuth }, async (req) => svc.getMe(req));
  app.patch("/members/me", { preHandler: requireAuth }, async (req, reply) => {
    await svc.updateMe(req, meUpdate.parse(req.body));
    return reply.code(204).send();
  });
  app.get("/members/:id", { preHandler: requireAuth }, async (req) => svc.getMember(req, idParam.parse(req.params).id));
  app.patch("/members/:id", { preHandler: requireAuth }, async (req, reply) => {
    await svc.adminUpdate(req, idParam.parse(req.params).id, memberAdminUpdate.parse(req.body));
    return reply.code(204).send();
  });
  app.post("/members/:id/identities/:identityId/reveal", { preHandler: requireAuth }, async (req) => {
    const p = identityParam.parse(req.params);
    return svc.revealIdentity(req, p.id, p.identityId);
  });

  app.get("/member-statuses", { preHandler: requireAuth }, async (req) => ({ statuses: await svc.listStatuses(req) }));
  app.post("/member-statuses", { preHandler: requireAuth }, async (req, reply) =>
    reply.code(201).send(await svc.createStatus(req, statusCreate.parse(req.body))),
  );
  app.patch("/member-statuses/:id", { preHandler: requireAuth }, async (req, reply) => {
    await svc.updateStatus(req, idParam.parse(req.params).id, statusUpdate.parse(req.body));
    return reply.code(204).send();
  });
  app.put("/party/admission", { preHandler: requireAuth }, async (req, reply) => {
    await svc.setAdmissionMode(req, admissionUpdate.parse(req.body));
    return reply.code(204).send();
  });

  // ADH-06 : file des adhésions en attente, décision et notation.
  app.get("/applications", { preHandler: requireAuth }, async (req) => ({ applications: await apps.list(req) }));
  app.post("/applications/:id/approve", { preHandler: requireAuth }, async (req, reply) => {
    await apps.decide(req, idParam.parse(req.params).id, "approved", decisionBody.parse(req.body ?? {}));
    return reply.code(204).send();
  });
  app.post("/applications/:id/reject", { preHandler: requireAuth }, async (req, reply) => {
    await apps.decide(req, idParam.parse(req.params).id, "rejected", decisionBody.parse(req.body ?? {}));
    return reply.code(204).send();
  });
  app.put("/applications/:id/score", { preHandler: requireAuth }, async (req, reply) => {
    await apps.score(req, idParam.parse(req.params).id, scoreBody.parse(req.body).score);
    return reply.code(204).send();
  });

  // ADH-12 : export filtré, dans la zone de la personne, journalisé. Débit limité par session.
  app.post(
    "/members/export",
    {
      preHandler: requireAuth,
      config: { rateLimit: { max: 10, timeWindow: "1 hour", keyGenerator: (req) => req.auth?.sessionId ?? req.ip } },
    },
    async (req, reply) => {
      const file = await exportMembers(req, exportRequest.parse(req.body));
      return reply
        .header("content-type", file.type)
        .header("content-disposition", `attachment; filename="${file.filename}"`)
        .header("cache-control", "no-store")
        .send(file.body);
    },
  );
}
