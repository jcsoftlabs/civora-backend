// SOC-03 : chaque couleur de parti produit un texte lisible (4,5:1) sur le bouton principal.
import { contrastRatio, luminance, partyTheme } from "../src/theme.js";

const PARTY_COLORS = { petrole: "#0F6E66", prune: "#7A2E5C", brique: "#B5452B", bleuMoyen: "#2F5D9E" };

describe("partyTheme", () => {
  for (const [name, hex] of Object.entries(PARTY_COLORS)) {
    it(`garantit 4,5:1 pour ${name}`, () => {
      const t = partyTheme(hex);
      expect(contrastRatio(t["--c-primary"], t["--c-on-primary"])).toBeGreaterThanOrEqual(4.5);
      expect(luminance(t["--c-primary-hover"])).toBeLessThan(luminance(t["--c-primary"]));
      expect(luminance(t["--c-primary-tint"])).toBeGreaterThan(luminance(t["--c-primary"]));
    });
  }

  it("garde la couleur pétrole telle quelle avec du texte blanc", () => {
    expect(partyTheme("#0F6E66")).toMatchObject({ "--c-primary": "#0F6E66", "--c-on-primary": "#FFFFFF" });
  });

  it("met du texte encre sur une couleur claire", () => {
    expect(partyTheme("#F2B84B")["--c-on-primary"]).toBe("#1C1B19");
  });

  it("assombrit une couleur intermédiaire qui ne contraste assez avec rien", () => {
    const t = partyTheme("#7F7F7F");
    expect(contrastRatio(t["--c-primary"], t["--c-on-primary"])).toBeGreaterThanOrEqual(4.5);
  });

  it("refuse une couleur invalide", () => {
    expect(() => partyTheme("rouge")).toThrow();
  });
});
