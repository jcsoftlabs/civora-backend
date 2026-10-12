import type { FastifyInstance } from "fastify";
import { onboarding, onboardingUpdate, updateOnboarding } from "./onboarding.js";
import { z } from "zod";
import { requireAuth } from "../../plugins/auth.js";
import { type PartiesService, brandingUpdate, signupComplete, signupStart, slugSchema } from "./service.js";

/** SOC-01, SOC-03. Création publique, limitée en débit ; identité visuelle réservée au national. */
export default async function partyRoutes(app: FastifyInstance, opts: { parties: PartiesService }) {
  const svc = opts.parties;
  app.get("/parties/slug-availability", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req) =>
    svc.slugAvailability(z.object({ slug: z.string().max(60) }).parse(req.query).slug),
  );
  app.post("/parties/signup/start", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (req, reply) =>
    reply.code(202).send(await svc.start(signupStart.parse(req.body), req.clientIp)),
  );
  app.post(
    "/parties/signup/complete",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const ua = req.headers["user-agent"];
      return reply
        .code(201)
        .send(
          await svc.complete(signupComplete.parse(req.body), { ip: req.clientIp, ...(ua ? { userAgent: ua } : {}) }),
        );
    },
  );
  app.get("/parties/:slug/public", async (req) =>
    svc.publicProfile(z.object({ slug: slugSchema }).parse(req.params).slug),
  );
  app.get("/party/settings", { preHandler: requireAuth }, async (req) => svc.settings(req));
  // SOC-09 : assistant de démarrage, étapes déduites des données du parti.
  app.get("/party/onboarding", { preHandler: requireAuth }, async (req) => onboarding(req));
  app.put("/party/onboarding", { preHandler: requireAuth }, async (req, reply) => {
    await updateOnboarding(req, onboardingUpdate.parse(req.body));
    return reply.code(204).send();
  });
  app.patch("/party/branding", { preHandler: requireAuth }, async (req, reply) => {
    await svc.updateBranding(req, brandingUpdate.parse(req.body));
    return reply.code(204).send();
  });
}
