// ADH-07 : retrouver la zone d'un membre importé (section communale en Haïti, ville ou pays de la diaspora) à
// partir de ce qu'écrit le fichier : « Carrefour », « 1re section », « Morne Chandelle », « 2 », « Miami »...
// Sans correspondance sûre et unique, la ligne attend une correction dans l'aperçu (jamais de zone devinée).
import { plain } from "./fields.js";

export interface ZoneRow {
  id: string;
  code: string;
  level: string;
  name: string;
  nameHt: string | null;
  parentId: string | null;
  path: string;
}

export interface ZoneQuery {
  commune?: string;
  section?: string;
  city?: string;
  country?: string;
}

const ORDINAL_WORDS: Record<string, number> = {
  premiere: 1,
  premier: 1,
  deuxieme: 2,
  second: 2,
  seconde: 2,
  troisieme: 3,
  quatrieme: 4,
  cinquieme: 5,
  sixieme: 6,
  septieme: 7,
  huitieme: 8,
  neuvieme: 9,
  dixieme: 10,
};

/** Rang et nom d'une section : « 1re Section Morne Chandelle » → { rank: 1, name: "morne chandelle" }. */
export function sectionParts(value: string): { rank: number | null; name: string } {
  let v = plain(value);
  let rank: number | null = null;
  const num = /^(?:section\s+)?(\d{1,2})\s*(?:re|er|ere|e|eme|em|ieme)?\b\s*/.exec(v);
  const word = /^(\p{L}+)\s+/u.exec(v);
  if (num) {
    rank = +num[1]!;
    v = v.slice(num[0].length);
  } else if (word && ORDINAL_WORDS[word[1]!]) {
    rank = ORDINAL_WORDS[word[1]!]!;
    v = v.slice(word[0].length);
  }
  v = v.replace(/^(section\s+communale|section|seksyon)\s*/, "").trim();
  return { rank, name: v };
}

/** Pays de la diaspora écrits autrement dans les fichiers. */
const COUNTRY_ALIASES: Record<string, string> = {
  usa: "DIA-US",
  us: "DIA-US",
  "etats unis": "DIA-US",
  "etats unis d amerique": "DIA-US",
  "united states": "DIA-US",
  etazini: "DIA-US",
  rd: "DIA-DO",
  dominicanie: "DIA-DO",
  "republique dominicaine": "DIA-DO",
  panyol: "DIA-DO",
};

export class ZoneIndex {
  private communes = new Map<string, ZoneRow[]>();
  private sectionsByCommune = new Map<string, ZoneRow[]>();
  private sectionsByName = new Map<string, ZoneRow[]>();
  private cities = new Map<string, ZoneRow[]>();
  private countries = new Map<string, ZoneRow>();
  private byCode = new Map<string, ZoneRow>();

  constructor(rows: ZoneRow[]) {
    const add = <T>(m: Map<string, T[]>, k: string, v: T) => {
      if (!k) return;
      const list = m.get(k) ?? [];
      if (!list.includes(v)) list.push(v);
      m.set(k, list);
    };
    for (const z of rows) {
      this.byCode.set(z.code, z);
      if (z.level === "commune") {
        add(this.communes, plain(z.name), z);
        if (z.nameHt) add(this.communes, plain(z.nameHt), z);
      } else if (z.level === "section_communale") {
        add(this.sectionsByCommune, z.parentId ?? "", z);
        add(this.sectionsByName, sectionParts(z.name).name, z);
      } else if (z.level === "diaspora_ville") add(this.cities, plain(z.name), z);
      else if (z.level === "diaspora_pays") this.countries.set(plain(z.name), z);
    }
  }

  get(code: string): ZoneRow | undefined {
    return this.byCode.get(code);
  }

  private section(candidates: ZoneRow[], value: string): ZoneRow | null {
    // Par le nom d'abord ; sinon par le rang officiel dans la commune (« 1re », « 2 »).
    const q = sectionParts(value);
    const byName = q.name ? candidates.filter((z) => sectionParts(z.name).name === q.name) : [];
    if (byName.length === 1) return byName[0]!;
    const byRank = q.rank === null ? [] : candidates.filter((z) => sectionParts(z.name).rank === q.rank);
    return byRank.length === 1 ? byRank[0]! : null;
  }

  /** Zone sûre et unique, ou null. */
  match(q: ZoneQuery): ZoneRow | null {
    const commune = q.commune ? plain(q.commune) : "";
    const city = q.city ? plain(q.city) : "";
    const country = q.country ? plain(q.country) : "";
    // Diaspora : la ville d'abord, sinon le pays (hors Haïti).
    if (city) {
      const hits = this.cities.get(city) ?? [];
      const inCountry = country ? hits.filter((z) => this.countryOf(country)?.id === z.parentId) : hits;
      if (inCountry.length === 1) return inCountry[0]!;
    }
    if (country && !["haiti", "ayiti", "ht"].includes(country) && !commune && !q.section) {
      return this.countryOf(country);
    }
    const communes = commune ? (this.communes.get(commune) ?? []) : [];
    if (commune && communes.length !== 1) return null;
    if (communes.length === 1) {
      const sections = this.sectionsByCommune.get(communes[0]!.id) ?? [];
      if (q.section) return this.section(sections, q.section);
      return sections.length === 1 ? sections[0]! : null;
    }
    if (q.section) {
      const name = sectionParts(q.section).name;
      const hits = name ? (this.sectionsByName.get(name) ?? []) : [];
      return hits.length === 1 ? hits[0]! : null;
    }
    return null;
  }

  private countryOf(value: string): ZoneRow | null {
    const alias = COUNTRY_ALIASES[value];
    return (alias ? this.byCode.get(alias) : this.countries.get(value)) ?? null;
  }
}

/** Clé d'une valeur inconnue, pour la corriger une fois pour toutes les lignes qui l'écrivent pareil. */
export function zoneKey(q: ZoneQuery): string {
  return [q.commune, q.section, q.city, q.country].map((v) => (v ? plain(v) : "")).join("|");
}

/** Libellé lisible d'une valeur inconnue : « Kafou / 1re section ». */
export function zoneLabel(q: ZoneQuery): string {
  return [q.commune, q.section, q.city, q.country].filter((v) => v && v.trim()).join(" / ");
}
