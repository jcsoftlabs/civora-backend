// Textes de l'interface (NFR-08) : aucun texte en dur dans les composants. fr et ht obligatoires ; en et es en P3.
import { fr, type MessageKey } from "./fr";
import { ht } from "./ht";
import type { OrganizationKind } from "@civora/shared";

export const LOCALES = ["fr", "ht"] as const;
export type Locale = (typeof LOCALES)[number];
export type { MessageKey };

const dictionaries: Record<Locale, Record<MessageKey, string>> = { fr, ht };

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "fr" || value === "ht";
}

/** Langue de la requête : cookie choisi par la personne, sinon en-tête Accept-Language, sinon français. */
export function negotiateLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) return cookie;
  const tags = (acceptLanguage ?? "").split(",").map((t) => t.split(";")[0]?.trim().toLowerCase().slice(0, 2));
  return tags.find(isLocale) ?? "fr";
}

/**
 * Vocabulaire selon le type d'organisation (SOC-11) : les textes portent des repères ({du_org}, {votre_org},
 * {militant}…) remplacés ici, pour accorder « du parti », « de l'association », « de l'ONG », « du syndicat ».
 */
export const VOCABULARY: Record<Locale, Record<string, Record<OrganizationKind, string>>> = {
  fr: {
    org: { party: "parti", association: "association", ngo: "ONG", union: "syndicat" },
    orgs: { party: "partis", association: "associations", ngo: "ONG", union: "syndicats" },
    du_org: { party: "du parti", association: "de l'association", ngo: "de l'ONG", union: "du syndicat" },
    le_org: { party: "le parti", association: "l'association", ngo: "l'ONG", union: "le syndicat" },
    votre_org: { party: "votre parti", association: "votre association", ngo: "votre ONG", union: "votre syndicat" },
    Votre_org: { party: "Votre parti", association: "Votre association", ngo: "Votre ONG", union: "Votre syndicat" },
    tout_org: {
      party: "tout le parti",
      association: "toute l'association",
      ngo: "toute l'ONG",
      union: "tout le syndicat",
    },
    Tout_org: {
      party: "Tout le parti",
      association: "Toute l'association",
      ngo: "Toute l'ONG",
      union: "Tout le syndicat",
    },
    un_autre_org: {
      party: "un autre parti",
      association: "une autre association",
      ngo: "une autre ONG",
      union: "un autre syndicat",
    },
    militant: { party: "Militant", association: "Bénévole", ngo: "Bénévole", union: "Militant" },
    slug_ex: { party: "votre-parti", association: "votre-association", ngo: "votre-ong", union: "votre-syndicat" },
  },
  ht: {
    org: { party: "pati", association: "asosyasyon", ngo: "ONG", union: "sendika" },
    org_a: { party: "pati a", association: "asosyasyon an", ngo: "ONG a", union: "sendika a" },
    Org_a: { party: "Pati a", association: "Asosyasyon an", ngo: "ONG a", union: "Sendika a" },
    org_w: { party: "pati w la", association: "asosyasyon w lan", ngo: "ONG ou a", union: "sendika w la" },
    Org_w: { party: "Pati w la", association: "Asosyasyon w lan", ngo: "ONG ou a", union: "Sendika w la" },
    Org_w0: { party: "Pati w", association: "Asosyasyon w", ngo: "ONG ou", union: "Sendika w" },
    militant: { party: "Militan", association: "Volontè", ngo: "Volontè", union: "Militan" },
    slug_ex: { party: "pati-w", association: "asosyasyon-w", ngo: "ong-ou", union: "sendika-w" },
  },
};

const resolved = new Map<string, Record<MessageKey, string>>();
function dictionary(locale: Locale, kind: OrganizationKind): Record<MessageKey, string> {
  const id = `${locale}:${kind}`;
  let d = resolved.get(id);
  if (!d) {
    const words = VOCABULARY[locale];
    d = Object.fromEntries(
      Object.entries(dictionaries[locale]).map(([k, v]) => [
        k,
        v.replace(/\{(\w+)\}/g, (m, w: string) => words[w]?.[kind] ?? m),
      ]),
    ) as Record<MessageKey, string>;
    resolved.set(id, d);
  }
  return d;
}

/** Textes d'une langue, au vocabulaire du type d'organisation (un parti par défaut). */
export function translator(locale: Locale, kind: OrganizationKind = "party") {
  const dict = dictionary(locale, kind);
  return (key: MessageKey): string => dict[key] ?? dictionary("fr", kind)[key] ?? fr[key];
}

/** Remplace les repères {nom} d'un texte traduit. */
export function format(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
}

/** Nombre accordé : « 1 module », « 3 modules » (la clé `.one` sert pour un seul élément). */
export function counted(t: (key: MessageKey) => string, key: string, n: number): string {
  return format(t((n === 1 ? `${key}.one` : key) as MessageKey), { n: String(n) });
}
