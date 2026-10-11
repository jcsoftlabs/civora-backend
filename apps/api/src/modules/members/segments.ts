// Segments enregistrés de la liste des membres : un filtre composé nommé, partagé dans le parti.
// Le segment ne donne aucun droit : à la lecture, la portée territoriale de chacun s'applique toujours.
import type { FastifyRequest } from "fastify";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { memberSegments, withParty } from "@civora/db";
import { audit } from "../../lib/audit.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize } from "../../plugins/tenant.js";
import { filterExpression } from "./filters.js";

export const segmentCreate = z.object({
  name: z.string().trim().min(2).max(80),
  filter: filterExpression.refine((f) => f.rules.length > 0, { message: "au moins une règle" }),
});

const canRead = (req: FastifyRequest) => req.grants.some((g) => g.permission === "members.read");

export async function listSegments(req: FastifyRequest) {
  if (!canRead(req)) throw new ApiError(403, "forbidden");
  return withParty(req.partyId, (tx) =>
    tx
      .select({
        id: memberSegments.id,
        name: memberSegments.name,
        filter: memberSegments.filter,
        createdByMemberId: memberSegments.createdByMemberId,
      })
      .from(memberSegments)
      .orderBy(asc(memberSegments.name)),
  );
}

export async function createSegment(req: FastifyRequest, body: z.infer<typeof segmentCreate>) {
  if (!canRead(req)) throw new ApiError(403, "forbidden");
  return withParty(req.partyId, async (tx) => {
    const [existing] = await tx
      .select({ id: memberSegments.id })
      .from(memberSegments)
      .where(eq(memberSegments.name, body.name));
    if (existing) throw new ApiError(409, "segment_name_taken");
    const [s] = await tx
      .insert(memberSegments)
      .values({ partyId: req.partyId, name: body.name, filter: body.filter, createdByMemberId: req.memberId })
      .returning({ id: memberSegments.id });
    await audit(tx, {
      partyId: req.partyId,
      actorUserId: req.auth?.userId ?? null,
      actorKind: "member",
      action: "segment.create",
      targetType: "member_segment",
      targetId: s!.id,
      metadata: { name: body.name, rules: body.filter.rules.length },
      ip: req.clientIp,
    });
    return { id: s!.id };
  });
}

/** Suppression par son auteur, ou par un poste national qui gère les membres. */
export async function deleteSegment(req: FastifyRequest, id: string) {
  await withParty(req.partyId, async (tx) => {
    const [s] = await tx
      .select({ by: memberSegments.createdByMemberId })
      .from(memberSegments)
      .where(eq(memberSegments.id, id));
    if (!s) throw new ApiError(404, "not_found");
    if (s.by !== req.memberId && !authorize(req, "members.write")) throw new ApiError(403, "forbidden");
    await tx.delete(memberSegments).where(eq(memberSegments.id, id));
  });
}
