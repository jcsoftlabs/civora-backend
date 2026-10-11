import { describe, expect, it } from "vitest";
import type { Entitlements } from "../src/plans.js";
import { canStructureAt, structureLevels } from "../src/territory.js";

const e = (tier: Entitlements["tier"]): Entitlements => ({
  tier,
  kind: "party",
  electionsModuleUntil: null,
  biConnectorOption: false,
  extraStoragePacks: 0,
  suspended: false,
});

describe("profondeur territoriale selon le palier (SOC-05)", () => {
  it("Essentiel : national, communes et pays de la diaspora", () => {
    expect(canStructureAt(e("essentiel"), "commune")).toBe(true);
    expect(canStructureAt(e("essentiel"), "departement")).toBe(false);
    expect(canStructureAt(e("essentiel"), "section_communale")).toBe(false);
  });
  it("Mouvement ajoute départements et villes de la diaspora", () => {
    expect(canStructureAt(e("mouvement"), "departement")).toBe(true);
    expect(canStructureAt(e("mouvement"), "diaspora_ville")).toBe(true);
    expect(canStructureAt(e("mouvement"), "section_communale")).toBe(false);
  });
  it("National ouvre tous les niveaux", () => {
    expect(structureLevels(e("national")).sort()).toEqual(
      ["commune", "departement", "diaspora", "diaspora_pays", "diaspora_ville", "pays", "section_communale"].sort(),
    );
  });
});
