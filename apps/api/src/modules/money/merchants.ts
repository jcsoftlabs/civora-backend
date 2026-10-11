// FIN-12 : comptes marchands du parti. Les identifiants restent dans le gestionnaire de secrets ;
// la base ne garde qu'une référence. Réglage du parti, réservé au national, audité.
import type { FastifyRequest } from "fastify";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { merchantAccounts, withParty } from "@civora/db";
import { audit } from "../../lib/audit.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize } from "../../plugins/tenant.js";

export const merchantCreate = z.object({
  provider: z.enum(["moncash", "natcash", "kashpaw", "fake"]),
  /** Référence vers les identifiants, jamais leur valeur : env:NOM_DE_VARIABLE. */
  credentialsRef: z.string().regex(/^env:[A-Z0-9_]{3,100}$/),
  currency: z.literal("HTG").default("HTG"),
});
export const merchantUpdate = z.object({ active: z.boolean() });

export async function listMerchants(req: FastifyRequest) {
  if (!authorize(req, "settings.party") && !authorize(req, "payments.read")) throw new ApiError(403, "forbidden");
  return withParty(req.partyId, (tx) =>
    tx
      .select({
        id: merchantAccounts.id,
        provider: merchantAccounts.provider,
        currency: merchantAccounts.currency,
        active: merchantAccounts.active,
      })
      .from(merchantAccounts)
      .orderBy(asc(merchantAccounts.createdAt)),
  );
}

export async function createMerchant(req: FastifyRequest, body: z.infer<typeof merchantCreate>) {
  if (!authorize(req, "settings.party")) throw new ApiError(403, "forbidden");
  if (body.provider === "fake" && process.env.NODE_ENV === "production")
    throw new ApiError(400, "provider_unavailable");
  return withParty(req.partyId, async (tx) => {
    const [m] = await tx
      .insert(merchantAccounts)
      .values({
        partyId: req.partyId,
        provider: body.provider,
        credentialsRef: body.credentialsRef,
        currency: body.currency,
      })
      .returning({ id: merchantAccounts.id });
    await audit(tx, {
      partyId: req.partyId,
      actorUserId: req.auth?.userId ?? null,
      actorKind: "member",
      action: "settings.merchant.create",
      targetType: "merchant_account",
      targetId: m!.id,
      metadata: { provider: body.provider },
      ip: req.ip,
    });
    return { id: m!.id };
  });
}

export async function updateMerchant(req: FastifyRequest, id: string, body: z.infer<typeof merchantUpdate>) {
  if (!authorize(req, "settings.party")) throw new ApiError(403, "forbidden");
  await withParty(req.partyId, async (tx) => {
    const rows = await tx
      .update(merchantAccounts)
      .set({ active: body.active, updatedAt: new Date() })
      .where(eq(merchantAccounts.id, id))
      .returning({ id: merchantAccounts.id });
    if (!rows.length) throw new ApiError(404, "not_found");
    await audit(tx, {
      partyId: req.partyId,
      actorUserId: req.auth?.userId ?? null,
      actorKind: "member",
      action: "settings.merchant.update",
      targetType: "merchant_account",
      targetId: id,
      metadata: body,
      ip: req.ip,
    });
  });
}
