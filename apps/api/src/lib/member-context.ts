import { and, eq, isNull, sql } from "drizzle-orm";
import { members, zones, type Tx } from "@civora/db";
import { ApiError } from "../plugins/errors.js";

/** Données du membre connecté utiles au ciblage (zone, statut, diaspora), en valeurs SQL prêtes à comparer. */
export async function currentMember(tx: Tx, memberId: string) {
  const [m] = await tx
    .select({ id: members.id, statusId: members.statusId, isDiaspora: members.isDiaspora, path: zones.path })
    .from(members)
    .innerJoin(zones, eq(zones.id, members.zoneId))
    .where(and(eq(members.id, memberId), isNull(members.deletedAt)));
  if (!m) throw new ApiError(401, "unauthenticated");
  return {
    ...m,
    sql: {
      memberId: sql`${m.id}::uuid`,
      zonePath: sql`${m.path}::ltree`,
      statusId: sql`${m.statusId}::uuid`,
      isDiaspora: sql`${m.isDiaspora}`,
    },
  };
}
