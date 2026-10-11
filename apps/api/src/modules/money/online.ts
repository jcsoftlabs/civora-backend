// FIN-01, FIN-12 : paiement mobile (MonCash, NatCash, KashPaw) vers le compte marchand du parti.
// Confirmation par notification ET par vérification périodique ; l'état vient toujours du fournisseur.
import type { FastifyBaseLogger, FastifyRequest } from "fastify";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { duesObligations, duesPlans, members, merchantAccounts, payments, withParty, type Tx } from "@civora/db";
import { audit } from "../../lib/audit.js";
import { sum, toCents } from "../../lib/money.js";
import type { CredentialStore } from "../../lib/payments/credentials.js";
import { ProviderUnavailable, type PaymentProvider, type VerifyHint } from "../../lib/payments/types.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize } from "../../plugins/tenant.js";
import { settle } from "./service.js";

export const LOCAL_PROVIDERS = ["moncash", "natcash", "kashpaw", "fake"] as const;
export type LocalProvider = (typeof LOCAL_PROVIDERS)[number];
/** Un paiement resté en attente plus de 24 heures est abandonné : ses échéances redeviennent payables. */
const EXPIRE_AFTER_MS = 24 * 3600_000;

export interface OnlineDeps {
  providers: Partial<Record<LocalProvider, PaymentProvider>>;
  credentials: CredentialStore;
  publicUrl: string;
  log: FastifyBaseLogger;
}

export class OnlinePayments {
  constructor(private readonly d: OnlineDeps) {}

  private provider(id: string): PaymentProvider {
    const p = this.d.providers[id as LocalProvider];
    if (!p) throw new ApiError(400, "provider_unavailable");
    return p;
  }

  /** Compte marchand actif DU PARTI pour ce fournisseur (FIN-12) : sans lui, pas de paiement. */
  private async merchant(tx: Tx, provider: string) {
    const [m] = await tx
      .select({
        id: merchantAccounts.id,
        credentialsRef: merchantAccounts.credentialsRef,
        currency: merchantAccounts.currency,
      })
      .from(merchantAccounts)
      .where(and(eq(merchantAccounts.provider, provider), eq(merchantAccounts.active, true)))
      .limit(1);
    if (!m) throw new ApiError(400, "provider_unavailable");
    return m;
  }

  /** Le membre règle ses échéances : paiement en attente, puis lien de paiement chez le fournisseur. */
  async checkout(req: FastifyRequest, body: { provider: LocalProvider; obligationIds: string[]; clientRef: string }) {
    const provider = this.provider(body.provider);
    const idempotencyKey = `${body.provider}:${body.clientRef}`;
    const pending = await withParty(req.partyId, async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"payment:" + idempotencyKey}, 0))`);
      const [existing] = await tx
        .select({ id: payments.id, status: payments.status })
        .from(payments)
        .where(eq(payments.idempotencyKey, idempotencyKey));
      if (existing) return { replay: true as const, paymentId: existing.id, status: existing.status };

      const merchant = await this.merchant(tx, body.provider);
      const obligations = await tx
        .select({
          id: duesObligations.id,
          memberId: duesObligations.memberId,
          amount: duesObligations.amount,
          paidAt: duesObligations.paidAt,
          currency: duesPlans.currency,
        })
        .from(duesObligations)
        .innerJoin(
          duesPlans,
          and(eq(duesPlans.partyId, duesObligations.partyId), eq(duesPlans.id, duesObligations.planId)),
        )
        .where(inArray(duesObligations.id, body.obligationIds));
      if (
        obligations.length !== new Set(body.obligationIds).size ||
        obligations.some((o) => o.memberId !== req.memberId)
      ) {
        throw new ApiError(400, "obligation_not_found");
      }
      if (obligations.some((o) => o.paidAt)) throw new ApiError(409, "obligation_already_paid");
      const currency = obligations[0]!.currency;
      if (obligations.some((o) => o.currency !== currency) || !provider.currencies.includes(currency)) {
        throw new ApiError(400, "currency_not_supported");
      }
      // Une échéance déjà en cours de paiement en ligne n'est pas proposée une seconde fois.
      const [inFlight] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.status, "pending"),
            sql`${payments.obligationIds} && ${`{${body.obligationIds.join(",")}}`}::uuid[]`,
          ),
        );
      if (inFlight) throw new ApiError(409, "payment_in_progress");

      const amount = sum(obligations.map((o) => o.amount));
      const [p] = await tx
        .insert(payments)
        .values({
          partyId: req.partyId,
          memberId: req.memberId,
          kind: "dues",
          provider: body.provider,
          merchantAccountId: merchant.id,
          idempotencyKey,
          amount,
          currency,
          status: "pending",
          obligationIds: body.obligationIds,
        })
        .returning({ id: payments.id });
      await audit(tx, {
        partyId: req.partyId,
        actorUserId: req.auth?.userId ?? null,
        actorKind: "member",
        action: "payment.checkout",
        targetType: "payment",
        targetId: p!.id,
        metadata: { provider: body.provider, amount, currency },
        ip: req.ip,
      });
      return { replay: false as const, paymentId: p!.id, amount, currency, credentialsRef: merchant.credentialsRef };
    });
    if (pending.replay) return { paymentId: pending.paymentId, status: pending.status, redirectUrl: null };

    // Appel au fournisseur hors transaction (réseau) ; en cas d'échec, le paiement est marqué échoué.
    try {
      const creds = await this.d.credentials.get(pending.credentialsRef);
      const checkout = await provider.createCheckout(creds, {
        orderId: pending.paymentId,
        amount: pending.amount,
        currency: pending.currency,
        returnUrl: `${this.d.publicUrl}/payments/return/${req.partyId}/${pending.paymentId}`,
      });
      await withParty(req.partyId, (tx) =>
        tx
          .update(payments)
          .set({ providerRef: checkout.providerRef ?? null, providerStatus: "redirected", updatedAt: new Date() })
          .where(eq(payments.id, pending.paymentId)),
      );
      return { paymentId: pending.paymentId, status: "pending", redirectUrl: checkout.redirectUrl };
    } catch (e) {
      await withParty(req.partyId, (tx) =>
        tx
          .update(payments)
          .set({ status: "failed", providerStatus: "checkout_failed", updatedAt: new Date() })
          .where(eq(payments.id, pending.paymentId)),
      );
      if (e instanceof ProviderUnavailable) throw new ApiError(400, "provider_unavailable");
      this.d.log.warn({ err: e, provider: body.provider }, "création du paiement refusée par le fournisseur");
      throw new ApiError(502, "provider_error");
    }
  }

  /**
   * Relit l'état chez le fournisseur et solde le paiement s'il est confirmé. Idempotent : un paiement déjà soldé
   * ou échoué n'est pas retouché. Le montant et la commande doivent correspondre exactement.
   */
  async confirm(
    partyId: string,
    paymentId: string,
    hint: VerifyHint = {},
  ): Promise<"succeeded" | "failed" | "pending"> {
    const current = await withParty(partyId, async (tx) => {
      const [p] = await tx
        .select({
          id: payments.id,
          status: payments.status,
          provider: payments.provider,
          ref: merchantAccounts.credentialsRef,
          createdAt: payments.createdAt,
        })
        .from(payments)
        .innerJoin(
          merchantAccounts,
          and(eq(merchantAccounts.partyId, payments.partyId), eq(merchantAccounts.id, payments.merchantAccountId)),
        )
        .where(eq(payments.id, paymentId));
      return p ?? null;
    });
    if (!current) throw new ApiError(404, "not_found");
    if (current.status !== "pending") return current.status === "succeeded" ? "succeeded" : "failed";

    const provider = this.provider(current.provider);
    const verified = await provider.verify(await this.d.credentials.get(current.ref), { orderId: paymentId, ...hint });

    return withParty(partyId, async (tx) => {
      // Verrou de ligne : une notification et la vérification périodique simultanées ne soldent qu'une fois.
      const [p] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for("update");
      if (!p || p.status !== "pending") return p?.status === "succeeded" ? "succeeded" : "failed";
      const now = new Date();
      await tx
        .update(payments)
        .set({ lastCheckedAt: now, providerStatus: verified.status })
        .where(eq(payments.id, paymentId));

      if (verified.status === "succeeded") {
        if (
          verified.orderId !== paymentId ||
          verified.amount === null ||
          toCents(verified.amount) !== toCents(p.amount)
        ) {
          // Montant ou commande différents : on ne solde pas, on signale (intervention d'un trésorier).
          await tx.update(payments).set({ providerStatus: "anomaly" }).where(eq(payments.id, paymentId));
          await audit(tx, {
            partyId,
            actorUserId: null,
            actorKind: "system",
            action: "payment.anomaly",
            targetType: "payment",
            targetId: paymentId,
            metadata: { expected: p.amount, received: verified.amount, orderId: verified.orderId },
          });
          return "pending";
        }
        const [m] = await tx.select({ zoneId: members.zoneId }).from(members).where(eq(members.id, p.memberId!));
        await tx
          .update(payments)
          .set({
            status: "succeeded",
            confirmedAt: now,
            providerRef: verified.providerRef ?? p.providerRef,
            updatedAt: now,
          })
          .where(eq(payments.id, paymentId));
        await settle(tx, {
          partyId,
          paymentId,
          memberZoneId: m!.zoneId,
          obligationIds: p.obligationIds,
          amount: p.amount,
          currency: p.currency,
          provider: p.provider,
          actorUserId: null,
        });
        return "succeeded";
      }
      if (verified.status === "failed" || now.getTime() - current.createdAt.getTime() > EXPIRE_AFTER_MS) {
        await tx.update(payments).set({ status: "failed", updatedAt: now }).where(eq(payments.id, paymentId));
        await audit(tx, {
          partyId,
          actorUserId: null,
          actorKind: "system",
          action: "payment.failed",
          targetType: "payment",
          targetId: paymentId,
          metadata: { provider: p.provider, reason: verified.status === "failed" ? "provider" : "expired" },
        });
        return "failed";
      }
      return "pending";
    });
  }

  /**
   * Notification du fournisseur. On vérifie la signature si le fournisseur signe, on n'en tire qu'un identifiant,
   * puis l'état est relu chez le fournisseur avec les identifiants du parti.
   */
  async notify(
    providerId: string,
    partyId: string,
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const provider = this.provider(providerId);
    const ref = await withParty(partyId, async (tx) => (await this.merchant(tx, providerId)).credentialsRef);
    let hint: VerifyHint;
    try {
      hint = provider.parseNotification(await this.d.credentials.get(ref), rawBody, headers);
    } catch {
      throw new ApiError(401, "invalid_signature");
    }
    let paymentId = hint.orderId;
    if (!paymentId && hint.transactionId) {
      const verified = await provider.verify(await this.d.credentials.get(ref), hint);
      paymentId = verified.orderId;
    }
    if (!paymentId || !/^[0-9a-f-]{36}$/i.test(paymentId)) return { status: "ignored" };
    return { status: await this.confirm(partyId, paymentId, hint) };
  }

  /** Vérification périodique (job payments.reconcile, toutes les 5 minutes) des paiements restés en attente. */
  async reconcile(partyId: string, olderThanMs = 60_000): Promise<Record<string, number>> {
    const due = await withParty(partyId, (tx) =>
      tx
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.status, "pending"),
            sql`${payments.provider} <> 'cash'`,
            lt(payments.createdAt, new Date(Date.now() - olderThanMs)),
            or(isNull(payments.lastCheckedAt), lt(payments.lastCheckedAt, new Date(Date.now() - olderThanMs))),
          ),
        )
        .limit(200),
    );
    const out: Record<string, number> = { succeeded: 0, failed: 0, pending: 0 };
    for (const p of due) {
      try {
        out[await this.confirm(partyId, p.id)]!++;
      } catch (err) {
        this.d.log.warn({ err, paymentId: p.id }, "vérification d'un paiement impossible");
        out.pending!++;
      }
    }
    return out;
  }

  /** État d'un paiement, pour l'application après le retour du fournisseur. */
  async status(req: FastifyRequest, paymentId: string) {
    return withParty(req.partyId, async (tx) => {
      const [p] = await tx
        .select({
          id: payments.id,
          memberId: payments.memberId,
          status: payments.status,
          amount: payments.amount,
          currency: payments.currency,
          provider: payments.provider,
        })
        .from(payments)
        .where(eq(payments.id, paymentId));
      if (!p) throw new ApiError(404, "not_found");
      if (p.memberId !== req.memberId && !authorize(req, "payments.read")) throw new ApiError(403, "forbidden");
      const { memberId: _m, ...rest } = p;
      return rest;
    });
  }
}
