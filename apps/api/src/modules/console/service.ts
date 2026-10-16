// SOC-10 : console de l'éditeur. Vue d'ensemble de la plateforme, liste et fiche des organisations, actions
// de gestion (activer, suspendre, formule, essai, module Élections, invitation), création manuelle, équipe et
// journal. La console ne lit que des totaux : jamais un membre, un paiement ou un document d'une organisation
// (SEC-11). Chaque action est inscrite au journal de la console et au journal de l'organisation concernée.
import { PLATFORM_BRAND, composeMail } from "../../lib/messaging/mail.js";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import {
  members,
  parties,
  platformAuditLog,
  platformStaff,
  subscriptions,
  users,
  withConsole,
  withParty,
  type Tx,
} from "@civora/db";
import { PLANS, type OrganizationKind, type Tier } from "@civora/shared";
import { audit } from "../../lib/audit.js";
import type { EmailSender } from "../../lib/messaging/email.js";
import { ApiError } from "../../plugins/errors.js";
import type { EntitlementsCache } from "../../lib/entitlements.js";
import { consoleAudit, normalizeStaffEmail, type StaffContext } from "./auth.js";

const DAY = 86_400_000;

type PartyRow = {
  id: string;
  slug: string;
  name: string;
  organization_kind: OrganizationKind;
  tier: Tier;
  status: string;
  created_at: Date;
  activated_at: Date | null;
  elections_module_until: Date | null;
};

/** Totaux d'une organisation, lus dans sa propre RLS : effectifs, activité, consommation. Aucun nom. */
async function partyTotals(id: string) {
  return withParty(id, async (tx) => {
    const since30 = new Date(Date.now() - 30 * DAY);
    const [m] = await tx.execute<{
      members: number;
      new_30: number;
      pending: number;
      active_users_30: number;
      storage_bytes: string;
      last_activity: Date | null;
    }>(sql`
      select
        (select count(*)::int from members where application_state = 'approved' and deleted_at is null) as members,
        (select count(*)::int from members where application_state = 'approved' and deleted_at is null
          and joined_at >= ${since30.toISOString()}::timestamptz) as new_30,
        (select count(*)::int from members where application_state = 'pending' and deleted_at is null) as pending,
        (select count(distinct user_id)::int from sessions where last_seen_at >= ${since30.toISOString()}::timestamptz)
          as active_users_30,
        (select coalesce(sum(size_bytes), 0)::text from files where upload_status = 'ready' and trashed_at is null)
          as storage_bytes,
        greatest(
          (select max(last_seen_at) from sessions),
          (select max(created_at) from audit_log)
        ) as last_activity`);
    const collected = await tx.execute<{ currency: string; total: string; n: number }>(sql`
      select currency, sum(amount)::text as total, count(*)::int as n from payments
      where status = 'succeeded' and confirmed_at >= ${since30.toISOString()}::timestamptz group by currency`);
    const [sub] = await tx
      .select({
        status: subscriptions.status,
        tier: subscriptions.tier,
        billingCycle: subscriptions.billingCycle,
        periodEnd: subscriptions.currentPeriodEnd,
      })
      .from(subscriptions)
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    return {
      members: m?.members ?? 0,
      newMembers30: m?.new_30 ?? 0,
      pendingApplications: m?.pending ?? 0,
      activeUsers30: m?.active_users_30 ?? 0,
      storageBytes: Number(m?.storage_bytes ?? 0),
      lastActivity: m?.last_activity ? new Date(m.last_activity) : null,
      collected30: collected.map((c) => ({ currency: c.currency, total: c.total, payments: c.n })),
      subscription: sub ?? null,
    };
  });
}

const monthlyValue = (tier: Tier, cycle: string) =>
  cycle === "annual" ? PLANS[tier].priceUsd.annual / 12 : PLANS[tier].priceUsd.monthly;

export class ConsoleService {
  constructor(
    private readonly d: {
      email: EmailSender;
      entitlements: EntitlementsCache;
      partyOrigin: (slug: string) => string;
    },
  ) {}

  private async partyRows(): Promise<PartyRow[]> {
    const rows = await withConsole((tx) => tx.execute<Record<string, unknown>>(sql`select * from console_parties()`));
    // Requête brute : les dates arrivent en texte.
    const date = (v: unknown) => (v === null || v === undefined ? null : new Date(v as string));
    return rows.map((r) => ({
      ...(r as PartyRow),
      created_at: date(r.created_at)!,
      activated_at: date(r.activated_at),
      elections_module_until: date(r.elections_module_until),
    }));
  }

  private async withTotals() {
    const rows = await this.partyRows();
    const out = [];
    for (const p of rows) out.push({ ...p, totals: p.status === "active" ? await partyTotals(p.id) : null });
    return out;
  }

  /** Vue d'ensemble de la plateforme. */
  async overview() {
    const now = Date.now();
    const orgs = await this.withTotals();
    const active = orgs.filter((o) => o.status === "active");
    const by = <K extends string>(list: typeof orgs, key: (o: (typeof orgs)[number]) => K) =>
      list.reduce<Record<string, number>>((acc, o) => ((acc[key(o)] = (acc[key(o)] ?? 0) + 1), acc), {});
    const subStatus = (o: (typeof orgs)[number]) => o.totals?.subscription?.status ?? "none";
    const paying = active.filter((o) => subStatus(o) === "active");
    const trials = active.filter((o) => subStatus(o) === "trial");
    const mrr = paying.reduce(
      (n, o) => n + monthlyValue(o.totals!.subscription!.tier, o.totals!.subscription!.billingCycle),
      0,
    );
    const trialMrr = trials.reduce((n, o) => n + monthlyValue(o.tier, "monthly"), 0);
    const collected: Record<string, { total: number; payments: number }> = {};
    for (const o of active)
      for (const c of o.totals!.collected30) {
        const x = (collected[c.currency] ??= { total: 0, payments: 0 });
        x.total += Number(c.total);
        x.payments += c.payments;
      }
    // Inscriptions par semaine, sur douze semaines (lundi de chaque semaine).
    const weeks: Array<{ week: string; signups: number }> = [];
    const monday = new Date(now);
    monday.setUTCHours(0, 0, 0, 0);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    for (let i = 11; i >= 0; i--) {
      const start = new Date(monday.getTime() - i * 7 * DAY);
      const end = new Date(start.getTime() + 7 * DAY);
      weeks.push({
        week: start.toISOString().slice(0, 10),
        signups: orgs.filter((o) => o.created_at >= start && o.created_at < end && o.status !== "pending").length,
      });
    }
    const [userCount] = await withConsole((tx) => tx.select({ n: count() }).from(users));
    const health = await this.health();
    return {
      organizations: {
        total: orgs.length,
        byStatus: by(orgs, (o) => o.status),
        byKind: by(active, (o) => o.organization_kind),
        byTier: by(active, (o) => o.tier),
        bySubscription: by(active, subStatus),
        new30: orgs.filter((o) => o.created_at.getTime() >= now - 30 * DAY && o.status === "active").length,
      },
      people: {
        accounts: userCount?.n ?? 0,
        members: active.reduce((n, o) => n + o.totals!.members, 0),
        newMembers30: active.reduce((n, o) => n + o.totals!.newMembers30, 0),
        activeUsers30: active.reduce((n, o) => n + o.totals!.activeUsers30, 0),
        pendingApplications: active.reduce((n, o) => n + o.totals!.pendingApplications, 0),
      },
      revenue: { mrrUsd: Math.round(mrr), trialMrrUsd: Math.round(trialMrr), payingOrganizations: paying.length },
      collected30: collected,
      storageBytes: active.reduce((n, o) => n + o.totals!.storageBytes, 0),
      signupsByWeek: weeks,
      trialsEndingSoon: trials
        .filter((o) => {
          const end = o.totals!.subscription!.periodEnd?.getTime() ?? 0;
          return end >= now && end <= now + 7 * DAY;
        })
        .map((o) => ({ id: o.id, name: o.name, slug: o.slug, endsAt: o.totals!.subscription!.periodEnd })),
      nearMemberQuota: active
        .filter((o) => {
          const q = PLANS[o.tier].quotas.members;
          return q !== null && o.totals!.members >= q * 0.8;
        })
        .map((o) => ({ id: o.id, name: o.name, members: o.totals!.members, quota: PLANS[o.tier].quotas.members })),
      health,
    };
  }

  /** Santé du service : base de données, file des tâches de fond. */
  private async health() {
    const t0 = Date.now();
    await withConsole((tx) => tx.execute(sql`select 1`));
    const dbMs = Date.now() - t0;
    let failedJobs24h: number | null = null;
    let queuedJobs: number | null = null;
    try {
      const [j] = await withConsole((tx) =>
        tx.execute<{ failed: number; queued: number }>(sql`
        select count(*) filter (where state = 'failed' and completed_on >= now() - interval '1 day')::int as failed,
               count(*) filter (where state in ('created', 'retry'))::int as queued
        from pgboss.job`),
      );
      failedJobs24h = j?.failed ?? 0;
      queuedJobs = j?.queued ?? 0;
    } catch {
      // File des tâches indisponible : l'indicateur reste vide plutôt que de bloquer la console.
    }
    return { database: "ok" as const, databaseMs: dbMs, failedJobs24h, queuedJobs };
  }

  /** Liste des organisations avec leurs totaux. */
  async organizations() {
    const orgs = await this.withTotals();
    return orgs.map((o) => ({
      id: o.id,
      slug: o.slug,
      name: o.name,
      kind: o.organization_kind,
      tier: o.tier,
      status: o.status,
      createdAt: o.created_at,
      activatedAt: o.activated_at,
      subscription: o.totals?.subscription ?? null,
      members: o.totals?.members ?? 0,
      activeUsers30: o.totals?.activeUsers30 ?? 0,
      storageBytes: o.totals?.storageBytes ?? 0,
      lastActivity: o.totals?.lastActivity ?? null,
    }));
  }

  private async row(id: string) {
    const p = (await this.partyRows()).find((x) => x.id === id);
    if (!p) throw new ApiError(404, "not_found");
    return p;
  }

  /** Contact du fondateur (membre 000001) : la personne à qui la plateforme s'adresse. */
  private async founder(id: string, draft?: unknown) {
    return withParty(id, async (tx) => {
      const [f] = await tx
        .select({ firstName: members.firstName, lastName: members.lastName, email: users.email })
        .from(members)
        .leftJoin(users, eq(users.id, members.userId))
        .where(eq(members.memberNumber, "000001"));
      if (f) return { name: `${f.firstName} ${f.lastName}`, email: f.email };
      if (!draft) {
        const [p] = await tx.select({ draft: parties.signupDraft }).from(parties);
        draft = p?.draft;
      }
      const d = draft as { firstName?: string; lastName?: string; email?: string } | null;
      return d ? { name: `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim(), email: d.email ?? null } : null;
    });
  }

  /** Fiche d'une organisation : identité, abonnement, totaux, fondateur, dernières actions de la console. */
  async organization(id: string) {
    const p = await this.row(id);
    const totals = p.status === "active" ? await partyTotals(id) : null;
    const history = await withConsole((tx) =>
      tx
        .select({
          id: platformAuditLog.id,
          action: platformAuditLog.action,
          metadata: platformAuditLog.metadata,
          createdAt: platformAuditLog.createdAt,
          staff: platformStaff.name,
        })
        .from(platformAuditLog)
        .leftJoin(platformStaff, eq(platformStaff.id, platformAuditLog.staffId))
        .where(eq(platformAuditLog.targetPartyId, id))
        .orderBy(desc(platformAuditLog.createdAt))
        .limit(30),
    );
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      kind: p.organization_kind,
      tier: p.tier,
      status: p.status,
      createdAt: p.created_at,
      activatedAt: p.activated_at,
      electionsModuleUntil: p.elections_module_until,
      address: this.d.partyOrigin(p.slug),
      founder: await this.founder(id),
      totals,
      history,
    };
  }

  /** Trace d'une action : journal de la console, et journal de l'organisation (elle voit ce qui la touche). */
  private async trace(
    staff: StaffContext,
    partyId: string,
    action: string,
    metadata: Record<string, unknown>,
    ip?: string,
  ) {
    await withConsole((tx) =>
      consoleAudit(tx, { staffId: staff.staffId, action, targetPartyId: partyId, metadata, ...(ip ? { ip } : {}) }),
    );
    await withParty(partyId, (tx) =>
      audit(tx, {
        partyId,
        actorUserId: null,
        actorKind: "staff",
        action: `platform.${action}`,
        targetType: "party",
        targetId: partyId,
        metadata,
        ...(ip ? { ip } : {}),
      }),
    );
    await this.d.entitlements.invalidate(partyId);
  }

  private owner(staff: StaffContext) {
    if (staff.role !== "owner") throw new ApiError(403, "forbidden");
  }

  /** Suspension (lecture seule, SOC-08) ou reprise de l'abonnement. */
  async setSuspended(staff: StaffContext, id: string, suspended: boolean, reason: string | undefined, ip?: string) {
    this.owner(staff);
    const p = await this.row(id);
    if (p.status !== "active") throw new ApiError(409, "party_not_active");
    await withParty(id, async (tx) => {
      const [sub] = await tx
        .select({ id: subscriptions.id, status: subscriptions.status, end: subscriptions.currentPeriodEnd })
        .from(subscriptions)
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
      if (!sub) throw new ApiError(409, "no_subscription");
      await tx
        .update(subscriptions)
        .set(
          suspended
            ? { status: "suspended", suspendedAt: new Date(), updatedAt: new Date() }
            : { status: "active", suspendedAt: null, updatedAt: new Date() },
        )
        .where(eq(subscriptions.id, sub.id));
    });
    await this.trace(staff, id, suspended ? "party.suspend" : "party.reactivate", reason ? { reason } : {}, ip);
  }

  /** Changement de formule (parties.tier et abonnement). */
  async setTier(staff: StaffContext, id: string, tier: Tier, ip?: string) {
    this.owner(staff);
    const p = await this.row(id);
    await withParty(id, async (tx) => {
      await tx.update(parties).set({ tier, updatedAt: new Date() }).where(eq(parties.id, id));
      await tx.update(subscriptions).set({ tier, updatedAt: new Date() }).where(eq(subscriptions.partyId, id));
    });
    await this.trace(staff, id, "party.tier", { from: p.tier, to: tier }, ip);
  }

  /** Prolongation de l'essai gratuit. */
  async extendTrial(staff: StaffContext, id: string, days: number, ip?: string) {
    this.owner(staff);
    await this.row(id);
    let end: Date | null = null;
    await withParty(id, async (tx) => {
      const [sub] = await tx
        .select({ id: subscriptions.id, status: subscriptions.status, end: subscriptions.currentPeriodEnd })
        .from(subscriptions)
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
      if (!sub || sub.status !== "trial") throw new ApiError(409, "not_in_trial");
      end = new Date(Math.max(sub.end?.getTime() ?? Date.now(), Date.now()) + days * DAY);
      await tx
        .update(subscriptions)
        .set({ currentPeriodEnd: end, updatedAt: new Date() })
        .where(eq(subscriptions.id, sub.id));
    });
    await this.trace(staff, id, "party.trial", { days, endsAt: end }, ip);
    return { endsAt: end };
  }

  /** Module Élections pour un cycle (mois), ou arrêt (0). Réservé aux partis politiques. */
  async setElections(staff: StaffContext, id: string, months: number, ip?: string) {
    this.owner(staff);
    const p = await this.row(id);
    if (months > 0 && p.organization_kind !== "party") throw new ApiError(409, "elections_party_only");
    const until = months > 0 ? new Date(Date.now() + months * 30 * DAY) : null;
    await withParty(id, (tx) =>
      tx.update(parties).set({ electionsModuleUntil: until, updatedAt: new Date() }).where(eq(parties.id, id)),
    );
    await this.trace(staff, id, "party.elections", { months, until }, ip);
  }

  /** Invitation du fondateur : adresse de l'espace et marche à suivre pour se connecter. */
  async invite(staff: StaffContext, id: string, ip?: string) {
    const p = await this.row(id);
    if (p.status !== "active") throw new ApiError(409, "party_not_active");
    const f = await this.founder(id);
    if (!f?.email) throw new ApiError(409, "founder_without_email");
    const url = `${this.d.partyOrigin(p.slug)}/admin/connexion`;
    await this.d.email.send(
      composeMail({
        to: f.email,
        subject: `L'espace ${p.name} est prêt sur civora`,
        body: {
          preheader: `L'espace de ${p.name} est ouvert. Connectez-vous pour commencer.`,
          heading: `L'espace ${p.name} est ouvert`,
          paragraphs: [
            `Bonjour ${f.name},`,
            `L'espace de ${p.name} est ouvert sur civora. Vous en êtes le membre n° 000001, avec tous les droits.`,
          ],
          action: { label: "Ouvrir mon espace", url },
          after: [
            "Saisissez votre adresse e-mail : vous recevrez un code, puis vous activerez la double authentification.",
          ],
          signature: "L'équipe civora",
        },
        brand: PLATFORM_BRAND,
        locale: "fr",
      }),
    );
    await this.trace(staff, id, "party.invite", { to: "founder" }, ip);
  }

  /** Activation d'un espace en attente (code jamais saisi), puis invitation du fondateur. */
  async activate(staff: StaffContext, id: string, activatePending: (id: string) => Promise<unknown>, ip?: string) {
    this.owner(staff);
    await activatePending(id);
    await this.trace(staff, id, "party.activate", {}, ip);
    await this.invite(staff, id, ip);
  }

  /** Après une création manuelle : trace et invitation. */
  async created(staff: StaffContext, id: string, ip?: string) {
    await this.trace(staff, id, "party.create", {}, ip);
    await this.invite(staff, id, ip);
  }

  // ---------- Équipe ----------

  async staffList(staff: StaffContext) {
    this.owner(staff);
    return withConsole((tx) =>
      tx
        .select({
          id: platformStaff.id,
          email: platformStaff.email,
          name: platformStaff.name,
          role: platformStaff.role,
          mfa: sql<boolean>`${platformStaff.mfaConfirmedAt} is not null`,
          disabledAt: platformStaff.disabledAt,
          createdAt: platformStaff.createdAt,
        })
        .from(platformStaff)
        .orderBy(platformStaff.createdAt),
    );
  }

  async addStaff(staff: StaffContext, body: { email: string; name: string; role: "owner" | "support" }, ip?: string) {
    this.owner(staff);
    const email = normalizeStaffEmail(body.email);
    return withConsole(async (tx) => {
      const [exists] = await tx
        .select({ id: platformStaff.id })
        .from(platformStaff)
        .where(eq(platformStaff.email, email));
      if (exists) throw new ApiError(409, "staff_exists");
      const [s] = await tx
        .insert(platformStaff)
        .values({ email, name: body.name, role: body.role })
        .returning({ id: platformStaff.id });
      await consoleAudit(tx, {
        staffId: staff.staffId,
        action: "staff.add",
        metadata: { email, role: body.role },
        ...(ip ? { ip } : {}),
      });
      return { id: s!.id };
    });
  }

  /** Désactive ou réactive un compte du personnel ; jamais soi-même, jamais le dernier propriétaire actif. */
  async setStaffDisabled(staff: StaffContext, id: string, disabled: boolean, ip?: string) {
    this.owner(staff);
    if (id === staff.staffId) throw new ApiError(409, "cannot_disable_self");
    await withConsole(async (tx: Tx) => {
      const [target] = await tx
        .select({ role: platformStaff.role })
        .from(platformStaff)
        .where(eq(platformStaff.id, id));
      if (!target) throw new ApiError(404, "not_found");
      if (disabled && target.role === "owner") {
        const [owners] = await tx
          .select({ n: count() })
          .from(platformStaff)
          .where(and(eq(platformStaff.role, "owner"), isNull(platformStaff.disabledAt)));
        if ((owners?.n ?? 0) <= 1) throw new ApiError(409, "last_owner");
      }
      await tx
        .update(platformStaff)
        .set({ disabledAt: disabled ? new Date() : null, updatedAt: new Date() })
        .where(eq(platformStaff.id, id));
      await consoleAudit(tx, {
        staffId: staff.staffId,
        action: disabled ? "staff.disable" : "staff.enable",
        metadata: { staffId: id },
        ...(ip ? { ip } : {}),
      });
    });
  }

  /** Journal de la console, du plus récent au plus ancien. */
  async auditLog(before?: Date) {
    return withConsole((tx) =>
      tx
        .select({
          id: platformAuditLog.id,
          action: platformAuditLog.action,
          targetPartyId: platformAuditLog.targetPartyId,
          metadata: platformAuditLog.metadata,
          ip: platformAuditLog.ip,
          createdAt: platformAuditLog.createdAt,
          staff: platformStaff.name,
        })
        .from(platformAuditLog)
        .leftJoin(platformStaff, eq(platformStaff.id, platformAuditLog.staffId))
        .where(before ? sql`${platformAuditLog.createdAt} < ${before.toISOString()}::timestamptz` : undefined)
        .orderBy(desc(platformAuditLog.createdAt))
        .limit(100),
    );
  }
}
