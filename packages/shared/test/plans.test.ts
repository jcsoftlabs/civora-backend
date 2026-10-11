// SOC-07 : activation des modules selon le palier, options, quotas.
import { describe, expect, it } from "vitest";
import { PLANS, TIERS, can, checkQuota, quotaLimit, requiredTier, type Entitlements } from "../src/plans.js";

const base: Entitlements = {
  tier: "essentiel",
  kind: "party",
  electionsModuleUntil: null,
  biConnectorOption: false,
  extraStoragePacks: 0,
  suspended: false,
};
const of = (patch: Partial<Entitlements>): Entitlements => ({ ...base, ...patch });

describe("paliers", () => {
  it("chaque palier inclut tout le palier inférieur", () => {
    for (let i = 1; i < TIERS.length; i++) {
      const lower = PLANS[TIERS[i - 1]!].features;
      const upper = PLANS[TIERS[i]!].features;
      expect([...lower].filter((f) => !upper.has(f))).toEqual([]);
    }
  });

  it("active une fonctionnalité selon le palier", () => {
    expect(can(of({ tier: "essentiel" }), "gamification")).toBe(false);
    expect(can(of({ tier: "mouvement" }), "gamification")).toBe(true);
    expect(can(of({ tier: "mouvement" }), "bi.dataApi")).toBe(false);
    expect(can(of({ tier: "national" }), "bi.dataApi")).toBe(true);
  });

  it("indique le palier minimal d'une fonctionnalité", () => {
    expect(requiredTier("votes.internal")).toBe("essentiel");
    expect(requiredTier("gamification")).toBe("mouvement");
    expect(requiredTier("site.customDomain")).toBe("national");
    expect(requiredTier("elections")).toBeNull();
  });
});

describe("options", () => {
  const now = new Date("2026-10-10T12:00:00Z");

  it("le module Élections dépend de sa date de fin, pas du palier", () => {
    expect(can(of({ tier: "national" }), "elections", now)).toBe(false);
    expect(can(of({ electionsModuleUntil: new Date("2027-04-10") }), "elections", now)).toBe(true);
    expect(can(of({ electionsModuleUntil: new Date("2026-10-01") }), "elections", now)).toBe(false);
  });

  it("le connecteur BI s'achète en option sous le palier National", () => {
    expect(can(of({ tier: "mouvement" }), "bi.connector")).toBe(false);
    expect(can(of({ tier: "mouvement", biConnectorOption: true }), "bi.connector")).toBe(true);
  });

  it("le module Élections est réservé aux partis (SOC-11)", () => {
    const until = new Date("2099-01-01");
    expect(can(of({ electionsModuleUntil: until }), "elections")).toBe(true);
    for (const kind of ["association", "ngo", "union"] as const)
      expect(can(of({ kind, electionsModuleUntil: until }), "elections")).toBe(false);
    // Les votes internes servent aussi aux assemblées générales.
    expect(can(of({ kind: "association" }), "votes.internal")).toBe(true);
  });

  it("un abonnement suspendu n'ouvre aucune fonctionnalité", () => {
    expect(can(of({ tier: "national", suspended: true }), "votes.internal")).toBe(false);
    expect(can(of({ suspended: true, electionsModuleUntil: new Date("2099-01-01") }), "elections")).toBe(false);
  });
});

describe("quotas", () => {
  it("bloque un quota strict", () => {
    expect(checkQuota(of({}), "customDuesPlans", 2)).toEqual({ allowed: false, limit: 2, overage: 1 });
    expect(checkQuota(of({}), "customDuesPlans", 1)).toEqual({ allowed: true, limit: 2, overage: 0 });
  });

  it("autorise et mesure un dépassement facturé", () => {
    expect(checkQuota(of({}), "members", 1000, 5)).toEqual({ allowed: true, limit: 1000, overage: 5 });
  });

  it("ajoute les packs de stockage", () => {
    expect(quotaLimit(of({ extraStoragePacks: 2 }), "storageGb")).toBe(110);
  });

  it("le palier National est illimité en membres", () => {
    expect(checkQuota(of({ tier: "national" }), "members", 1_000_000)).toEqual({
      allowed: true,
      limit: null,
      overage: 0,
    });
  });
});
