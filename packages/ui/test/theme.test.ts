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

describe("cardBackground", () => {
  it("garde la couleur exacte du parti quand le texte crème y est lisible", async () => {
    const { cardBackground } = await import("../src/theme.js");
    expect(cardBackground("#C8102E").background).toBe("#C8102E");
    expect(cardBackground("#1F5FBF").background).toBe("#1F5FBF");
  });
  it("garde aussi une couleur claire telle quelle, avec un texte encre", async () => {
    const { cardBackground } = await import("../src/theme.js");
    expect(cardBackground("#F2C200")).toMatchObject({ background: "#F2C200", text: "#1C1B19", dark: false });
    expect(cardBackground("#E8590C")).toMatchObject({ background: "#E8590C", text: "#1C1B19" });
    expect(cardBackground("#C8102E")).toMatchObject({ background: "#C8102E", text: "#F6E7C8", dark: true });
  });
  it("n'assombrit qu'une couleur où aucun texte n'est lisible", async () => {
    const { cardBackground } = await import("../src/theme.js");
    const g = cardBackground("#7F7F7F");
    expect(contrastRatio(g.background, g.text)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("discOpacity", () => {
  it("garde le texte lisible là où il passe sur le disque", async () => {
    const { cardBackground, discOpacity, mix } = await import("../src/theme.js");
    for (const [bg, second] of [
      ["#E8590C", "#1C1B19"],
      ["#F2C200", "#1C8339"],
      ["#C8102E", "#FFFFFF"],
      ["#1F5FBF", "#C8102E"],
    ] as const) {
      const card = cardBackground(bg);
      const o = discOpacity(card.background, card.text, second);
      expect(contrastRatio(mix(card.background, second, o), card.text)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
