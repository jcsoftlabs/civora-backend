/**
 * Territoire (SOC-05, ORG-01, ORG-03). Les membres se localisent toujours jusqu'à la section communale (ADH-02) ;
 * le palier limite la profondeur des structures du parti (organes, postes, portée des responsables).
 * Lecture de plans.ts : Essentiel = national et communes ; Mouvement ajoute départements et villes de la diaspora ;
 * National ajoute les sections communales.
 */
import { can, type Entitlements } from "./plans.js";

export const ZONE_LEVELS = [
  "pays",
  "departement",
  "commune",
  "section_communale",
  "diaspora",
  "diaspora_pays",
  "diaspora_ville",
] as const;
export type ZoneLevel = (typeof ZONE_LEVELS)[number];

/** Niveaux auxquels le parti peut rattacher un organe ou limiter un poste. */
export function structureLevels(e: Entitlements): ZoneLevel[] {
  const levels: ZoneLevel[] = ["pays", "commune", "diaspora", "diaspora_pays"];
  if (can(e, "territory.departement")) levels.push("departement", "diaspora_ville");
  if (can(e, "territory.sectionCommunale")) levels.push("section_communale");
  return levels;
}

export function canStructureAt(e: Entitlements, level: ZoneLevel): boolean {
  return structureLevels(e).includes(level);
}
