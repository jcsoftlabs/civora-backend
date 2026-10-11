// SOC-11 : type d'organisation choisi à la création. Le produit est le même ; le vocabulaire des écrans suit
// le type, et le module Élections (bureaux de vote, mandataires, procès-verbaux) reste réservé aux partis.

export const ORGANIZATION_KINDS = ["party", "association", "ngo", "union"] as const;
export type OrganizationKind = (typeof ORGANIZATION_KINDS)[number];

export const isOrganizationKind = (v: unknown): v is OrganizationKind =>
  typeof v === "string" && (ORGANIZATION_KINDS as readonly string[]).includes(v);

/** Le module Élections ne sert qu'aux partis politiques (ELE-01 à ELE-18). */
export const allowsElections = (kind: OrganizationKind) => kind === "party";
