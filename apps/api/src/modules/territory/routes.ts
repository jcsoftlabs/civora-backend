// SOC-05 : référentiel territorial (départements, communes, sections communales, diaspora).
// Données publiques et partagées : lisibles sans connexion (inscription d'un membre, site du parti).
import type { FastifyInstance } from "fastify";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { withReferenceData, zones } from "@civora/db";
import { ZONE_LEVELS } from "@civora/shared";
import { ApiError } from "../../plugins/errors.js";

const code = z.string().regex(/^[A-Z0-9-]{2,20}$/);
const childrenQuery = z.object({ parent: code.optional() });
const searchQuery = z.object({
  q: z.string().trim().min(2).max(60),
  level: z.enum(ZONE_LEVELS).optional(),
  within: code.optional(),
});

const ACCENTS_FROM = "àâäáãéèêëíìîïóòôöõúùûüçñ";
const ACCENTS_TO = "aaaaaeeeeiiiiooooouuuucn";
/** Comparaison sans casse ni accents : « petion » trouve « Pétion-Ville ». */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const columns = {
  id: zones.id,
  code: zones.code,
  level: zones.level,
  name: zones.name,
  nameHt: zones.nameHt,
};

export default async function territoryRoutes(app: FastifyInstance) {
  // Enfants d'une zone ; sans parent : les deux racines, Haïti et Diaspora.
  app.get("/zones", async (req) => {
    const q = childrenQuery.parse(req.query);
    return withReferenceData(async (tx) => {
      let parentId: string | null = null;
      if (q.parent) {
        const [p] = await tx.select({ id: zones.id }).from(zones).where(eq(zones.code, q.parent));
        if (!p) throw new ApiError(404, "not_found");
        parentId = p.id;
      }
      const rows = await tx
        .select({
          ...columns,
          hasChildren: sql<boolean>`exists (select 1 from zones c where c.parent_id = "zones"."id")`,
        })
        .from(zones)
        .where(parentId ? eq(zones.parentId, parentId) : isNull(zones.parentId))
        .orderBy(asc(zones.name));
      return { zones: rows };
    });
  });

  // Recherche par nom, sans accents, éventuellement limitée à un niveau ou à une zone et ses sous-zones.
  app.get("/zones/search", async (req) => {
    const q = searchQuery.parse(req.query);
    return withReferenceData(async (tx) => {
      let within: string | null = null;
      if (q.within) {
        const [w] = await tx.select({ path: zones.path }).from(zones).where(eq(zones.code, q.within));
        if (!w) throw new ApiError(404, "not_found");
        within = w.path;
      }
      const pattern = `%${fold(q.q).replace(/[%_\\]/g, "\\$&")}%`;
      const rows = await tx
        .select({ ...columns, path: zones.path })
        .from(zones)
        .where(
          and(
            sql`(translate(lower(${zones.name}), ${ACCENTS_FROM}, ${ACCENTS_TO}) like ${pattern}
                or translate(lower(coalesce(${zones.nameHt}, '')), ${ACCENTS_FROM}, ${ACCENTS_TO}) like ${pattern})`,
            q.level ? eq(zones.level, q.level) : undefined,
            within ? sql`${zones.path} <@ ${within}::ltree` : undefined,
          ),
        )
        .orderBy(sql`nlevel(${zones.path})`, asc(zones.name))
        .limit(20);
      return { zones: rows.map(({ path: _path, ...z }) => z) };
    });
  });

  // Une zone et ses ancêtres (fil d'Ariane : Ouest > Pétion-Ville > 1re Montagne Noire).
  app.get("/zones/:code", async (req) => {
    const params = z.object({ code }).parse(req.params);
    return withReferenceData(async (tx) => {
      const [zone] = await tx
        .select({ ...columns, path: zones.path })
        .from(zones)
        .where(eq(zones.code, params.code));
      if (!zone) throw new ApiError(404, "not_found");
      const ancestors = await tx
        .select(columns)
        .from(zones)
        .where(sql`${zones.path} @> ${zone.path}::ltree and ${zones.id} <> ${zone.id}`)
        .orderBy(sql`nlevel(${zones.path})`);
      const { path: _path, ...rest } = zone;
      return { zone: rest, ancestors };
    });
  });
}
