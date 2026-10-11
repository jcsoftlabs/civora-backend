/**
 * Marque blanche (SOC-03) : la couleur du parti remplace --c-primary.
 * Le texte posé dessus est blanc ou encre selon le meilleur contraste, et doit atteindre 4,5:1 (WCAG AA).
 */
const INK = "#1C1B19";
const WHITE = "#FFFFFF";

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) throw new Error(`Couleur invalide : ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function toHex([r, g, b]: [number, number, number]): string {
  return (
    "#" +
    [r, g, b]
      .map((v) =>
        Math.round(Math.max(0, Math.min(255, v)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
}

/** Mélange vers une autre couleur : amount = 0 garde la couleur, 1 donne la cible. */
export function mix(hex: string, target: string, amount: number): string {
  const a = parseHex(hex);
  const b = parseHex(target);
  return toHex([a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount]);
}

export interface PartyTheme {
  "--c-primary": string;
  "--c-primary-hover": string;
  "--c-primary-deep": string;
  "--c-primary-tint": string;
  "--c-on-primary": string;
}

/**
 * Dérive les variables de marque d'un parti. Si la couleur choisie ne permet un contraste de 4,5:1 ni avec le blanc
 * ni avec l'encre, elle est assombrie jusqu'à l'atteindre avec le blanc.
 */
export function partyTheme(brand: string): PartyTheme {
  let primary = toHex(parseHex(brand));
  let onPrimary = contrastRatio(primary, WHITE) >= contrastRatio(primary, INK) ? WHITE : INK;
  for (let i = 0; contrastRatio(primary, onPrimary) < 4.5 && i < 20; i++) {
    primary = mix(primary, "#000000", 0.08);
    onPrimary = WHITE;
  }
  return {
    "--c-primary": primary,
    "--c-primary-hover": mix(primary, "#000000", 0.22),
    "--c-primary-deep": mix(primary, "#000000", 0.55),
    "--c-primary-tint": mix(primary, "#FFFFFF", 0.88),
    "--c-on-primary": onPrimary,
  };
}

export function themeStyle(theme: PartyTheme): string {
  return Object.entries(theme)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
}
