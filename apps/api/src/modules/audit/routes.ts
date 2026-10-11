import type { FastifyInstance } from "fastify";
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { auditLog, withParty } from "@civora/db";
import { verifyAuditChain } from "../../lib/audit.js";
import { requireAuth } from "../../plugins/auth.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize } from "../../plugins/tenant.js";

const listQuery = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  action: z.string().max(64).optional(),
});

/** SEC-06 : lecture du journal et vérification de son intégrité, réservées à un poste national (audit.read). */
export default async function auditRoutes(app: FastifyInstance) {
  app.get("/audit", { preHandler: requireAuth }, async (req) => {
    if (!authorize(req, "audit.read")) throw new ApiError(403, "forbidden");
    const q = listQuery.parse(req.query);
    const rows = await withParty(req.partyId, (tx) =>
      tx
        .select({
          seq: auditLog.seq,
          action: auditLog.action,
          actorKind: auditLog.actorKind,
          actorUserId: auditLog.actorUserId,
          targetType: auditLog.targetType,
          targetId: auditLog.targetId,
          metadata: auditLog.metadata,
          createdAt: auditLog.createdAt,
          hash: auditLog.hash,
        })
        .from(auditLog)
        .where(
          and(q.before ? lt(auditLog.seq, q.before) : undefined, q.action ? eq(auditLog.action, q.action) : undefined),
        )
        .orderBy(desc(auditLog.seq))
        .limit(q.limit),
    );
    return { entries: rows, nextBefore: rows.length === q.limit ? rows.at(-1)?.seq : null };
  });

  app.get("/audit/verify", { preHandler: requireAuth }, async (req) => {
    if (!authorize(req, "audit.read")) throw new ApiError(403, "forbidden");
    const res = await withParty(req.partyId, (tx) => verifyAuditChain(tx, req.partyId));
    return { ...res, intact: res.brokenAt === null };
  });
}
