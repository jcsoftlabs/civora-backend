import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../plugins/auth.js";

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/);

// partySlug absent : application mobile, l'organisation est celle du compte qui porte l'adresse.
const requestBody = z.discriminatedUnion("channel", [
  z.object({ partySlug: slug.optional(), channel: z.literal("email"), destination: z.string().email().max(254) }),
  z.object({ partySlug: slug.optional(), channel: z.literal("sms"), destination: z.string().regex(/^\+\d{8,15}$/) }),
]);
const verifyBody = z.object({
  partySlug: slug.optional(),
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
  /** app : session de l'application mobile, espace membre seulement, jusqu'à la déconnexion. */
  client: z.enum(["web", "app"]).default("web"),
});
const mfaBody = z.object({ code: z.string().regex(/^\d{6}$/) });

/** SEC-04, SEC-09. Débit limité par adresse IP sur chaque étape sensible. */
export default async function authRoutes(app: FastifyInstance) {
  app.post("/auth/otp/request", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (req, reply) => {
    const body = requestBody.parse(req.body);
    const res = await app.auth.requestOtp({ ...body, ip: req.clientIp });
    return reply.code(202).send(res);
  });

  app.post("/auth/otp/verify", { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (req) => {
    const body = verifyBody.parse(req.body);
    const ua = req.headers["user-agent"];
    const { client, ...rest } = body;
    return app.auth.verifyOtp({
      ...rest,
      scope: client === "app" ? "member" : "full",
      ip: req.clientIp,
      ...(ua ? { userAgent: ua } : {}),
    });
  });

  app.get("/auth/me", { preHandler: requireAuth, config: { allowMfaPending: true } }, async (req) => {
    const a = req.auth!;
    return {
      partyId: a.partyId,
      memberId: a.memberId,
      mfaPending: a.mfaPending,
      permissions: [...new Set(a.grants.map((g) => g.permission))],
      // Formule du parti : le back-office affiche les options hors formule verrouillées (SOC-07).
      tier: (await app.entitlements.get(a.partyId))?.tier ?? null,
      ...(await app.auth.whoami(a)),
    };
  });

  app.post("/auth/logout", { preHandler: requireAuth, config: { allowMfaPending: true } }, async (req, reply) => {
    await app.auth.logout(req.auth!);
    return reply.code(204).send();
  });

  app.post("/auth/sessions/revoke-all", { preHandler: requireAuth }, async (req) => ({
    revoked: await app.auth.revokeAll(req.auth!.partyId, req.auth!.memberId, req.auth!.userId),
  }));

  app.post("/auth/mfa/setup", { preHandler: requireAuth, config: { allowMfaPending: true } }, async (req) =>
    app.auth.setupMfa(req.auth!),
  );

  app.post(
    "/auth/mfa/verify",
    {
      preHandler: requireAuth,
      config: {
        allowMfaPending: true,
        rateLimit: { max: 5, timeWindow: "5 minutes", keyGenerator: (req) => req.auth?.sessionId ?? req.clientIp },
      },
    },
    async (req, reply) => {
      await app.auth.verifyMfa(req.auth!, mfaBody.parse(req.body).code);
      return reply.code(204).send();
    },
  );
}
