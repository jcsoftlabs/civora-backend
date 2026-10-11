// FIN-03, FIN-05 : formules de cotisation du parti, souscriptions des membres, échéances.
import type { FastifyRequest } from "fastify";
import { and, asc, count, eq, gt, isNull, sql } from "drizzle-orm";
import { duesObligations, duesPlans, duesSubscriptions, members, withParty, zones, type Tx } from "@civora/db";
import { checkQuota, obligationState, schedule, type Periodicity } from "@civora/shared";
import { audit } from "../../lib/audit.js";
import { addDays, today } from "../../lib/today.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize } from "../../plugins/tenant.js";
import type { planCreate, planUpdate } from "./schemas.js";
import type { z } from "zod";

type Req = FastifyRequest;
/** Les échéances sont générées jusqu'à aujourd'hui, plus la prochaine à venir (horizon de 45 jours). */
export const DUES_HORIZON_DAYS = 45;

const actor = (req: Req) => ({
  partyId: req.partyId,
  actorUserId: req.auth?.userId ?? null,
  actorKind: "member" as const,
  ip: req.clientIp,
});

export class DuesService {
  async listPlans(req: Req) {
    const manager = authorize(req, "dues.manage");
    return withParty(req.partyId, (tx) =>
      tx
        .select({
          id: duesPlans.id,
          name: duesPlans.name,
          amount: duesPlans.amount,
          currency: duesPlans.currency,
          periodicity: duesPlans.periodicity,
          dueRule: duesPlans.dueRule,
          fixedDueDay: duesPlans.fixedDueDay,
          graceDays: duesPlans.graceDays,
          isDefault: duesPlans.isDefault,
          active: duesPlans.active,
          subscribers: sql<number>`(select count(*)::int from dues_subscriptions s
            where s.plan_id = "dues_plans"."id" and (s.ends_on is null or s.ends_on > current_date))`,
        })
        .from(duesPlans)
        .where(manager ? undefined : eq(duesPlans.active, true))
        .orderBy(asc(duesPlans.createdAt)),
    );
  }

  /** Nouvelle formule : responsable national (dues.manage), dans le quota du palier (2 en Essentiel). */
  async createPlan(req: Req, body: z.infer<typeof planCreate>) {
    if (!authorize(req, "dues.manage")) throw new ApiError(403, "forbidden");
    const e = req.partyEntitlements ?? (await req.server.entitlements.get(req.partyId));
    if (!e) throw new ApiError(401, "unauthenticated");
    return withParty(req.partyId, async (tx) => {
      const [active] = await tx.select({ n: count() }).from(duesPlans).where(eq(duesPlans.active, true));
      const quota = checkQuota(e, "customDuesPlans", active?.n ?? 0);
      if (!quota.allowed) throw Object.assign(new ApiError(402, "quota_dues_plans"), { requiredTier: "mouvement" });
      const [p] = await tx
        .insert(duesPlans)
        .values({
          partyId: req.partyId,
          name: body.name,
          amount: body.amount,
          currency: body.currency,
          periodicity: body.periodicity,
          dueRule: body.dueRule,
          fixedDueDay: body.dueRule === "fixed" ? (body.fixedDueDay ?? null) : null,
          graceDays: body.graceDays,
          isDefault: body.isDefault,
        })
        .returning({ id: duesPlans.id });
      await audit(tx, {
        ...actor(req),
        action: "dues.plan.create",
        targetType: "dues_plan",
        targetId: p!.id,
        metadata: { ...body },
      });
      return { id: p!.id };
    });
  }

  /**
   * Modification : nom, montant (échéances futures seulement), délai de grâce, formule par défaut, activation.
   * Le rythme et la règle d'échéance ne changent pas : on crée une nouvelle formule.
   */
  async updatePlan(req: Req, id: string, body: z.infer<typeof planUpdate>) {
    if (!authorize(req, "dues.manage")) throw new ApiError(403, "forbidden");
    const e = req.partyEntitlements ?? (await req.server.entitlements.get(req.partyId));
    if (!e) throw new ApiError(401, "unauthenticated");
    await withParty(req.partyId, async (tx) => {
      const [plan] = await tx
        .select({ active: duesPlans.active, amount: duesPlans.amount })
        .from(duesPlans)
        .where(eq(duesPlans.id, id));
      if (!plan) throw new ApiError(404, "not_found");
      if (body.active && !plan.active) {
        const [active] = await tx.select({ n: count() }).from(duesPlans).where(eq(duesPlans.active, true));
        if (!checkQuota(e, "customDuesPlans", active?.n ?? 0).allowed) {
          throw Object.assign(new ApiError(402, "quota_dues_plans"), { requiredTier: "mouvement" });
        }
      }
      await tx
        .update(duesPlans)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(duesPlans.id, id));
      if (body.amount && body.amount !== plan.amount) {
        // Nouveau montant : seules les échéances futures et non payées sont mises à jour.
        await tx
          .update(duesObligations)
          .set({ amount: body.amount, updatedAt: new Date() })
          .where(
            and(eq(duesObligations.planId, id), isNull(duesObligations.paidAt), gt(duesObligations.dueDate, today())),
          );
      }
      await audit(tx, {
        ...actor(req),
        action: "dues.plan.update",
        targetType: "dues_plan",
        targetId: id,
        metadata: { ...body, previousAmount: plan.amount },
      });
    });
  }

  /**
   * Génère les échéances manquantes de toutes les souscriptions actives jusqu'à `until`. Idempotent :
   * l'unicité (parti, membre, formule, période) écarte les doublons. Appelé à la souscription, et par le job nocturne.
   */
  async generate(
    tx: Tx,
    partyId: string,
    until = addDays(today(), DUES_HORIZON_DAYS),
    memberId?: string,
  ): Promise<number> {
    const subs = await tx
      .select({
        memberId: duesSubscriptions.memberId,
        planId: duesSubscriptions.planId,
        startsOn: duesSubscriptions.startsOn,
        endsOn: duesSubscriptions.endsOn,
        periodicity: duesPlans.periodicity,
        dueRule: duesPlans.dueRule,
        fixedDueDay: duesPlans.fixedDueDay,
        amount: duesPlans.amount,
      })
      .from(duesSubscriptions)
      .innerJoin(
        duesPlans,
        and(eq(duesPlans.partyId, duesSubscriptions.partyId), eq(duesPlans.id, duesSubscriptions.planId)),
      )
      .where(and(eq(duesPlans.active, true), memberId ? eq(duesSubscriptions.memberId, memberId) : undefined));

    const rows = subs.flatMap((s) =>
      schedule({
        periodicity: s.periodicity as Periodicity,
        dueRule: s.dueRule as "anniversary" | "fixed",
        fixedDueDay: s.fixedDueDay,
        start: s.startsOn,
        until: s.endsOn && s.endsOn < until ? s.endsOn : until,
      }).map((p) => ({
        partyId,
        memberId: s.memberId,
        planId: s.planId,
        periodStart: p.periodStart,
        dueDate: p.dueDate,
        amount: s.amount,
      })),
    );
    let created = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const inserted = await tx
        .insert(duesObligations)
        .values(rows.slice(i, i + 500))
        .onConflictDoNothing({
          target: [
            duesObligations.partyId,
            duesObligations.memberId,
            duesObligations.planId,
            duesObligations.periodStart,
          ],
        })
        .returning({ id: duesObligations.id });
      created += inserted.length;
    }
    return created;
  }

  /** Souscription d'un membre à une formule, puis génération de ses échéances. */
  async subscribe(tx: Tx, partyId: string, memberId: string, planId: string, startsOn: string): Promise<void> {
    await tx
      .insert(duesSubscriptions)
      .values({ partyId, memberId, planId, startsOn })
      .onConflictDoUpdate({
        target: [duesSubscriptions.partyId, duesSubscriptions.memberId, duesSubscriptions.planId],
        set: { endsOn: null, updatedAt: new Date() },
      });
    await this.generate(tx, partyId, undefined, memberId);
  }

  /** Membre accepté (adhésion libre ou validée) : formules par défaut, à compter de la date d'adhésion (FIN-05). */
  async onMemberApproved(tx: Tx, partyId: string, memberId: string, joinedAt: Date): Promise<void> {
    const defaults = await tx
      .select({ id: duesPlans.id })
      .from(duesPlans)
      .where(and(eq(duesPlans.active, true), eq(duesPlans.isDefault, true)));
    const start = today("America/Port-au-Prince", joinedAt);
    for (const p of defaults) await this.subscribe(tx, partyId, memberId, p.id, start);
  }

  private async memberInScope(tx: Tx, req: Req, memberId: string, ...permissions: Parameters<typeof authorize>[1][]) {
    const [m] = await tx
      .select({ id: members.id, state: members.applicationState, zonePath: zones.path })
      .from(members)
      .innerJoin(zones, eq(zones.id, members.zoneId))
      .where(and(eq(members.id, memberId), isNull(members.deletedAt)));
    if (!m) throw new ApiError(404, "not_found");
    if (!permissions.some((p) => authorize(req, p, m.zonePath))) throw new ApiError(403, "forbidden");
    return m;
  }

  /** Attribution d'une formule par un trésorier de la zone ; échéances à compter d'aujourd'hui. */
  async assign(req: Req, memberId: string, planId: string) {
    await withParty(req.partyId, async (tx) => {
      const m = await this.memberInScope(tx, req, memberId, "dues.manage");
      if (m.state !== "approved") throw new ApiError(400, "member_not_eligible");
      const [plan] = await tx.select({ active: duesPlans.active }).from(duesPlans).where(eq(duesPlans.id, planId));
      if (!plan?.active) throw new ApiError(400, "plan_not_found");
      await this.subscribe(tx, req.partyId, memberId, planId, today());
      await audit(tx, {
        ...actor(req),
        action: "dues.subscribe",
        targetType: "member",
        targetId: memberId,
        metadata: { planId },
      });
    });
  }

  /** Fin de souscription : les échéances futures non payées disparaissent, l'historique reste. */
  async unassign(req: Req, memberId: string, planId: string) {
    await withParty(req.partyId, async (tx) => {
      await this.memberInScope(tx, req, memberId, "dues.manage");
      const day = today();
      const ended = await tx
        .update(duesSubscriptions)
        .set({ endsOn: day, updatedAt: new Date() })
        .where(
          and(
            eq(duesSubscriptions.memberId, memberId),
            eq(duesSubscriptions.planId, planId),
            isNull(duesSubscriptions.endsOn),
          ),
        )
        .returning({ id: duesSubscriptions.id });
      if (!ended.length) throw new ApiError(404, "not_found");
      await tx
        .delete(duesObligations)
        .where(
          and(
            eq(duesObligations.memberId, memberId),
            eq(duesObligations.planId, planId),
            isNull(duesObligations.paidAt),
            gt(duesObligations.dueDate, day),
          ),
        );
      await audit(tx, {
        ...actor(req),
        action: "dues.unsubscribe",
        targetType: "member",
        targetId: memberId,
        metadata: { planId },
      });
    });
  }

  /** Relevé d'un membre : échéances avec leur état (à venir, due, en retard, payée) et synthèse. */
  private async statement(tx: Tx, memberId: string) {
    const day = today();
    const rows = await tx
      .select({
        id: duesObligations.id,
        planId: duesObligations.planId,
        planName: duesPlans.name,
        periodStart: duesObligations.periodStart,
        dueDate: duesObligations.dueDate,
        amount: duesObligations.amount,
        currency: duesPlans.currency,
        paidAt: duesObligations.paidAt,
        graceDays: duesPlans.graceDays,
      })
      .from(duesObligations)
      .innerJoin(
        duesPlans,
        and(eq(duesPlans.partyId, duesObligations.partyId), eq(duesPlans.id, duesObligations.planId)),
      )
      .where(eq(duesObligations.memberId, memberId))
      .orderBy(asc(duesObligations.dueDate));
    const obligations = rows.map(({ graceDays, ...o }) => ({
      ...o,
      paidAt: o.paidAt ? o.paidAt.toISOString() : null,
      state: obligationState({ dueDate: o.dueDate, paidAt: o.paidAt ? o.paidAt.toISOString() : null }, day, graceDays),
    }));
    const outstanding: Record<string, string> = {};
    for (const o of obligations) {
      if (o.state === "due" || o.state === "late") {
        // Somme exacte en centimes : jamais de flottant sur les montants.
        const cents = BigInt(Math.round(Number(o.amount) * 100));
        const prev = BigInt(Math.round(Number(outstanding[o.currency] ?? "0") * 100));
        const total = prev + cents;
        outstanding[o.currency] = `${total / 100n}.${String(total % 100n).padStart(2, "0")}`;
      }
    }
    // Formules suivies en ce moment : affichées dans la fiche, retirables par un trésorier de la zone.
    const subscriptions = await tx
      .select({
        planId: duesSubscriptions.planId,
        name: duesPlans.name,
        amount: duesPlans.amount,
        currency: duesPlans.currency,
        periodicity: duesPlans.periodicity,
        startsOn: duesSubscriptions.startsOn,
      })
      .from(duesSubscriptions)
      .innerJoin(
        duesPlans,
        and(eq(duesPlans.partyId, duesSubscriptions.partyId), eq(duesPlans.id, duesSubscriptions.planId)),
      )
      .where(and(eq(duesSubscriptions.memberId, memberId), isNull(duesSubscriptions.endsOn)))
      .orderBy(asc(duesSubscriptions.startsOn));
    return { upToDate: !obligations.some((o) => o.state === "late"), outstanding, obligations, subscriptions };
  }

  async myDues(req: Req) {
    return withParty(req.partyId, (tx) => this.statement(tx, req.memberId!));
  }

  async memberDues(req: Req, memberId: string) {
    return withParty(req.partyId, async (tx) => {
      await this.memberInScope(tx, req, memberId, "dues.manage", "payments.read");
      return this.statement(tx, memberId);
    });
  }

  /** Génération manuelle (en attendant le job nocturne dues.generate), responsable national. */
  async generateAll(req: Req, until?: string) {
    if (!authorize(req, "dues.manage")) throw new ApiError(403, "forbidden");
    return withParty(req.partyId, async (tx) => ({ created: await this.generate(tx, req.partyId, until) }));
  }
}
