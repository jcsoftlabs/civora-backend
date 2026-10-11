// SOC-05 : référentiel partagé (pas de party_id). Haïti : département, commune, section communale ; diaspora : pays, ville.
import { index, pgEnum, pgTable, text, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { id, ltree } from "./_helpers.js";

export const zoneLevelEnum = pgEnum("zone_level", [
  "pays",
  "departement",
  "commune",
  "section_communale",
  "diaspora_pays",
  "diaspora_ville",
]);

export const zones = pgTable(
  "zones",
  {
    id: id(),
    parentId: uuid("parent_id").references((): AnyPgColumn => zones.id),
    level: zoneLevelEnum("level").notNull(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    /** Exemple : ht.ouest.petion_ville.1ere_montagne_noire */
    path: ltree("path").notNull(),
  },
  (t) => [index("zones_path_gist").using("gist", t.path)],
);
