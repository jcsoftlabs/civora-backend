import { sql, type SQL } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Permission } from "@civora/shared";

/**
 * Portée territoriale d'une permission pour la personne connectée (SEC-05) : nationale, ou l'union des zones
 * de ses postes. Sert à filtrer les listes et les exports en SQL, sans charger les lignes hors de sa zone.
 */
export function zoneScope(req: Pick<FastifyRequest, "grants">, permission: Permission) {
  const grants = req.grants.filter((g) => g.permission === permission);
  const national = grants.some((g) => g.zonePath === null);
  const paths = [...new Set(grants.map((g) => g.zonePath).filter((p): p is string => p !== null))];
  return {
    allowed: national || paths.length > 0,
    national,
    paths,
    /** Condition SQL : la colonne `path` d'une zone est dans la portée. */
    where(pathColumn: AnyPgColumn): SQL {
      if (national) return sql`true`;
      if (!paths.length) return sql`false`;
      return sql`${pathColumn} <@ ${`{${paths.join(",")}}`}::ltree[]`;
    },
  };
}
