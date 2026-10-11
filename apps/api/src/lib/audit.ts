import { sql } from "drizzle-orm";
import { auditLog, type Tx } from "@civora/db";

/** Entrée du journal d'audit append-only (SEC-06). Écrite dans la même transaction que l'action. */
export interface AuditEntry {
  partyId: string;
  actorUserId: string | null;
  actorKind: "member" | "staff" | "system";
  action: string; // export.members | identity.read | role.change | staff.access ...
  targetType?: string;
  targetId?: string;
  /** Jamais de donnée personnelle ni de pièce d'identité ici. */
  metadata?: Record<string, unknown>;
  ip?: string;
}

export async function audit(tx: Tx, e: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    partyId: e.partyId,
    actorUserId: e.actorUserId,
    actorKind: e.actorKind,
    action: e.action,
    targetType: e.targetType ?? null,
    targetId: e.targetId ?? null,
    metadata: e.metadata ?? null,
    ip: e.ip ?? null,
  });
}

/**
 * Vérifie la chaîne d'empreintes du parti (sql/audit.sql) : brokenAt est le numéro du premier maillon
 * modifié, retiré ou intercalé ; null si le journal est intact.
 */
export async function verifyAuditChain(tx: Tx, partyId: string): Promise<{ checked: number; brokenAt: number | null }> {
  const rows = await tx.execute<{ checked: string; broken_at: string | null }>(
    sql`select checked, broken_at from audit_log_verify(${partyId}::uuid)`,
  );
  const r = rows[0];
  return { checked: Number(r?.checked ?? 0), brokenAt: r?.broken_at == null ? null : Number(r.broken_at) };
}
