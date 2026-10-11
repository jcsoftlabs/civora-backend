// Filtres communs à la liste des membres et à l'export (ADH-12) : mêmes critères, même portée territoriale.
import { arrayOverlaps, eq, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { members, zones, type Tx } from "@civora/db";
import { ApiError } from "../../plugins/errors.js";

export const memberFilters = z.object({
  state: z.enum(["pending", "approved", "rejected"]).optional(),
  zoneCode: z
    .string()
    .regex(/^[A-Z0-9-]{2,20}$/)
    .optional(),
  statusId: z.string().uuid().optional(),
  tags: z.array(z.string().min(1).max(40)).max(10).optional(),
  diaspora: z.boolean().optional(),
});
export type MemberFilters = z.infer<typeof memberFilters>;

/** Conditions SQL des filtres ; la portée (`scope`) s'applique toujours, quel que soit le filtre de zone. */
export async function filterConditions(tx: Tx, f: MemberFilters, scope: SQL): Promise<(SQL | undefined)[]> {
  const conditions: (SQL | undefined)[] = [isNull(members.deletedAt), scope];
  if (f.zoneCode) {
    const [z] = await tx.select({ path: zones.path }).from(zones).where(eq(zones.code, f.zoneCode));
    if (!z) throw new ApiError(400, "zone_not_found");
    // Filtrer sur une zone hors de sa portée ne donne rien de plus.
    conditions.push(sql`${zones.path} <@ ${z.path}::ltree`);
  }
  if (f.state) conditions.push(eq(members.applicationState, f.state));
  if (f.statusId) conditions.push(eq(members.statusId, f.statusId));
  if (f.diaspora !== undefined) conditions.push(eq(members.isDiaspora, f.diaspora));
  if (f.tags?.length) conditions.push(arrayOverlaps(members.tags, f.tags));
  return conditions;
}
