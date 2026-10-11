// SOC-05 : référentiel partagé (pas de party_id), en lecture seule pour l'application.
// Haïti : pays, département, commune, section communale (codes CNIGS / IHSI) ; diaspora : racine, pays, ville.
// Données : packages/db/data/zones.json, chargées à chaque migration (src/zones.ts).
import { index, pgEnum, pgTable, text, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { id, ltree } from "./_helpers.js";

export const zoneLevelEnum = pgEnum("zone_level", [
  "pays",
  "departement",
  "commune",
  "section_communale",
  "diaspora",
  "diaspora_pays",
  "diaspora_ville",
]);

export const zones = pgTable(
  "zones",
  {
    id: id(),
    parentId: uuid("parent_id").references((): AnyPgColumn => zones.id),
    level: zoneLevelEnum("level").notNull(),
    /** Code officiel CNIGS (HT01, HT0111, HT0111-01) ou code diaspora (DIA-US, DIA-US-MIA). */
    code: text("code").notNull().unique(),
    /** Nom officiel, en français. */
    name: text("name").notNull(),
    /** Nom en créole quand la source en donne un (départements, principales communes). */
    nameHt: text("name_ht"),
    /** Chemin construit à partir des codes, stable et sans accents : ht.ht01.ht0111.ht0111_01, diaspora.us.mia */
    path: ltree("path").notNull(),
  },
  (t) => [index("zones_path_gist").using("gist", t.path)],
);
