// ENG-01, GAM-01, GAM-09 : ce que voit le membre (ses points, son code et ses filleuls), les réglages du parti
// (parrainage, barème) et les corrections de points d'un responsable, tracées.
import type { FastifyRequest } from "fastify";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { members, parties, pointEntries, referrals, withParty, zones } from "@civora/db";
import { audit } from "../../lib/audit.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize } from "../../plugins/tenant.js";
import {
  backfillReferralCodes,
  ensureReferralCode,
  partyEngagement,
  POINT_ACTIONS,
  type PointAction,
} from "./points.js";

type Req = FastifyRequest;
const actor = (req: Req) => ({
  partyId: req.partyId,
  actorUserId: req.auth?.userId ?? null,
  actorKind: "member" as const,
  ip: req.clientIp,
});

export class EngagementService {
  constructor(private readonly partyOrigin: (slug: string) => string) {}

  /** Points du membre : total et derniers mouvements (GAM-09). */
  async myPoints(req: Req) {
    return withParty(req.partyId, async (tx) => {
      const e = await partyEngagement(tx);
      if (!e.points) return { enabled: false as const, total: 0, entries: [], scale: e.scale };
      return { enabled: true as const, ...(await this.ledger(tx, req.memberId!)), scale: e.scale };
    });
  }

  private async ledger(tx: Parameters<Parameters<typeof withParty>[1]>[0], memberId: string) {
    const [t] = await tx
      .select({ total: sql<number>`coalesce(sum(${pointEntries.points}), 0)::int` })
      .from(pointEntries)
      .where(eq(pointEntries.memberId, memberId));
    const entries = await tx
      .select({
        action: pointEntries.action,
        points: pointEntries.points,
        note: pointEntries.note,
        createdAt: pointEntries.createdAt,
      })
      .from(pointEntries)
      .where(eq(pointEntries.memberId, memberId))
      .orderBy(desc(pointEntries.createdAt))
      .limit(30);
    return { total: t?.total ?? 0, entries };
  }

  /** Parrainage du membre (ENG-01) : son code (créé au besoin), le lien à partager, ses filleuls. */
  async myReferrals(req: Req) {
    return withParty(req.partyId, async (tx) => {
      const e = await partyEngagement(tx);
      if (!e.referral) return { enabled: false as const, code: null, shareUrl: null, referrals: [] };
      const code = await ensureReferralCode(tx, req.memberId!);
      const [p] = await tx.select({ slug: parties.slug }).from(parties);
      const rows = await tx
        .select({
          firstName: members.firstName,
          lastName: members.lastName,
          state: members.applicationState,
          since: referrals.createdAt,
          validatedAt: referrals.validatedAt,
        })
        .from(referrals)
        .innerJoin(members, and(eq(members.partyId, referrals.partyId), eq(members.id, referrals.referredMemberId)))
        .where(and(eq(referrals.sponsorMemberId, req.memberId!), isNull(members.deletedAt)))
        .orderBy(desc(referrals.createdAt));
      return {
        enabled: true as const,
        code,
        shareUrl: code ? `${this.partyOrigin(p!.slug)}/rejoindre?parrain=${encodeURIComponent(code)}` : null,
        // Le filleul est montré par son prénom et l'initiale de son nom : le parrain le connaît déjà.
        referrals: rows.map((r) => ({
          name: `${r.firstName} ${r.lastName.slice(0, 1)}.`,
          state: r.validatedAt
            ? ("validated" as const)
            : r.state === "rejected"
              ? ("rejected" as const)
              : ("pending" as const),
          since: r.since,
        })),
      };
    });
  }

  /** Réglages du parti (settings.party) : parrainage et barème. */
  async settings(req: Req) {
    if (!authorize(req, "settings.party")) throw new ApiError(403, "forbidden");
    return withParty(req.partyId, async (tx) => {
      const e = await partyEngagement(tx);
      const [p] = await tx.select({ mode: parties.admissionMode }).from(parties);
      return {
        referralEnabled: e.referral,
        referralForced: p?.mode === "parrainage",
        points: e.points,
        scale: e.scale,
      };
    });
  }

  async updateSettings(
    req: Req,
    body: { referralEnabled?: boolean | undefined; scale?: { [K in PointAction]?: number | undefined } | undefined },
  ) {
    if (!authorize(req, "settings.party")) throw new ApiError(403, "forbidden");
    return withParty(req.partyId, async (tx) => {
      const before = await partyEngagement(tx);
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (body.referralEnabled !== undefined) set.referralSettings = { enabled: body.referralEnabled };
      if (body.scale) {
        const changes = Object.fromEntries(Object.entries(body.scale).filter(([, v]) => v !== undefined));
        set.pointsScale = { ...before.scale, ...changes };
      }
      await tx.update(parties).set(set).where(eq(parties.id, req.partyId));
      // Activation : chaque membre validé reçoit son code.
      const codes = body.referralEnabled && !before.referral ? await backfillReferralCodes(tx) : 0;
      await audit(tx, {
        ...actor(req),
        action: "settings.engagement",
        targetType: "party",
        targetId: req.partyId,
        metadata: { referralEnabled: body.referralEnabled ?? null, scale: body.scale ?? null, codes },
      });
      return { codes };
    });
  }

  /** Points d'un membre vus par un responsable de sa zone (members.read). */
  async memberPoints(req: Req, memberId: string) {
    return withParty(req.partyId, async (tx) => {
      const path = await this.zonePath(tx, memberId);
      if (!authorize(req, "members.read", path)) throw new ApiError(403, "forbidden");
      return this.ledger(tx, memberId);
    });
  }

  /** Correction manuelle (GAM-09) : gamification.manage dans la zone du membre, motif obligatoire, auditée. */
  async adjust(req: Req, memberId: string, body: { points: number; note: string }) {
    return withParty(req.partyId, async (tx) => {
      const path = await this.zonePath(tx, memberId);
      if (!authorize(req, "gamification.manage", path)) throw new ApiError(403, "forbidden");
      await tx.insert(pointEntries).values({
        partyId: req.partyId,
        memberId,
        action: "manual",
        points: body.points,
        note: body.note,
        createdByMemberId: req.memberId,
      });
      await audit(tx, {
        ...actor(req),
        action: "points.adjust",
        targetType: "member",
        targetId: memberId,
        metadata: { points: body.points },
      });
    });
  }

  private async zonePath(tx: Parameters<Parameters<typeof withParty>[1]>[0], memberId: string) {
    const [m] = await tx
      .select({ path: zones.path })
      .from(members)
      .innerJoin(zones, eq(zones.id, members.zoneId))
      .where(and(eq(members.id, memberId), isNull(members.deletedAt)));
    if (!m) throw new ApiError(404, "not_found");
    return m.path;
  }
}

export { POINT_ACTIONS };
