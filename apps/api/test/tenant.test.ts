// SOC-07 (activation par palier) et SEC-05 (portée territoriale des postes).
import type { FastifyRequest } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Entitlements } from "@civora/shared";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { EntitlementsCache } from "../src/lib/entitlements.js";
import { authorize, requireFeature, zoneWithin } from "../src/plugins/tenant.js";

const PARTY = "00000000-0000-4000-8000-000000000001";
const config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" });

const entitlements = (patch: Partial<Entitlements> = {}): Entitlements => ({
  tier: "essentiel",
  electionsModuleUntil: null,
  biConnectorOption: false,
  extraStoragePacks: 0,
  suspended: false,
  ...patch,
});

describe("requireFeature", () => {
  let current = entitlements();
  let loads = 0;
  const cache = new EntitlementsCache(async () => (loads++, current), 60_000);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp(config, { entitlements: cache });
    // Simule l'authentification (tâche suivante) : le parti vient d'un en-tête de test.
    app.addHook("onRequest", async (req) => {
      const party = req.headers["x-test-party"];
      if (typeof party === "string") req.partyId = party;
    });
    app.get("/gamification", { preHandler: requireFeature("gamification") }, async () => ({ ok: true }));
    app.get("/elections", { preHandler: requireFeature("elections") }, async () => ({ ok: true }));
    await app.ready();
  });
  afterAll(() => app.close());

  const call = (url: string) => app.inject({ url, headers: { "x-test-party": PARTY } });

  it("refuse une requête sans parti authentifié", async () => {
    const res = await app.inject({ url: "/gamification" });
    expect(res.statusCode).toBe(401);
  });

  it("refuse une fonctionnalité hors palier et donne le palier requis", async () => {
    const res = await call("/gamification");
    expect(res.statusCode).toBe(402);
    expect(res.json()).toMatchObject({
      code: "feature_not_in_plan",
      feature: "gamification",
      requiredTier: "mouvement",
    });
  });

  it("change de palier sans redéploiement, dès l'invalidation du cache", async () => {
    current = entitlements({ tier: "mouvement" });
    expect((await call("/gamification")).statusCode).toBe(402); // encore en cache
    cache.invalidate(PARTY);
    expect((await call("/gamification")).statusCode).toBe(200);
  });

  it("ne relit pas la base à chaque requête", async () => {
    const before = loads;
    await call("/gamification");
    await call("/gamification");
    expect(loads).toBe(before);
  });

  it("ouvre le module Élections selon sa date de fin", async () => {
    current = entitlements({ electionsModuleUntil: new Date(Date.now() + 86_400_000) });
    cache.invalidate(PARTY);
    expect((await call("/elections")).statusCode).toBe(200);
  });

  it("bloque tout si l'abonnement est suspendu", async () => {
    current = entitlements({ tier: "national", suspended: true });
    cache.invalidate(PARTY);
    const res = await call("/gamification");
    expect(res.statusCode).toBe(402);
    expect(res.json()).toMatchObject({ code: "subscription_suspended" });
  });
});

describe("EntitlementsCache", () => {
  it("expire après le délai", async () => {
    let t = 0;
    let n = 0;
    const cache = new EntitlementsCache(
      async () => (n++, entitlements()),
      1000,
      () => t,
    );
    await cache.get(PARTY);
    t = 500;
    await cache.get(PARTY);
    expect(n).toBe(1);
    t = 1001;
    await cache.get(PARTY);
    expect(n).toBe(2);
  });
});

describe("portée territoriale", () => {
  const req = (grants: FastifyRequest["grants"]) => ({ grants }) as FastifyRequest;

  it("compare les zones par segment, pas par préfixe de texte", () => {
    expect(zoneWithin("ht.ouest.petion_ville", "ht.ouest")).toBe(true);
    expect(zoneWithin("ht.ouest", "ht.ouest")).toBe(true);
    expect(zoneWithin("ht.ouest.petion_ville", "ht.ouest.petion")).toBe(false);
  });

  it("un responsable de section n'agit que dans sa zone", () => {
    const r = req([{ permission: "members.read", zonePath: "ht.ouest.petion_ville" }]);
    expect(authorize(r, "members.read", "ht.ouest.petion_ville.1ere_montagne_noire")).toBe(true);
    expect(authorize(r, "members.read", "ht.nord.cap_haitien")).toBe(false);
    expect(authorize(r, "members.write", "ht.ouest.petion_ville")).toBe(false);
  });

  it("une ressource nationale exige un poste national", () => {
    expect(authorize(req([{ permission: "members.read", zonePath: "ht.ouest" }]), "members.read")).toBe(false);
    expect(authorize(req([{ permission: "members.read", zonePath: null }]), "members.read")).toBe(true);
  });
});
