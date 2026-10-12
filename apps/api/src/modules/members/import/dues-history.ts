// ADH-10 : import de l'historique des cotisations. Chaque ligne est un paiement passé : le membre est retrouvé
// (numéro, téléphone, e-mail, nom complet unique), la période lue et rattachée aux échéances de sa formule.
// À l'exécution : un paiement « historique » réglé à sa vraie date, les échéances couvertes soldées (créées si elles
// précèdent l'arrivée dans civora), une écriture au journal. Jamais d'échéance impayée dans le passé, jamais de
// reçu civora (l'ancien numéro est gardé), ni e-mail, ni points.
import type { FastifyRequest } from "fastify";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  duesObligations,
  duesPlans,
  duesSubscriptions,
  ledgerEntries,
  memberImportRows,
  members,
  payments,
  users,
  zones,
  type Tx,
} from "@civora/db";
import type { Periodicity } from "@civora/shared";
import { authorize } from "../../../plugins/tenant.js";
import { today } from "../../../lib/today.js";
import { parseAmount, parsePeriod, periodsFor, type PlanCalendar } from "./dues-periods.js";
import { plain, type DuesMapping } from "./fields.js";
import { normalizeDate, normalizeEmail, normalizePhone, splitFullName } from "./normalize.js";
import type { Table } from "./parse.js";

/** Problèmes qui empêchent d'importer un paiement. */
export const DUES_BLOCKING = [
  "member_not_found",
  "member_ambiguous",
  "amount_invalid",
  "currency_mismatch",
  "no_plan",
  "period_missing",
  "zone_outside_scope",
  "already_paid",
] as const;

export interface DuesRowData {
  memberName: string;
  memberNumber: string | null;
  amount: string;
  currency: string;
  paidAt: string;
  planId: string;
  periods: string[];
  method: string | null;
  receiptRef: string | null;
}

const CURRENCIES = ["HTG", "USD", "EUR", "CAD"];
const currencyOf = (v: string) => {
  const p = plain(v);
  if (!p) return null;
  if (["htg", "gourde", "gourdes", "goud", "g"].includes(p)) return "HTG";
  if (["usd", "us", "dollar", "dollars", "dola", "us"].includes(p)) return "USD";
  if (["eur", "euro", "euros"].includes(p)) return "EUR";
  if (["cad", "dollar canadien", "dollars canadiens"].includes(p)) return "CAD";
  return CURRENCIES.includes(v.trim().toUpperCase()) ? v.trim().toUpperCase() : "?";
};

export async function analyzeDues(
  tx: Tx,
  req: FastifyRequest,
  importId: string,
  t: Table,
  m: DuesMapping,
): Promise<Record<string, unknown>> {
  const cell = (cells: string[], f: keyof DuesMapping) => (m[f] === undefined ? "" : (cells[m[f]!] ?? "").trim());
  // Membres du parti, pour les retrouver par numéro, téléphone, e-mail ou nom complet.
  const all = await tx
    .select({
      id: members.id,
      number: members.memberNumber,
      phone: members.phoneE164,
      first: members.firstName,
      last: members.lastName,
      email: users.email,
      zoneId: members.zoneId,
      zonePath: zones.path,
      joinedAt: members.joinedAt,
    })
    .from(members)
    .innerJoin(zones, eq(zones.id, members.zoneId))
    .leftJoin(users, eq(users.id, members.userId))
    .where(and(eq(members.applicationState, "approved"), isNull(members.deletedAt)));
  const index = (key: (x: (typeof all)[number]) => string | null) => {
    const map = new Map<string, (typeof all)[number][]>();
    for (const x of all) {
      const k = key(x);
      if (k) map.set(k, [...(map.get(k) ?? []), x]);
    }
    return map;
  };
  const byNumber = index((x) => x.number.replace(/^0+/, ""));
  const byPhone = index((x) => x.phone);
  const byEmail = index((x) => x.email);
  const byName = index((x) => plain(`${x.first} ${x.last}`));

  const plans = await tx.select().from(duesPlans);
  const subs = await tx
    .select({
      memberId: duesSubscriptions.memberId,
      planId: duesSubscriptions.planId,
      startsOn: duesSubscriptions.startsOn,
    })
    .from(duesSubscriptions)
    .where(isNull(duesSubscriptions.endsOn));
  const subsOf = new Map<string, typeof subs>();
  for (const s of subs) subsOf.set(s.memberId, [...(subsOf.get(s.memberId) ?? []), s]);
  const defaults = plans.filter((p) => p.active && p.isDefault);
  const todayStr = today();

  type Built = {
    line: number;
    issues: string[];
    memberId: string | null;
    zoneId: string | null;
    data: DuesRowData | null;
    /** Ce que le fichier écrit du membre, montré tel quel quand il n'est pas retrouvé. */
    label: string;
  };
  const built: Built[] = [];
  for (const r of t.rows) {
    const issues: string[] = [];
    // Le membre : numéro, puis téléphone, e-mail, nom complet (unique seulement).
    let candidates: (typeof all)[number][] = [];
    const number = cell(r.cells, "memberNumber").replace(/\D/g, "").replace(/^0+/, "");
    const phone = normalizePhone(cell(r.cells, "phone"));
    const email = normalizeEmail(cell(r.cells, "email"));
    let name = `${cell(r.cells, "firstName")} ${cell(r.cells, "lastName")}`.trim();
    if (!name && cell(r.cells, "fullName")) {
      const split = splitFullName(cell(r.cells, "fullName"));
      name = split ? `${split.firstName} ${split.lastName}` : cell(r.cells, "fullName");
    }
    for (const found of [
      number ? byNumber.get(number) : undefined,
      phone ? byPhone.get(phone) : undefined,
      email ? byEmail.get(email) : undefined,
      name ? (byName.get(plain(name)) ?? byName.get(plain(name.split(" ").reverse().join(" ")))) : undefined,
    ]) {
      if (found?.length) {
        candidates = found;
        break;
      }
    }
    const member = candidates.length === 1 ? candidates[0]! : null;
    if (!candidates.length) issues.push("member_not_found");
    else if (!member) issues.push("member_ambiguous");
    else if (!authorize(req, "payments.recordCash", member.zonePath)) issues.push("zone_outside_scope");

    const amount = parseAmount(cell(r.cells, "amount"));
    if (!amount) issues.push("amount_invalid");
    const rawPaid = cell(r.cells, "paidAt");
    let paidAt = rawPaid ? normalizeDate(rawPaid, { min: "1950-01-01", max: todayStr }) : null;
    if (rawPaid && !paidAt) issues.push("paid_at_invalid");

    // La formule : celle du membre dans la devise de la ligne, sinon la formule par défaut.
    const rawCurrency = cell(r.cells, "currency");
    const wanted = rawCurrency ? currencyOf(rawCurrency) : null;
    const own = member
      ? (subsOf.get(member.id) ?? []).map((s) => ({ s, p: plans.find((p) => p.id === s.planId)! }))
      : [];
    const pick =
      own.find((o) => !wanted || o.p.currency === wanted) ??
      (defaults.find((p) => !wanted || p.currency === wanted)
        ? { s: null, p: defaults.find((p) => !wanted || p.currency === wanted)! }
        : null);
    if (member && !pick) issues.push(own.length || defaults.length ? "currency_mismatch" : "no_plan");

    // La période : écrite dans le fichier, sinon le mois du paiement.
    let months = parsePeriod(cell(r.cells, "period"));
    if (!months && paidAt) {
      months = [paidAt.slice(0, 7)];
      issues.push("period_from_date");
    }
    if (!months) issues.push("period_missing");
    let periods: string[] = [];
    if (member && pick && months) {
      const cal: PlanCalendar = {
        periodicity: pick.p.periodicity as Periodicity,
        dueRule: pick.p.dueRule as "anniversary" | "fixed",
        fixedDueDay: pick.p.fixedDueDay,
        start: pick.s?.startsOn ?? (member?.joinedAt ? member.joinedAt.toISOString().slice(0, 10) : `${months[0]}-01`),
      };
      periods = periodsFor(cal, months);
      if (amount && Number(amount) !== Number(pick.p.amount) * periods.length) issues.push("amount_mismatch");
    }
    if (!paidAt && periods.length) {
      paidAt = periods[0]!;
      issues.push("paid_at_missing");
    }
    built.push({
      line: r.line,
      issues,
      memberId: member?.id ?? null,
      zoneId: member?.zoneId ?? null,
      label: name || (number ? `n° ${number}` : (phone ?? email ?? "")),
      data:
        member && pick && amount && paidAt
          ? {
              memberName: `${member.first} ${member.last}`,
              memberNumber: member.number,
              amount,
              currency: pick.p.currency,
              paidAt,
              planId: pick.p.id,
              periods,
              method: cell(r.cells, "method") || null,
              receiptRef: cell(r.cells, "receiptRef").slice(0, 60) || null,
            }
          : null,
    });
  }

  // Périodes déjà payées dans civora : écartées ; une ligne sans période restante n'a plus rien à faire.
  const ids = [...new Set(built.map((b) => b.memberId).filter((x): x is string => !!x))];
  const paid = new Set<string>();
  for (let i = 0; i < ids.length; i += 1000)
    for (const o of await tx
      .select({
        memberId: duesObligations.memberId,
        planId: duesObligations.planId,
        periodStart: duesObligations.periodStart,
      })
      .from(duesObligations)
      .where(and(inArray(duesObligations.memberId, ids.slice(i, i + 1000)), isNotNull(duesObligations.paidAt))))
      paid.add(`${o.memberId}|${o.planId}|${o.periodStart}`);
  // Doublons dans le fichier : même membre, même échéance ; la première ligne l'emporte.
  const seen = new Set<string>();
  const dup = new Set<number>();
  for (const b of built) {
    if (!b.data) continue;
    const keys = b.data.periods.map((p) => `${b.memberId}|${b.data!.planId}|${p}`);
    const free = keys.filter((k) => !paid.has(k));
    if (free.length < keys.length) b.issues.push(free.length ? "some_periods_paid" : "already_paid");
    if (free.some((k) => seen.has(k))) dup.add(b.line);
    else free.forEach((k) => seen.add(k));
    b.data.periods = b.data.periods.filter((p) => !paid.has(`${b.memberId}|${b.data!.planId}|${p}`));
  }

  await tx.delete(memberImportRows).where(eq(memberImportRows.importId, importId));
  const blocking = new Set<string>(DUES_BLOCKING);
  for (let i = 0; i < built.length; i += 500)
    await tx.insert(memberImportRows).values(
      built.slice(i, i + 500).map((b) => ({
        partyId: req.partyId,
        importId,
        line: b.line,
        data: b.data ?? { memberName: b.label, periods: [] },
        zoneId: b.zoneId,
        memberId: b.memberId,
        issues: b.issues,
        duplicateReason: dup.has(b.line) ? "file" : null,
        decision: b.issues.some((x) => blocking.has(x)) || dup.has(b.line) || !b.data ? "skip" : "create",
      })),
    );

  const errors: Record<string, number> = {};
  const warnings: Record<string, number> = {};
  const totals: Record<string, number> = {};
  for (const b of built) {
    for (const x of b.issues)
      (blocking.has(x) ? errors : warnings)[x] = ((blocking.has(x) ? errors : warnings)[x] ?? 0) + 1;
    const ok = b.data && !b.issues.some((x) => blocking.has(x)) && !dup.has(b.line);
    if (ok) totals[b.data!.currency] = (totals[b.data!.currency] ?? 0) + Number(b.data!.amount);
  }
  const blocked = built.filter((b) => b.issues.some((x) => blocking.has(x)) || !b.data).length;
  return {
    rows: built.length,
    valid: built.filter((b) => b.data && !b.issues.some((x) => blocking.has(x)) && !dup.has(b.line)).length,
    blocked,
    duplicates: dup.size,
    duplicatesInFile: dup.size,
    errors,
    warnings,
    unknownZones: [],
    quota: null,
    totals: Object.fromEntries(Object.entries(totals).map(([c, v]) => [c, v.toFixed(2)])),
  };
}

/** Exécution d'une ligne : paiement historique, échéances soldées, écriture au journal. */
export async function executeDues(
  tx: Tx,
  partyId: string,
  row: typeof memberImportRows.$inferSelect,
  recordedBy: string | null,
): Promise<"created" | "skipped"> {
  const d = row.data as DuesRowData;
  const memberId = row.memberId!;
  const [plan] = await tx.select({ amount: duesPlans.amount }).from(duesPlans).where(eq(duesPlans.id, d.planId));
  // L'état a pu changer depuis l'aperçu : une échéance payée entre-temps n'est pas payée deux fois.
  const existing = d.periods.length
    ? await tx
        .select({ id: duesObligations.id, periodStart: duesObligations.periodStart, paidAt: duesObligations.paidAt })
        .from(duesObligations)
        .where(
          and(
            eq(duesObligations.memberId, memberId),
            eq(duesObligations.planId, d.planId),
            inArray(duesObligations.periodStart, d.periods),
          ),
        )
        .for("update")
    : [];
  const free = d.periods.filter((p) => !existing.some((e) => e.periodStart === p && e.paidAt));
  if (!plan || !free.length) return "skipped";
  // Midi, heure d'Haïti, le jour du paiement.
  const paidAt = new Date(`${d.paidAt}T17:00:00Z`);
  const [p] = await tx
    .insert(payments)
    .values({
      partyId,
      memberId,
      kind: "dues",
      provider: "history",
      idempotencyKey: `history:${row.importId}:${row.line}`,
      amount: d.amount,
      currency: d.currency,
      status: "succeeded",
      recordedByMemberId: recordedBy,
      providerRef: d.receiptRef,
      providerStatus: d.method ? `historique : ${d.method.slice(0, 40)}` : "historique",
      confirmedAt: paidAt,
    })
    .returning({ id: payments.id });
  const obligationIds: string[] = [];
  for (const periodStart of free) {
    const open = existing.find((e) => e.periodStart === periodStart);
    if (open) {
      await tx
        .update(duesObligations)
        .set({ paidAt, paymentId: p!.id, updatedAt: new Date() })
        .where(eq(duesObligations.id, open.id));
      obligationIds.push(open.id);
    } else {
      // Échéance antérieure à l'arrivée dans civora : créée déjà soldée, pour l'historique.
      const [o] = await tx
        .insert(duesObligations)
        .values({
          partyId,
          memberId,
          planId: d.planId,
          periodStart,
          dueDate: periodStart,
          amount: plan.amount,
          paidAt,
          paymentId: p!.id,
        })
        .returning({ id: duesObligations.id });
      obligationIds.push(o!.id);
    }
  }
  await tx.update(payments).set({ obligationIds }).where(eq(payments.id, p!.id));
  await tx.insert(ledgerEntries).values({
    partyId,
    zoneId: row.zoneId,
    direction: "in",
    category: "cotisation",
    amount: d.amount,
    currency: d.currency,
    paymentId: p!.id,
    occurredAt: paidAt,
  });
  return "created";
}
