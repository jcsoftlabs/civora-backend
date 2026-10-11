import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthContext, AuthService } from "../modules/auth/service.js";

declare module "fastify" {
  interface FastifyInstance {
    auth: AuthService;
  }
  interface FastifyRequest {
    auth: AuthContext | null;
  }
  interface FastifyContextConfig {
    /** Route accessible pendant la double authentification (inscription, validation, déconnexion). */
    allowMfaPending?: boolean;
  }
}

/** Jeton de session : en-tête Authorization: Bearer (application mobile et serveur web SvelteKit). */
function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7).trim() || null;
}

/** preHandler : session valide exigée ; un administrateur doit avoir validé sa 2FA, sauf routes marquées. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!req.auth) return reply.code(401).send({ code: "unauthenticated", requestId: req.id });
  if (req.auth.mfaPending && !req.routeOptions.config.allowMfaPending) {
    return reply.code(401).send({ code: "mfa_required", requestId: req.id });
  }
}

export default fp<{ auth: AuthService }>(async (app, opts) => {
  app.decorate("auth", opts.auth);
  app.decorateRequest("auth", null);
  app.addHook("onRequest", async (req) => {
    const token = bearer(req);
    if (!token) return;
    const ctx = await app.auth.authenticate(token);
    if (!ctx) return;
    req.auth = ctx;
    // partyId vient toujours de la session, jamais du corps ni de l'URL.
    req.partyId = ctx.partyId;
    req.memberId = ctx.memberId;
    req.grants = ctx.grants;
  });
});
