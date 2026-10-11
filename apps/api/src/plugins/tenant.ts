import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { can, requiredTier, type AddOnFeature, type Entitlements, type Feature, type Permission } from "@civora/shared";
import type { EntitlementsCache } from "../lib/entitlements.js";

declare module "fastify" {
  interface FastifyInstance {
    entitlements: EntitlementsCache;
  }
  interface FastifyRequest {
    /** Vient du jeton de session, jamais du corps ni de l'URL. Vide tant que la requête n'est pas authentifiée. */
    partyId: string;
    memberId: string | null;
    /** Permissions effectives, avec la zone (chemin ltree) où chacune s'applique. */
    grants: Array<{ permission: Permission; zonePath: string | null }>;
    /** Droits du parti, chargés à la demande par requireFeature(). */
    partyEntitlements: Entitlements | null;
  }
}

/**
 * preHandler : refuse si les droits du parti n'incluent pas la fonctionnalité (SOC-07).
 * Les droits sont lus en base (cache court) : changer de palier ne demande aucun redéploiement.
 * La réponse donne le palier requis, que l'interface affiche sur l'option verrouillée.
 */
export const requireFeature = (feature: Feature | AddOnFeature) => async (req: FastifyRequest, reply: FastifyReply) => {
  if (!req.partyId) return reply.code(401).send({ code: "unauthenticated", requestId: req.id });
  const e = req.partyEntitlements ?? (await req.server.entitlements.get(req.partyId));
  req.partyEntitlements = e;
  if (!e) return reply.code(401).send({ code: "unauthenticated", requestId: req.id });
  if (e.suspended) return reply.code(402).send({ code: "subscription_suspended", requestId: req.id });
  if (!can(e, feature)) {
    return reply
      .code(402)
      .send({ code: "feature_not_in_plan", feature, requiredTier: requiredTier(feature), requestId: req.id });
  }
};

/** `zone` est-elle `scope` ou l'une de ses sous-zones ? Comparaison par segments ltree, pas par préfixe de texte. */
export function zoneWithin(zone: string, scope: string): boolean {
  return zone === scope || zone.startsWith(`${scope}.`);
}

/**
 * Vérifie la permission et la portée territoriale (SEC-05). zonePath = zone de la ressource visée.
 * Un poste limité à une zone n'agit que sur des ressources rattachées à cette zone ou à ses sous-zones ;
 * une ressource sans zone (niveau national) exige un poste national (zonePath null).
 */
export function authorize(req: Pick<FastifyRequest, "grants">, permission: Permission, zonePath?: string): boolean {
  return req.grants.some(
    (g) =>
      g.permission === permission &&
      (g.zonePath === null || (zonePath !== undefined && zoneWithin(zonePath, g.zonePath))),
  );
}

export default fp<{ entitlements: EntitlementsCache }>(async (app, opts) => {
  app.decorate("entitlements", opts.entitlements);
  app.decorateRequest("partyId", "");
  app.decorateRequest("memberId", null);
  app.decorateRequest("partyEntitlements", null);
  // Fastify 5 refuse un tableau partagé comme décorateur : valeur neuve à chaque requête.
  app.decorateRequest("grants", null as unknown as FastifyRequest["grants"]);
  app.addHook("onRequest", async (req) => {
    req.grants = [];
  });
  // P2 (authentification) : lire le jeton de session, renseigner partyId, memberId et grants (postes occupés).
});
