// NFR-01 : synchronisation des saisies faites hors ligne. Le téléphone garde une file d'opérations, chacune avec un
// UUID créé sur place et l'heure d'origine ; il l'envoie par lots au retour du réseau. Le même UUID rejoué donne le
// même résultat, sans second effet (table sync_operations, par parti). Chaque opération est appliquée à part : une
// opération refusée n'empêche pas les autres.
import type { FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import { syncOperations, withParty } from "@civora/db";
import { can, type Feature } from "@civora/shared";
import { z } from "zod";
import { ApiError } from "../../plugins/errors.js";

type Req = FastifyRequest;

export const syncBatch = z.object({
  deviceId: z.string().trim().min(8).max(80),
  operations: z
    .array(
      z.object({
        id: z.string().uuid(),
        kind: z.string().min(1).max(60),
        payload: z.record(z.unknown()),
        createdAt: z.coerce.date(),
      }),
    )
    .min(1)
    .max(50),
});

type Outcome = { status: "applied"; result: unknown } | { status: "rejected"; code: string };
export type SyncResult = Outcome & { id: string };

/** Une sorte d'opération : sa forme, la fonction de la formule qu'elle demande, et son application. */
export interface SyncHandler {
  feature: Feature;
  payload: z.ZodType<Record<string, unknown>>;
  /** Doit être sans effet si l'opération a déjà été appliquée (le serveur peut la rejouer après une coupure). */
  apply(req: Req, payload: Record<string, unknown>, createdAt: Date): Promise<unknown>;
}

export class SyncService {
  constructor(private readonly handlers: Record<string, SyncHandler>) {}

  async batch(req: Req, body: z.infer<typeof syncBatch>): Promise<SyncResult[]> {
    const out: SyncResult[] = [];
    // Dans l'ordre d'origine sur le téléphone, quel que soit l'ordre d'arrivée.
    const ops = [...body.operations].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (const op of ops) out.push(await this.one(req, body.deviceId, op));
    return out;
  }

  private async one(
    req: Req,
    deviceId: string,
    op: z.infer<typeof syncBatch>["operations"][number],
  ): Promise<SyncResult> {
    const memberId = req.memberId!;
    // 1. Réserver l'UUID, ou retrouver l'opération déjà reçue.
    const known = await withParty(req.partyId!, async (tx) => {
      await tx
        .insert(syncOperations)
        .values({
          id: op.id,
          partyId: req.partyId!,
          deviceId,
          kind: op.kind,
          payload: { member: memberId, data: op.payload },
          clientCreatedAt: op.createdAt,
        })
        .onConflictDoNothing();
      const [row] = await tx.select().from(syncOperations).where(eq(syncOperations.id, op.id));
      return row ?? null;
    });
    // Un UUID déjà utilisé par un autre membre, pour une autre opération, ou dans un autre parti (invisible ici,
    // mais la clé primaire refuse le doublon), n'ouvre rien.
    if (!known || (known.payload as { member?: string }).member !== memberId || known.kind !== op.kind)
      return { id: op.id, status: "rejected", code: "operation_conflict" };
    if (known.appliedAt) return { id: op.id, ...(known.result as Outcome) };

    // 2. Appliquer, puis garder le résultat pour les envois suivants.
    let outcome: Outcome;
    const handler = this.handlers[op.kind];
    const payload = handler?.payload.safeParse(op.payload);
    if (!handler || !payload?.success) outcome = { status: "rejected", code: "invalid_operation" };
    else if (req.partyEntitlements?.suspended) outcome = { status: "rejected", code: "subscription_suspended" };
    else if (!req.partyEntitlements || !can(req.partyEntitlements, handler.feature))
      outcome = { status: "rejected", code: "feature_not_in_plan" };
    else {
      try {
        outcome = { status: "applied", result: await handler.apply(req, payload.data, op.createdAt) };
      } catch (e) {
        if (!(e instanceof ApiError) || e.statusCode >= 500) throw e;
        outcome = { status: "rejected", code: e.code };
      }
    }
    await withParty(req.partyId!, (tx) =>
      tx
        .update(syncOperations)
        .set({ appliedAt: new Date(), result: outcome })
        .where(and(eq(syncOperations.id, op.id), eq(syncOperations.partyId, req.partyId!))),
    );
    return { id: op.id, ...outcome };
  }
}
