// SOC-10 : routes de la console de l'éditeur, sous /console. Jeton de session dans l'en-tête x-civora-console
// (jamais Authorization, réservé aux sessions d'organisation). En production, seules les requêtes du serveur web
// (secret partagé) sont acceptées : la console n'est pas joignable directement depuis Internet.
import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { TIERS, type Tier } from "@civora/shared";
import { ApiError } from "../../plugins/errors.js";
import type { PartiesService } from "../parties/service.js";
import { signupStart } from "../parties/service.js";
import type { ConsoleAuth, StaffContext } from "./auth.js";
import type { ConsoleService } from "./service.js";

declare module "fastify" {
  interface FastifyRequest {
    staff: StaffContext | null;
  }
}

const idParam = z.object({ id: z.string().uuid() });
const codeBody = z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) });

export default async function consoleRoutes(
  app: FastifyInstance,
  opts: {
    auth: ConsoleAuth;
    service: ConsoleService;
    parties: PartiesService;
    webSecret?: string;
    production: boolean;
  },
) {
  const secret = opts.webSecret ? Buffer.from(opts.webSecret) : null;
  app.decorateRequest("staff", null);

  app.addHook("onRequest", async (req) => {
    if (!req.url.startsWith("/console/")) return;
    if (opts.production) {
      const given = req.headers["x-civora-web"];
      const g = typeof given === "string" ? Buffer.from(given) : null;
      if (!secret || !g || g.length !== secret.length || !timingSafeEqual(g, secret))
        throw new ApiError(404, "not_found");
    }
    const token = req.headers["x-civora-console"];
    if (typeof token === "string" && token) req.staff = await opts.auth.authenticate(token);
  });

  /** Session complète (double authentification faite) ; `owner` pour les actions de gestion. */
  const need =
    (role?: "owner") =>
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!req.staff) return void reply.code(401).send({ code: "unauthenticated", requestId: req.id });
      if (req.staff.mfa !== "none") return void reply.code(401).send({ code: "mfa_required", requestId: req.id });
      if (role && req.staff.role !== role) return void reply.code(403).send({ code: "forbidden", requestId: req.id });
    };
  const staff = { preHandler: need() };
  const owner = { preHandler: need("owner") };
  const ip = (req: FastifyRequest) => req.clientIp;

  // Connexion
  app.post("/console/auth/code", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (req, reply) =>
    reply
      .code(202)
      .send(await opts.auth.requestCode(z.object({ email: z.string().email() }).parse(req.body).email, ip(req))),
  );
  app.post("/console/auth/verify", { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (req) => {
    const b = codeBody.parse(req.body);
    const ua = req.headers["user-agent"];
    const s = await opts.auth.verifyCode(b.challengeId, b.code, { ip: ip(req), ...(ua ? { userAgent: ua } : {}) });
    if (!s) throw new ApiError(401, "otp_invalid");
    return s;
  });
  app.get("/console/auth/me", async (req) => {
    if (!req.staff) throw new ApiError(401, "unauthenticated");
    const { sessionId: _s, ...me } = req.staff;
    return me;
  });
  app.post("/console/auth/mfa/setup", async (req) => {
    if (!req.staff) throw new ApiError(401, "unauthenticated");
    const r = await opts.auth.setupMfa(req.staff);
    if (!r) throw new ApiError(409, "mfa_already_enabled");
    return r;
  });
  app.post(
    "/console/auth/mfa/verify",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      if (!req.staff) throw new ApiError(401, "unauthenticated");
      const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(req.body);
      if (!(await opts.auth.verifyMfa(req.staff, code, ip(req)))) throw new ApiError(401, "mfa_invalid");
      return reply.code(204).send();
    },
  );
  app.post("/console/auth/logout", async (req, reply) => {
    if (req.staff) await opts.auth.logout(req.staff);
    return reply.code(204).send();
  });

  // Plateforme
  app.get("/console/overview", staff, async () => opts.service.overview());
  app.get("/console/organizations", staff, async () => ({ organizations: await opts.service.organizations() }));
  app.get("/console/organizations/:id", staff, async (req) => opts.service.organization(idParam.parse(req.params).id));

  app.post("/console/organizations", owner, async (req, reply) => {
    const created = await opts.parties.createByStaff(signupStart.parse(req.body), { ip: ip(req) });
    await opts.service.created(req.staff!, created.partyId, ip(req));
    return reply.code(201).send(created);
  });
  app.post("/console/organizations/:id/activate", owner, async (req, reply) => {
    const id = idParam.parse(req.params).id;
    await opts.service.activate(req.staff!, id, (x) => opts.parties.activatePending(x, { ip: ip(req) }), ip(req));
    return reply.code(204).send();
  });
  app.post("/console/organizations/:id/suspension", owner, async (req, reply) => {
    const b = z.object({ suspended: z.boolean(), reason: z.string().trim().max(500).optional() }).parse(req.body);
    await opts.service.setSuspended(req.staff!, idParam.parse(req.params).id, b.suspended, b.reason, ip(req));
    return reply.code(204).send();
  });
  app.post("/console/organizations/:id/tier", owner, async (req, reply) => {
    const { tier } = z.object({ tier: z.enum(TIERS as [Tier, ...Tier[]]) }).parse(req.body);
    await opts.service.setTier(req.staff!, idParam.parse(req.params).id, tier, ip(req));
    return reply.code(204).send();
  });
  app.post("/console/organizations/:id/trial", owner, async (req) => {
    const { days } = z.object({ days: z.number().int().min(1).max(180) }).parse(req.body);
    return opts.service.extendTrial(req.staff!, idParam.parse(req.params).id, days, ip(req));
  });
  app.post("/console/organizations/:id/elections", owner, async (req, reply) => {
    const { months } = z.object({ months: z.number().int().min(0).max(24) }).parse(req.body);
    await opts.service.setElections(req.staff!, idParam.parse(req.params).id, months, ip(req));
    return reply.code(204).send();
  });
  app.post("/console/organizations/:id/invite", staff, async (req, reply) => {
    await opts.service.invite(req.staff!, idParam.parse(req.params).id, ip(req));
    return reply.code(204).send();
  });

  // Équipe et journal
  app.get("/console/staff", owner, async (req) => ({ staff: await opts.service.staffList(req.staff!) }));
  app.post("/console/staff", owner, async (req, reply) => {
    const b = z
      .object({
        email: z.string().email().max(254),
        name: z.string().trim().min(2).max(80),
        role: z.enum(["owner", "support"]),
      })
      .parse(req.body);
    return reply.code(201).send(await opts.service.addStaff(req.staff!, b, ip(req)));
  });
  app.post("/console/staff/:id/disabled", owner, async (req, reply) => {
    const { disabled } = z.object({ disabled: z.boolean() }).parse(req.body);
    await opts.service.setStaffDisabled(req.staff!, idParam.parse(req.params).id, disabled, ip(req));
    return reply.code(204).send();
  });
  app.get("/console/audit", staff, async (req) => {
    const { before } = z.object({ before: z.coerce.date().optional() }).parse(req.query);
    return { entries: await opts.service.auditLog(before) };
  });
}
