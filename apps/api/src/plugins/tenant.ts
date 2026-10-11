import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { hasFeature, type Feature, type Permission, type Tier } from "@civora/shared";

declare module "fastify" {
  interface FastifyRequest {
    partyId: string;
    tier: Tier;
    memberId: string | null;
    /** Permissions effectives, avec la zone (chemin ltree) où chacune s'applique. */
    grants: Array<{ permission: Permission; zonePath: string | null }>;
  }
}

/** À utiliser comme preHandler : refuse si le palier du parti n'inclut pas la fonctionnalité (SOC-07). */
export const requireFeature = (feature: Feature) => async (req: FastifyRequest, reply: FastifyReply) => {
  if (!hasFeature(req.tier, feature)) {
    return reply.code(402).send({ code: "feature_not_in_plan", feature });
  }
};

/** Vérifie la permission et la portée territoriale (SEC-05). zonePath = zone de la ressource visée. */
export function authorize(req: FastifyRequest, permission: Permission, zonePath?: string): boolean {
  return req.grants.some(
    (g) =>
      g.permission === permission && (g.zonePath === null || zonePath === undefined || zonePath.startsWith(g.zonePath)),
  );
}

export default fp(async (app) => {
  app.decorateRequest("partyId", "");
  app.decorateRequest("tier", "essentiel");
  app.decorateRequest("memberId", null);
  // Fastify 5 refuse un tableau partagé comme décorateur : valeur neuve à chaque requête.
  app.decorateRequest("grants", null as unknown as FastifyRequest["grants"]);
  app.addHook("onRequest", async (req) => {
    req.grants = [];
  });
  // P2 : lire le jeton de session, renseigner partyId, tier, memberId et grants (postes occupés).
});
