// Actions groupées du back-office sur une sélection de membres : étiquettes et statut.
// Tout ou rien : si un seul membre est hors de la zone de la personne, rien n'est modifié (SEC-05).
import type { FastifyRequest } from "fastify";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { memberStatuses, members, withParty, zones } from "@civora/db";
import { audit } from "../../lib/audit.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize } from "../../plugins/tenant.js";

export const BULK_MAX = 500;
const tags = z.array(z.string().trim().min(1).max(40)).min(1).max(10);

export const bulkBody = z.object({
  ids: z.array(z.string().uuid()).min(1).max(BULK_MAX),
  op: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("addTags"), tags }),
    z.object({ kind: z.literal("removeTags"), tags }),
    z.object({ kind: z.literal("setStatus"), statusId: z.string().uuid().nullable() }),
  ]),
});

export async function bulkUpdate(req: FastifyRequest, body: z.infer<typeof bulkBody>) {
  const ids = [...new Set(body.ids)];
  return withParty(req.partyId, async (tx) => {
    const found = await tx
      .select({ id: members.id, path: zones.path })
      .from(members)
      .innerJoin(zones, eq(zones.id, members.zoneId))
      .where(and(inArray(members.id, ids), isNull(members.deletedAt)));
    if (found.length !== ids.length) throw new ApiError(404, "not_found");
    if (!found.every((m) => authorize(req, "members.write", m.path))) throw new ApiError(403, "forbidden");

    const op = body.op;
    if (op.kind === "setStatus" && op.statusId) {
      const [s] = await tx
        .select({ id: memberStatuses.id })
        .from(memberStatuses)
        .where(eq(memberStatuses.id, op.statusId));
      if (!s) throw new ApiError(400, "status_not_found");
    }
    const list = op.kind === "setStatus" ? [] : [...new Set(op.tags)];
    // Passées en JSON : drizzle développerait un tableau JavaScript en liste de valeurs.
    const arr = sql`array(select jsonb_array_elements_text(${JSON.stringify(list)}::text::jsonb))`;
    const set =
      op.kind === "setStatus"
        ? { statusId: op.statusId }
        : op.kind === "addTags"
          ? // Ajout sans doublon, en gardant l'ordre existant ; 20 étiquettes au plus par membre.
            {
              tags: sql`(select coalesce(array_agg(t order by o), '{}') from (
                select t, min(o) o from unnest("members"."tags" || ${arr}) with ordinality as u(t, o)
                group by t order by min(o) limit 20) x)`,
            }
          : { tags: sql`array(select t from unnest("members"."tags") as t where t <> all(${arr}))` };
    await tx
      .update(members)
      .set({ ...set, updatedAt: new Date() })
      .where(inArray(members.id, ids));
    await audit(tx, {
      partyId: req.partyId,
      actorUserId: req.auth?.userId ?? null,
      actorKind: "member",
      action: "member.bulk_update",
      targetType: "member",
      metadata: {
        op: op.kind,
        ...(op.kind === "setStatus" ? { statusId: op.statusId } : { tags: list }),
        count: ids.length,
        ids,
      },
      ip: req.clientIp,
    });
    return { updated: ids.length };
  });
}
