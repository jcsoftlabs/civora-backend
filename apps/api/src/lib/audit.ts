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
