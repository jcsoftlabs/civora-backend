// FIN-10 : paiements en espèces saisis par un trésorier, reçus numérotés, écriture au journal des recettes.
import type { FastifyRequest } from "fastify";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  duesObligations,
  duesPlans,
  ledgerEntries,
  members,
  parties,
  payments,
  receipts,
  users,
  withParty,
  zones,
  type Tx,
} from "@civora/db";
import { audit } from "../../lib/audit.js";
import type { EmailSender } from "../../lib/messaging/email.js";
import { RECEIPT_MESSAGES, messageLocale } from "../../lib/messaging/templates.js";
import { formatAmount, sum, toCents } from "../../lib/money.js";
import { zoneScope } from "../../lib/zone-scope.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize } from "../../plugins/tenant.js";
import { receiptPdf } from "./receipt-pdf.js";
import type { cashPayment } from "./schemas.js";
import type { z } from "zod";

type Req = FastifyRequest;

/**
 * Solde d'un paiement confirmé, commun aux espèces et au paiement mobile : échéances payées (celles encore dues),
 * recette au journal, reçu numéroté, audit. Une échéance déjà réglée entre-temps par un autre paiement n'est
 * pas payée deux fois : l'écart est signalé au journal d'audit pour le trésorier.
 */
export async function settle(
  tx: Tx,
  p: {
    partyId: string;
    paymentId: string;
    memberZoneId: string;
    obligationIds: string[];
    amount: string;
    currency: string;
    provider: string;
    actorUserId: string | null;
    ip?: string;
  },
): Promise<{ receiptId: string; number: string }> {
  const now = new Date();
  const settled = p.obligationIds.length
    ? await tx
        .update(duesObligations)
        .set({ paidAt: now, paymentId: p.paymentId, updatedAt: now })
        .where(and(inArray(duesObligations.id, p.obligationIds), isNull(duesObligations.paidAt)))
        .returning({ id: duesObligations.id })
    : [];
  await tx.insert(ledgerEntries).values({
    partyId: p.partyId,
    zoneId: p.memberZoneId,
    direction: "in",
    category: "cotisation",
    amount: p.amount,
    currency: p.currency,
    paymentId: p.paymentId,
    occurredAt: now,
  });
  const number = await nextReceiptNumber(tx, p.partyId, now.getUTCFullYear());
  const [receipt] = await tx
    .insert(receipts)
    .values({ partyId: p.partyId, paymentId: p.paymentId, number })
    .returning({ id: receipts.id });
  const base = {
    partyId: p.partyId,
    actorUserId: p.actorUserId,
    actorKind: p.actorUserId ? ("member" as const) : ("system" as const),
    targetType: "payment",
    targetId: p.paymentId,
    ...(p.ip ? { ip: p.ip } : {}),
  };
  await audit(tx, {
    ...base,
    action: p.provider === "cash" ? "payment.cash.record" : "payment.confirmed",
    metadata: {
      amount: p.amount,
      currency: p.currency,
      provider: p.provider,
      receipt: number,
      obligations: settled.length,
    },
  });
  if (settled.length < p.obligationIds.length) {
    await audit(tx, {
      ...base,
      action: "payment.conflict",
      metadata: { reason: "obligation_already_paid", expected: p.obligationIds.length, settled: settled.length },
    });
  }
  return { receiptId: receipt!.id, number };
}

/** Numéro de reçu suivant pour l'année : AAAA-NNNNNN, sans trou ni doublon (verrou par parti). */
async function nextReceiptNumber(tx: Tx, partyId: string, year: number): Promise<string> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"receipts:" + partyId}, 0))`);
  const prefix = `${year}-`;
  const [r] = await tx.execute<{ n: string }>(
    sql`select coalesce(max(substring(number from 6)::int), 0) + 1 as n from receipts where number like ${prefix + "%"}`,
  );
  return `${prefix}${String(r?.n ?? 1).padStart(6, "0")}`;
}

export interface ReceiptView {
  id: string;
  number: string;
  issuedAt: string;
  partyName: string;
  member: { number: string; name: string };
  amount: string;
  currency: string;
  provider: string;
  recordedBy: string | null;
  lines: Array<{ plan: Record<string, string>; periodStart: string; amount: string }>;
}

export class PaymentsService {
  constructor(private readonly email: EmailSender) {}

  /**
   * Saisie d'un paiement en espèces. Tout ou rien, dans une transaction : paiement, échéances payées,
   * écriture au journal, reçu numéroté, audit. Rejouer la même saisie (même clientRef) renvoie le même reçu.
   */
  async recordCash(
    req: Req,
    body: z.infer<typeof cashPayment>,
    retried = false,
  ): Promise<{ paymentId: string; receiptId: string; receiptNumber: string }> {
    const idempotencyKey = `cash:${body.clientRef}`;
    let result: { paymentId: string; receiptId: string; receiptNumber: string; replay: boolean };
    try {
      result = await this.recordCashOnce(req, body, idempotencyKey);
    } catch (e) {
      // Même saisie reçue deux fois au même instant : la seconde relit le reçu de la première.
      const cause = (e as { cause?: { code?: string; constraint_name?: string } }).cause;
      if (!retried && cause?.code === "23505" && cause.constraint_name === "payments_party_idempotency_key") {
        return this.recordCash(req, body, true);
      }
      throw e;
    }
    if (!result.replay) {
      // Reçu par e-mail après validation ; un échec d'envoi n'annule pas le paiement (le reçu reste dans l'application).
      await this.sendReceipt(req.partyId, result.receiptId).catch((err: unknown) =>
        req.log.warn({ err }, "reçu non envoyé"),
      );
    }
    const { replay: _r, ...out } = result;
    return out;
  }

  private async recordCashOnce(req: Req, body: z.infer<typeof cashPayment>, idempotencyKey: string) {
    return withParty(req.partyId, async (tx) => {
      // Verrou sur la saisie elle-même : un doublon simultané attend la première, puis relit son reçu.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"payment:" + idempotencyKey}, 0))`);
      const [existing] = await tx
        .select({ id: payments.id, memberId: payments.memberId })
        .from(payments)
        .where(eq(payments.idempotencyKey, idempotencyKey));
      if (existing) {
        if (existing.memberId !== body.memberId) throw new ApiError(409, "idempotency_conflict");
        const [r] = await tx
          .select({ id: receipts.id, number: receipts.number })
          .from(receipts)
          .where(eq(receipts.paymentId, existing.id));
        return { paymentId: existing.id, receiptId: r!.id, receiptNumber: r!.number, replay: true };
      }

      const [m] = await tx
        .select({ id: members.id, zoneId: members.zoneId, zonePath: zones.path, state: members.applicationState })
        .from(members)
        .innerJoin(zones, eq(zones.id, members.zoneId))
        .where(and(eq(members.id, body.memberId), isNull(members.deletedAt)));
      if (!m) throw new ApiError(404, "not_found");
      if (!authorize(req, "payments.recordCash", m.zonePath)) throw new ApiError(403, "forbidden");

      // Verrou sur les échéances : deux trésoriers ne peuvent pas encaisser la même.
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
        .where(inArray(duesObligations.id, body.obligationIds))
        .for("update", { of: duesObligations });
      if (
        obligations.length !== new Set(body.obligationIds).size ||
        obligations.some((o) => o.memberId !== body.memberId)
      ) {
        throw new ApiError(400, "obligation_not_found");
      }
      if (obligations.some((o) => o.paidAt)) throw new ApiError(409, "obligation_already_paid");
      if (obligations.some((o) => o.currency !== body.currency)) throw new ApiError(400, "currency_mismatch");
      const expected = sum(obligations.map((o) => o.amount));
      if (toCents(expected) !== toCents(body.amount)) throw new ApiError(400, "amount_mismatch");

      const now = new Date();
      const [payment] = await tx
        .insert(payments)
        .values({
          partyId: req.partyId,
          memberId: body.memberId,
          kind: "dues",
          provider: "cash",
          idempotencyKey,
          amount: expected,
          currency: body.currency,
          status: "succeeded",
          recordedByMemberId: req.memberId,
          confirmedAt: now,
          obligationIds: body.obligationIds,
        })
        .returning({ id: payments.id });
      const paymentId = payment!.id;
      const { receiptId, number } = await settle(tx, {
        partyId: req.partyId,
        paymentId,
        memberZoneId: m.zoneId,
        obligationIds: body.obligationIds,
        amount: expected,
        currency: body.currency,
        provider: "cash",
        actorUserId: req.auth?.userId ?? null,
        ip: req.clientIp,
      });
      const receipt = { id: receiptId };
      return { paymentId, receiptId: receipt!.id, receiptNumber: number, replay: false };
    });
  }

  private async loadReceipt(
    tx: Tx,
    receiptId: string,
  ): Promise<(ReceiptView & { memberId: string; zonePath: string; email: string | null; locale: string }) | null> {
    const [r] = await tx
      .select({
        id: receipts.id,
        number: receipts.number,
        issuedAt: receipts.createdAt,
        paymentId: payments.id,
        amount: payments.amount,
        currency: payments.currency,
        provider: payments.provider,
        recordedBy: payments.recordedByMemberId,
        memberId: members.id,
        memberNumber: members.memberNumber,
        firstName: members.firstName,
        lastName: members.lastName,
        zonePath: zones.path,
        email: users.email,
        locale: users.locale,
      })
      .from(receipts)
      .innerJoin(payments, and(eq(payments.partyId, receipts.partyId), eq(payments.id, receipts.paymentId)))
      .innerJoin(members, and(eq(members.partyId, payments.partyId), eq(members.id, payments.memberId)))
      .innerJoin(zones, eq(zones.id, members.zoneId))
      .leftJoin(users, eq(users.id, members.userId))
      .where(eq(receipts.id, receiptId));
    if (!r) return null;
    const lines = await tx
      .select({ plan: duesPlans.name, periodStart: duesObligations.periodStart, amount: duesObligations.amount })
      .from(duesObligations)
      .innerJoin(
        duesPlans,
        and(eq(duesPlans.partyId, duesObligations.partyId), eq(duesPlans.id, duesObligations.planId)),
      )
      .where(eq(duesObligations.paymentId, r.paymentId))
      .orderBy(duesObligations.periodStart);
    const [party] = await tx.select({ name: parties.name }).from(parties);
    let recordedBy: string | null = null;
    if (r.recordedBy) {
      const [t] = await tx
        .select({ f: members.firstName, l: members.lastName })
        .from(members)
        .where(eq(members.id, r.recordedBy));
      recordedBy = t ? `${t.f} ${t.l}` : null;
    }
    return {
      id: r.id,
      number: r.number,
      issuedAt: r.issuedAt.toISOString(),
      partyName: party?.name ?? "",
      member: { number: r.memberNumber, name: `${r.firstName} ${r.lastName}` },
      amount: r.amount,
      currency: r.currency,
      provider: r.provider,
      recordedBy,
      lines: lines.map((l) => ({
        plan: l.plan as Record<string, string>,
        periodStart: l.periodStart,
        amount: l.amount,
      })),
      memberId: r.memberId,
      zonePath: r.zonePath,
      email: r.email,
      locale: r.locale ?? "fr",
    };
  }

  private async sendReceipt(partyId: string, receiptId: string) {
    const r = await withParty(partyId, (tx) => this.loadReceipt(tx, receiptId));
    if (!r?.email) return;
    const lang = messageLocale(r.locale);
    const t = RECEIPT_MESSAGES[lang];
    await this.email.send({
      to: r.email,
      subject: t.subject(r.partyName, r.number),
      text: t.text({
        party: r.partyName,
        number: r.number,
        amount: formatAmount(r.amount, r.currency),
        method: t.methods[r.provider] ?? r.provider,
        periods: r.lines.map((l) => `${l.plan[lang] ?? l.plan.fr} (${l.periodStart})`).join(", "),
        recordedBy: r.recordedBy ?? "",
      }),
    });
  }

  /** Reçu : visible par le membre lui-même, ou par un responsable qui lit les paiements dans sa zone. */
  async receipt(req: Req, receiptId: string) {
    return withParty(req.partyId, async (tx) => {
      const r = await this.loadReceipt(tx, receiptId);
      if (!r) throw new ApiError(404, "not_found");
      if (r.memberId !== req.memberId && !authorize(req, "payments.read", r.zonePath))
        throw new ApiError(403, "forbidden");
      const { memberId: _m, zonePath: _z, email: _e, locale, ...view } = r;
      return { view, locale };
    });
  }

  async receiptPdf(req: Req, receiptId: string) {
    const { view, locale } = await this.receipt(req, receiptId);
    return { body: await receiptPdf(view, messageLocale(locale)), filename: `recu-${view.number}.pdf` };
  }

  /** Paiements visibles dans la zone (payments.read), du plus récent au plus ancien. */
  async list(req: Req, q: { memberId?: string | undefined; limit: number }) {
    const scope = zoneScope(req, "payments.read");
    const self = q.memberId === req.memberId;
    if (!scope.allowed && !self) throw new ApiError(403, "forbidden");
    return withParty(req.partyId, (tx) =>
      tx
        .select({
          id: payments.id,
          memberId: payments.memberId,
          amount: payments.amount,
          currency: payments.currency,
          provider: payments.provider,
          status: payments.status,
          confirmedAt: payments.confirmedAt,
          receiptId: receipts.id,
          receiptNumber: receipts.number,
        })
        .from(payments)
        .innerJoin(members, and(eq(members.partyId, payments.partyId), eq(members.id, payments.memberId)))
        .innerJoin(zones, eq(zones.id, members.zoneId))
        .leftJoin(receipts, and(eq(receipts.partyId, payments.partyId), eq(receipts.paymentId, payments.id)))
        .where(
          and(self ? undefined : scope.where(zones.path), q.memberId ? eq(payments.memberId, q.memberId) : undefined),
        )
        .orderBy(desc(payments.createdAt))
        .limit(q.limit),
    );
  }
}
