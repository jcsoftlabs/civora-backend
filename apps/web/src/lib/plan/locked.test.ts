import { describe, expect, it } from "vitest";
import { translator } from "$lib/i18n";
import { lockedMessage } from "./locked";

describe("lockedMessage", () => {
  it("nomme le palier requis dans la langue de la personne", () => {
    expect(lockedMessage(translator("fr"), "gamification")).toBe("Disponible avec la formule Mouvement");
    expect(lockedMessage(translator("ht"), "site.customDomain")).toBe("Disponib ak fòmil Nasyonal la");
  });
  it("présente le module Élections comme une option", () => {
    expect(lockedMessage(translator("fr"), "elections")).toBe("Option à ajouter à votre formule");
  });
});
