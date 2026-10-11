import { describe, expect, it } from "vitest";
import { fr } from "./fr";
import { ht } from "./ht";
import { negotiateLocale, translator, VOCABULARY } from "./index";

describe("i18n", () => {
  it("le créole couvre toutes les clés du français", () => {
    expect(Object.keys(ht).sort()).toEqual(Object.keys(fr).sort());
    for (const v of Object.values(ht)) expect(v.trim()).not.toBe("");
  });

  it("aucun tiret cadratin dans les textes", () => {
    for (const v of [...Object.values(fr), ...Object.values(ht)]) expect(v).not.toMatch(/—/);
  });

  it("préfère le cookie, puis Accept-Language, puis le français", () => {
    expect(negotiateLocale("ht", "fr-FR")).toBe("ht");
    expect(negotiateLocale(undefined, "ht-HT,fr;q=0.8")).toBe("ht");
    expect(negotiateLocale(undefined, "en-US")).toBe("fr");
    expect(negotiateLocale("xx", null)).toBe("fr");
  });

  it("accorde le vocabulaire au type d'organisation (SOC-11)", () => {
    expect(translator("fr")("admin.settings.title")).toBe("Réglages du parti");
    expect(translator("fr", "association")("admin.settings.title")).toBe("Réglages de l'association");
    expect(translator("fr", "ngo")("admin.events.national")).toBe("Toute l'ONG");
    expect(translator("ht", "association")("admin.settings.title")).toBe("Paramèt asosyasyon an");
    expect(translator("fr", "union")("admin.settings.statuses.empty")).toContain("« Militant »");
    expect(translator("fr", "association")("admin.settings.statuses.empty")).toContain("« Bénévole »");
  });

  it("chaque repère de vocabulaire est défini pour les quatre types", () => {
    for (const [locale, dict] of [
      ["fr", fr],
      ["ht", ht],
    ] as const) {
      const words = VOCABULARY[locale];
      for (const v of Object.values(dict))
        for (const [, w] of v.matchAll(/\{(\w+)\}/g))
          if (w && /_org|^orgs?$|^Org|^org_|militant|slug_ex/.test(w)) expect(Object.keys(words)).toContain(w);
    }
    // Aucun repère ne reste dans un texte affiché, quel que soit le type.
    for (const kind of ["party", "association", "ngo", "union"] as const)
      for (const locale of ["fr", "ht"] as const)
        for (const k of Object.keys(fr) as Array<keyof typeof fr>)
          expect(translator(locale, kind)(k)).not.toMatch(/\{(?:\w*_org\w*|orgs?|Org\w*|militant|slug_ex)\}/);
  });

  it("traduit une clé", () => {
    expect(translator("ht")("common.save")).toBe("Anrejistre");
  });
});
