// SOC-05 : chargement du référentiel territorial (Haïti + diaspora), idempotent, à chaque migration.
// Une zone existante garde son identifiant : seuls son nom, son niveau, son parent et son chemin sont mis à jour.
import { readFileSync } from "node:fs";
import type { Sql } from "postgres";

export interface ZoneRecord {
  code: string;
  level: "pays" | "departement" | "commune" | "section_communale" | "diaspora" | "diaspora_pays" | "diaspora_ville";
  name: string;
  nameHt: string | null;
  parent: string | null;
  path: string;
}

export function loadZoneFiles(): ZoneRecord[] {
  const read = (f: string) =>
    (JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8")) as { zones: ZoneRecord[] }).zones;
  return [...read("zones-ht.json"), ...read("zones-diaspora.json")];
}

/**
 * Insère ou met à jour les zones en une requête par profondeur de la hiérarchie (parents d'abord) :
 * quelques allers-retours seulement, même vers une base distante.
 */
export async function syncZones(sql: Sql, zones: ZoneRecord[] = loadZoneFiles()): Promise<number> {
  const byDepth = new Map<number, ZoneRecord[]>();
  for (const z of zones) {
    const depth = z.path.split(".").length;
    byDepth.set(depth, [...(byDepth.get(depth) ?? []), z]);
  }
  await sql.begin(async (tx) => {
    for (const depth of [...byDepth.keys()].sort((a, b) => a - b)) {
      // Envoyé comme texte puis converti en SQL (::text::jsonb) : une seule sérialisation, que la connexion
      // connaisse déjà le type jsonb (double encodage sinon) ou non (le helper json() échoue alors).
      const batch = JSON.stringify(byDepth.get(depth));
      await tx`
        insert into zones (code, level, name, name_ht, path, parent_id)
        select z.code, z.level::zone_level, z.name, z."nameHt", z.path::ltree, p.id
        from jsonb_to_recordset(${batch}::text::jsonb)
          as z(code text, level text, name text, "nameHt" text, path text, parent text)
        left join zones p on p.code = z.parent
        on conflict (code) do update set
          level = excluded.level, name = excluded.name, name_ht = excluded.name_ht,
          path = excluded.path, parent_id = excluded.parent_id`;
    }
  });
  return zones.length;
}
