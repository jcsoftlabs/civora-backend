import { describe, expect, it } from "vitest";
import { fr } from "./fr";
import { ht } from "./ht";
import { negotiateLocale, translator } from "./index";

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

  it("traduit une clé", () => {
    expect(translator("ht")("common.save")).toBe("Anrejistre");
  });
});
