// Textes de l'interface (NFR-08) : aucun texte en dur dans les composants. fr et ht obligatoires ; en et es en P3.
import { fr, type MessageKey } from "./fr";
import { ht } from "./ht";

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

export function translator(locale: Locale) {
  const dict = dictionaries[locale];
  return (key: MessageKey): string => dict[key] ?? fr[key];
}

/** Remplace les repères {nom} d'un texte traduit. */
export function format(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
}

/** Nombre accordé : « 1 module », « 3 modules » (la clé `.one` sert pour un seul élément). */
export function counted(t: (key: MessageKey) => string, key: string, n: number): string {
  return format(t((n === 1 ? `${key}.one` : key) as MessageKey), { n: String(n) });
}
