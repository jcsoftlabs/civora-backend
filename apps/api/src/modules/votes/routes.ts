import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { messageLocale } from "../../lib/messaging/templates.js";
import { requireAuth } from "../../plugins/auth.js";
import { requireFeature } from "../../plugins/tenant.js";
import { minutesPdf } from "./minutes-pdf.js";
import {
  ballotBody,
  candidacyBody,
  candidateCreate,
  candidateDecision,
  candidateParam,
  contestBody,
  contestDecision,
  contestParam,
  electionCreate,
  idParam,
  runoffBody,
} from "./schemas.js";
import { VotesService } from "./service.js";

/** VOT-01 à VOT-07, VOT-09, VOT-10 : toutes formules ; deux tours, liste, candidatures et contestations : Mouvement. */
export default async function voteRoutes(app: FastifyInstance) {
  const svc = new VotesService();
  const guard = { preHandler: [requireAuth, requireFeature("votes.internal")] };
  const id = (p: unknown) => idParam.parse(p).id;
  const locale = (h: string | undefined) => messageLocale(h?.startsWith("ht") ? "ht" : "fr");

  // Back-office
  app.get("/votes/admin", guard, async (req) => ({ elections: await svc.manageList(req) }));
  app.post("/votes/admin", guard, async (req, reply) =>
    reply.code(201).send(await svc.create(req, electionCreate.parse(req.body))),
  );
  app.get("/votes/admin/posts", guard, async (req) => ({ posts: await svc.posts(req) }));
  app.get("/votes/admin/:id", guard, async (req) => svc.detail(req, id(req.params)));
  app.post("/votes/admin/:id/candidates", guard, async (req, reply) =>
    reply.code(201).send(await svc.addCandidate(req, id(req.params), candidateCreate.parse(req.body))),
  );
  app.patch("/votes/admin/:id/candidates/:candidateId", guard, async (req, reply) => {
    const p = candidateParam.parse(req.params);
    await svc.decideCandidate(req, p.id, p.candidateId, candidateDecision.parse(req.body));
    return reply.code(204).send();
  });
  app.delete("/votes/admin/:id/candidates/:candidateId", guard, async (req, reply) => {
    const p = candidateParam.parse(req.params);
    await svc.removeCandidate(req, p.id, p.candidateId);
    return reply.code(204).send();
  });
  app.post("/votes/admin/:id/roll", guard, async (req) => svc.freezeRoll(req, id(req.params)));
  app.patch("/votes/admin/:id/contests/:contestId", guard, async (req, reply) => {
    const p = contestParam.parse(req.params);
    await svc.decideContest(req, p.id, p.contestId, contestDecision.parse(req.body));
    return reply.code(204).send();
  });
  app.post("/votes/admin/:id/count", guard, async (req) => svc.count(req, id(req.params)));
  app.post("/votes/admin/:id/runoff", guard, async (req, reply) => {
    await svc.openRunoff(req, id(req.params), runoffBody.parse(req.body));
    return reply.code(204).send();
  });
  app.post("/votes/admin/:id/certify", guard, async (req) => svc.certify(req, id(req.params)));
  app.get("/votes/admin/:id/minutes", guard, async (req, reply) => {
    const m = await svc.minutes(req, id(req.params));
    return reply
      .header("content-type", "application/pdf")
      .header("content-disposition", 'attachment; filename="proces-verbal.pdf"')
      .header("cache-control", "no-store")
      .send(await minutesPdf(m, locale(req.headers["accept-language"])));
  });

  // Responsable ou inscrit
  app.get("/votes/:id/roll", guard, async (req) => ({ voters: await svc.roll(req, id(req.params)) }));
  app.get("/votes/:id/journal", guard, async (req) => {
    const { round } = z.object({ round: z.coerce.number().int().min(1).max(2).optional() }).parse(req.query);
    return svc.journal(req, id(req.params), round);
  });

  // Membre
  app.get("/votes", guard, async (req) => ({ elections: await svc.myElections(req) }));
  app.get("/votes/:id", guard, async (req) => svc.myElection(req, id(req.params)));
  app.post(
    "/votes/:id/ballot",
    {
      ...guard,
      config: {
        rateLimit: { max: 10, timeWindow: "10 minutes", keyGenerator: (r) => r.auth?.sessionId ?? r.clientIp },
      },
    },
    async (req, reply) => reply.code(201).send(await svc.vote(req, id(req.params), ballotBody.parse(req.body))),
  );
  app.post("/votes/:id/candidacy", guard, async (req, reply) =>
    reply.code(201).send(await svc.apply(req, id(req.params), candidacyBody.parse(req.body))),
  );
  app.post("/votes/:id/contests", guard, async (req, reply) =>
    reply.code(201).send(await svc.contest(req, id(req.params), contestBody.parse(req.body))),
  );
}
