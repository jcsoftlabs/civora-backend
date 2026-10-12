// VOT-01 à VOT-07, VOT-09, VOT-10 : scrutins internes. Création (poste ou question), corps électoral par règles,
// liste figée consultable et contestable, candidatures, vote secret, dépouillement après clôture (quorum, seuil,
// deux tours, liste), procès-verbal, journal vérifiable des empreintes, installation du gagnant dans le poste.
//
// Secret du vote (VOT-05, BI-09) : le bulletin (ballots) ne porte ni votant ni heure ; le reçu (ballot_receipts)
// sait qui a voté, à l'heure près, jamais pour quoi. Le code remis au votant n'est gardé nulle part : seule son
// empreinte figure sur le bulletin, pour que le votant retrouve son bulletin dans le journal public.
import { createHash, randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { and, asc, count, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { z } from "zod";
import {
  ballotReceipts,
  ballots,
  candidates,
  electionResults,
  elections,
  electoralRolls,
  members,
  organs,
  parties,
  postHolders,
  posts,
  rollContests,
  withParty,
  zones,
  type Tx,
} from "@civora/db";
import { can, checkQuota } from "@civora/shared";
import { audit } from "../../lib/audit.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize } from "../../plugins/tenant.js";
import { expressionCondition, type FilterExpression } from "../members/filters.js";
import type {
  ballotBody,
  candidacyBody,
  candidateCreate,
  candidateDecision,
  contestBody,
  contestDecision,
  ElectionInput,
} from "./schemas.js";
import { awardPoints } from "../engagement/points.js";
import { tally, type Method, type TallyResult } from "./tally.js";

type Req = FastifyRequest;
type Election = typeof elections.$inferSelect & { zonePath: string | null; zoneName: string | null };
export type Phase = "draft" | "preparation" | "open" | "counting" | "closed" | "published";

const YES = { fr: "Oui", ht: "Wi" };
const NO = { fr: "Non", ht: "Non" };

/** Étape du scrutin : brouillon, liste figée avant l'ouverture, vote ouvert, à dépouiller, dépouillé, certifié. */
export function phaseOf(e: Pick<Election, "state" | "opensAt" | "closesAt">, now = new Date()): Phase {
  if (e.state === "draft") return "draft";
  if (e.state === "published") return "published";
  if (e.state === "closed") return "closed";
  if (now < e.opensAt) return "preparation";
  if (now < e.closesAt) return "open";
  return "counting";
}

const actor = (req: Req) => ({
  partyId: req.partyId,
  actorUserId: req.auth?.userId ?? null,
  actorKind: "member" as const,
  ip: req.clientIp,
});

/** Code remis au votant (lettres et chiffres sans ambiguïté), et son empreinte publiée dans le journal. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function receiptCode() {
  const bytes = randomBytes(12);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}
export const ballotFingerprint = (electionId: string, round: number, code: string) =>
  createHash("sha256").update(`civora-ballot:${electionId}:${round}:${code.toUpperCase()}`).digest("hex");

export class VotesService {
  // ---------- Chargement et droits ----------

  private async load(tx: Tx, id: string): Promise<Election> {
    const [e] = await tx
      .select({ e: elections, zonePath: zones.path, zoneName: zones.name })
      .from(elections)
      .leftJoin(zones, eq(zones.id, elections.zoneId))
      .where(eq(elections.id, id));
    if (!e) throw new ApiError(404, "not_found");
    return { ...e.e, zonePath: e.zonePath, zoneName: e.zoneName };
  }

  private manage(req: Req, e: { zonePath: string | null }) {
    if (!authorize(req, "votes.manage", e.zonePath ?? undefined)) throw new ApiError(403, "forbidden");
  }

  private async entitlements(req: Req) {
    const e = req.partyEntitlements ?? (await req.server.entitlements.get(req.partyId));
    if (!e) throw new ApiError(401, "unauthenticated");
    return e;
  }

  /** Membres qui répondent aux règles, dans la zone du scrutin (corps électoral, éligibilité). */
  private async matching(tx: Tx, zonePath: string | null, rules: FilterExpression | null, onlyId?: string) {
    const cond = await expressionCondition(tx, rules ?? undefined);
    return tx
      .select({ id: members.id })
      .from(members)
      .innerJoin(zones, eq(zones.id, members.zoneId))
      .where(
        and(
          eq(members.applicationState, "approved"),
          isNull(members.deletedAt),
          zonePath ? sql`${zones.path} <@ ${zonePath}::ltree` : undefined,
          onlyId ? eq(members.id, onlyId) : undefined,
          cond,
        ),
      );
  }

  // ---------- Back-office : création et préparation ----------

  async create(req: Req, body: ElectionInput) {
    const ent = await this.entitlements(req);
    const advanced =
      body.method === "two_rounds" ||
      body.method === "list" ||
      !!body.candidaciesCloseAt ||
      !!body.contestationsCloseAt ||
      // VOT-10 : l'installation de l'élu dans un poste est réservée aux formules Mouvement et National.
      !!body.postId;
    if (advanced && !can(ent, "votes.advanced"))
      throw Object.assign(new ApiError(402, "feature_not_in_plan"), { requiredTier: "mouvement" });
    return withParty(req.partyId, async (tx) => {
      let zone: { id: string; path: string } | null = null;
      if (body.zoneCode) {
        const [z] = await tx
          .select({ id: zones.id, path: zones.path })
          .from(zones)
          .where(eq(zones.code, body.zoneCode));
        if (!z) throw new ApiError(400, "zone_not_found");
        zone = z;
      }
      this.manage(req, { zonePath: zone?.path ?? null });
      const [active] = await tx.select({ n: count() }).from(elections).where(ne(elections.state, "published"));
      if (!checkQuota(ent, "activeInternalElections", active?.n ?? 0).allowed)
        throw Object.assign(new ApiError(402, "quota_internal_elections"), { requiredTier: "mouvement" });
      if (body.postId) {
        if (body.kind !== "post") throw new ApiError(400, "post_requires_post_kind");
        const [p] = await tx.select({ id: posts.id }).from(posts).where(eq(posts.id, body.postId));
        if (!p) throw new ApiError(400, "post_not_found");
      }
      const [e] = await tx
        .insert(elections)
        .values({
          partyId: req.partyId,
          kind: body.kind,
          title: body.title,
          description: body.description ?? null,
          zoneId: zone?.id ?? null,
          postId: body.postId ?? null,
          method: body.method,
          seats: body.seats,
          rules: body.rules,
          eligibility: body.eligibility ?? null,
          opensAt: body.opensAt,
          closesAt: body.closesAt,
          candidaciesCloseAt: body.candidaciesCloseAt ?? null,
          contestationsCloseAt: body.contestationsCloseAt ?? null,
          quorumPercent: body.quorumPercent ?? null,
          validityThresholdPercent: body.validityThresholdPercent ?? null,
          allowBlank: body.allowBlank,
        })
        .returning({ id: elections.id });
      if (body.kind === "question") {
        await tx.insert(candidates).values([
          { partyId: req.partyId, electionId: e!.id, label: YES, position: 0 },
          { partyId: req.partyId, electionId: e!.id, label: NO, position: 1 },
        ]);
      }
      await audit(tx, { ...actor(req), action: "votes.create", targetType: "election", targetId: e!.id });
      return { id: e!.id };
    });
  }

  /** Candidat saisi par le responsable : un membre (éligibilité vérifiée) ou une liste, une option. */
  async addCandidate(req: Req, id: string, body: z.infer<typeof candidateCreate>) {
    return withParty(req.partyId, async (tx) => {
      const e = await this.load(tx, id);
      this.manage(req, e);
      if (e.kind === "question") throw new ApiError(409, "question_options_fixed");
      if (!["draft", "preparation"].includes(phaseOf(e))) throw new ApiError(409, "election_started");
      if (body.memberId) await this.assertEligible(tx, e, body.memberId);
      const [last] = await tx
        .select({ p: sql<number>`coalesce(max(${candidates.position}), -1)::int` })
        .from(candidates)
        .where(eq(candidates.electionId, id));
      const [c] = await tx
        .insert(candidates)
        .values({
          partyId: req.partyId,
          electionId: id,
          memberId: body.memberId ?? null,
          label: body.label,
          statement: body.statement ?? null,
          eligibilityChecked: body.memberId ? new Date() : null,
          position: (last?.p ?? -1) + 1,
        })
        .returning({ id: candidates.id });
      return { id: c!.id };
    });
  }

  private async assertEligible(tx: Tx, e: Election, memberId: string) {
    const ok = await this.matching(tx, e.zonePath, (e.eligibility as FilterExpression | null) ?? null, memberId);
    if (!ok.length) throw new ApiError(409, "candidate_not_eligible");
    const [dup] = await tx
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(eq(candidates.electionId, e.id), eq(candidates.memberId, memberId), ne(candidates.status, "withdrawn")),
      );
    if (dup) throw new ApiError(409, "already_candidate");
  }

  /** Décision sur une candidature déposée en ligne. */
  async decideCandidate(req: Req, id: string, candidateId: string, body: z.infer<typeof candidateDecision>) {
    await withParty(req.partyId, async (tx) => {
      const e = await this.load(tx, id);
      this.manage(req, e);
      if (!["draft", "preparation"].includes(phaseOf(e))) throw new ApiError(409, "election_started");
      const upd = await tx
        .update(candidates)
        .set({ status: body.status, decisionReason: body.reason ?? null, updatedAt: new Date() })
        .where(and(eq(candidates.id, candidateId), eq(candidates.electionId, id)))
        .returning({ id: candidates.id });
      if (!upd.length) throw new ApiError(404, "not_found");
      await audit(tx, {
        ...actor(req),
        action: `votes.candidate.${body.status}`,
        targetType: "election",
        targetId: id,
        metadata: { candidateId },
      });
    });
  }

  async removeCandidate(req: Req, id: string, candidateId: string) {
    await withParty(req.partyId, async (tx) => {
      const e = await this.load(tx, id);
      this.manage(req, e);
      if (e.kind === "question") throw new ApiError(409, "question_options_fixed");
      if (!["draft", "preparation"].includes(phaseOf(e))) throw new ApiError(409, "election_started");
      const del = await tx
        .delete(candidates)
        .where(and(eq(candidates.id, candidateId), eq(candidates.electionId, id)))
        .returning({ id: candidates.id });
      if (!del.length) throw new ApiError(404, "not_found");
    });
  }

  /**
   * VOT-03 : la liste électorale est calculée une fois, à partir des règles, puis figée : plus personne n'y entre
   * ni n'en sort, sauf contestation acceptée avant l'ouverture.
   */
  async freezeRoll(req: Req, id: string) {
    return withParty(req.partyId, async (tx) => {
      const e = await this.load(tx, id);
      this.manage(req, e);
      if (e.state !== "draft") throw new ApiError(409, "roll_already_frozen");
      if (e.opensAt <= new Date()) throw new ApiError(409, "opening_passed");
      const voters = await this.matching(tx, e.zonePath, e.rules as FilterExpression);
      if (!voters.length) throw new ApiError(409, "empty_roll");
      for (let i = 0; i < voters.length; i += 500)
        await tx
          .insert(electoralRolls)
          .values(voters.slice(i, i + 500).map((v) => ({ partyId: req.partyId, electionId: id, memberId: v.id })));
      await tx
        .update(elections)
        .set({ state: "roll_frozen", rollFrozenAt: new Date(), updatedAt: new Date() })
        .where(eq(elections.id, id));
      await audit(tx, {
        ...actor(req),
        action: "votes.roll.freeze",
        targetType: "election",
        targetId: id,
        metadata: { registered: voters.length },
      });
      return { registered: voters.length };
    });
  }

  async decideContest(req: Req, id: string, contestId: string, body: z.infer<typeof contestDecision>) {
    await withParty(req.partyId, async (tx) => {
      const e = await this.load(tx, id);
      this.manage(req, e);
      if (phaseOf(e) !== "preparation") throw new ApiError(409, "election_started");
      const [c] = await tx
        .select()
        .from(rollContests)
        .where(and(eq(rollContests.id, contestId), eq(rollContests.electionId, id)));
      if (!c) throw new ApiError(404, "not_found");
      if (c.status !== "pending") throw new ApiError(409, "contest_decided");
      if (body.status === "accepted") {
        if (c.kind === "missing") {
          await tx
            .insert(electoralRolls)
            .values({ partyId: req.partyId, electionId: id, memberId: c.concernedMemberId })
            .onConflictDoNothing();
        } else {
          await tx
            .delete(electoralRolls)
            .where(and(eq(electoralRolls.electionId, id), eq(electoralRolls.memberId, c.concernedMemberId)));
        }
      }
      await tx
        .update(rollContests)
        .set({
          status: body.status,
          decidedByMemberId: req.memberId,
          decidedAt: new Date(),
          decisionNote: body.note ?? null,
          updatedAt: new Date(),
        })
        .where(eq(rollContests.id, contestId));
      await audit(tx, {
        ...actor(req),
        action: `votes.contest.${body.status}`,
        targetType: "election",
        targetId: id,
        metadata: { contestId, kind: c.kind },
      });
    });
  }

  // ---------- Lecture ----------

  /** Scrutins que la personne gère (votes.manage sur leur zone). */
  async manageList(req: Req) {
    return withParty(req.partyId, async (tx) => {
      const rows = await tx
        .select({
          id: elections.id,
          title: elections.title,
          kind: elections.kind,
          method: elections.method,
          state: elections.state,
          round: elections.round,
          opensAt: elections.opensAt,
          closesAt: elections.closesAt,
          zonePath: zones.path,
          zoneName: zones.name,
          registered: sql<number>`(select count(*)::int from electoral_rolls r where r.election_id = "elections"."id")`,
          voted: sql<number>`(select count(*)::int from ballot_receipts b where b.election_id = "elections"."id"
            and b.round = "elections"."round")`,
        })
        .from(elections)
        .leftJoin(zones, eq(zones.id, elections.zoneId))
        .orderBy(desc(elections.opensAt));
      return rows
        .filter((r) => authorize(req, "votes.manage", r.zonePath ?? undefined))
        .map(({ zonePath: _z, ...r }) => ({ ...r, phase: phaseOf(r) }));
    });
  }

  private async candidatesOf(tx: Tx, id: string) {
    return tx
      .select({
        id: candidates.id,
        memberId: candidates.memberId,
        label: candidates.label,
        statement: candidates.statement,
        status: candidates.status,
        decisionReason: candidates.decisionReason,
        runoff: candidates.runoff,
        position: candidates.position,
        memberNumber: members.memberNumber,
      })
      .from(candidates)
      .leftJoin(members, and(eq(members.partyId, candidates.partyId), eq(members.id, candidates.memberId)))
      .where(eq(candidates.electionId, id))
      .orderBy(asc(candidates.position));
  }

  private async resultsOf(tx: Tx, id: string) {
    return tx
      .select({
        round: electionResults.round,
        tally: electionResults.tally,
        turnout: electionResults.turnout,
        registered: electionResults.registered,
        valid: electionResults.valid,
        outcome: electionResults.outcome,
        createdAt: electionResults.createdAt,
      })
      .from(electionResults)
      .where(eq(electionResults.electionId, id))
      .orderBy(asc(electionResults.round));
  }

  /** Postes à pourvoir proposés à la création (VOT-10) : ceux de la portée de la personne. */
  async posts(req: Req) {
    return withParty(req.partyId, async (tx) => {
      const rows = await tx
        .select({ id: posts.id, title: posts.title, organ: organs.name, zonePath: zones.path, zoneName: zones.name })
        .from(posts)
        .innerJoin(organs, and(eq(organs.partyId, posts.partyId), eq(organs.id, posts.organId)))
        .leftJoin(zones, eq(zones.id, posts.scopeZoneId))
        .orderBy(asc(organs.name), asc(posts.title));
      return rows
        .filter((r) => authorize(req, "votes.manage", r.zonePath ?? undefined))
        .map(({ zonePath: _z, ...r }) => r);
    });
  }

  /** Fiche d'un scrutin pour le responsable : règles, candidats, participation, contestations, résultats. */
  async detail(req: Req, id: string) {
    return withParty(req.partyId, async (tx) => {
      const e = await this.load(tx, id);
      this.manage(req, e);
      const [reg] = await tx.select({ n: count() }).from(electoralRolls).where(eq(electoralRolls.electionId, id));
      const [voted] = await tx
        .select({ n: count() })
        .from(ballotReceipts)
        .where(and(eq(ballotReceipts.electionId, id), eq(ballotReceipts.round, e.round)));
      const contests = await tx
        .select({
          id: rollContests.id,
          kind: rollContests.kind,
          reason: rollContests.reason,
          status: rollContests.status,
          decisionNote: rollContests.decisionNote,
          createdAt: rollContests.createdAt,
          concernedName: sql<string>`(select m.first_name || ' ' || m.last_name from members m
            where m.id = "roll_contests"."concerned_member_id")`,
          authorName: sql<string>`(select m.first_name || ' ' || m.last_name from members m
            where m.id = "roll_contests"."member_id")`,
        })
        .from(rollContests)
        .where(eq(rollContests.electionId, id))
        .orderBy(desc(rollContests.createdAt));
      const [post] = e.postId
        ? await tx
            .select({ title: posts.title, organ: organs.name })
            .from(posts)
            .innerJoin(organs, and(eq(organs.partyId, posts.partyId), eq(organs.id, posts.organId)))
            .where(eq(posts.id, e.postId))
        : [];
      const { zonePath: _z, inPersonQr: _q, ...rest } = e;
      return {
        ...rest,
        phase: phaseOf(e),
        post: post ?? null,
        registered: reg?.n ?? 0,
        voted: voted?.n ?? 0,
        candidates: await this.candidatesOf(tx, id),
        contests,
        results: await this.resultsOf(tx, id),
      };
    });
  }

  /** Liste électorale (VOT-03) : pour le responsable, et pour chaque inscrit une fois la liste figée. */
  async roll(req: Req, id: string) {
    return withParty(req.partyId, async (tx) => {
      const e = await this.load(tx, id);
      if (!authorize(req, "votes.manage", e.zonePath ?? undefined)) {
        if (e.state === "draft") throw new ApiError(403, "forbidden");
        const [me] = await tx
          .select({ id: electoralRolls.id })
          .from(electoralRolls)
          .where(and(eq(electoralRolls.electionId, id), eq(electoralRolls.memberId, req.memberId!)));
        if (!me) throw new ApiError(403, "forbidden");
      }
      return tx
        .select({
          memberNumber: members.memberNumber,
          firstName: members.firstName,
          lastName: members.lastName,
          zone: zones.name,
        })
        .from(electoralRolls)
        .innerJoin(members, and(eq(members.partyId, electoralRolls.partyId), eq(members.id, electoralRolls.memberId)))
        .innerJoin(zones, eq(zones.id, members.zoneId))
        .where(eq(electoralRolls.electionId, id))
        .orderBy(asc(members.lastName), asc(members.firstName));
    });
  }

  // ---------- Dépouillement, second tour, certification ----------

  /** VOT-06, VOT-07 : dépouillement du tour en cours, après la clôture seulement. */
  async count(req: Req, id: string) {
    return withParty(req.partyId, async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"election:" + id}, 0))`);
      const e = await this.load(tx, id);
      this.manage(req, e);
      if (phaseOf(e) !== "counting") throw new ApiError(409, "not_closed_yet");
      const cands = (await this.candidatesOf(tx, id)).filter(
        (c) => c.status === "accepted" && (e.round === 1 || c.runoff),
      );
      const box = await tx
        .select({ choice: ballots.choice })
        .from(ballots)
        .where(and(eq(ballots.electionId, id), eq(ballots.round, e.round)));
      const [reg] = await tx.select({ n: count() }).from(electoralRolls).where(eq(electoralRolls.electionId, id));
      const r = tally({
        method: e.method as Method,
        round: e.round,
        seats: e.seats,
        registered: reg?.n ?? 0,
        quorumPercent: e.quorumPercent,
        validityThresholdPercent: e.validityThresholdPercent,
        candidates: cands.map((c) => ({
          id: c.id,
          position: c.position,
          ...(e.kind === "question" ? { yes: c.position === 0 } : {}),
        })),
        ballots: box.map((b) => b.choice as { blank?: boolean; candidateIds?: string[] }),
      });
      await tx.insert(electionResults).values({
        partyId: req.partyId,
        electionId: id,
        round: e.round,
        tally: {
          counts: r.counts,
          ballots: r.ballots,
          blank: r.blank,
          validVotes: r.validVotes,
          turnoutPercent: r.turnoutPercent,
        },
        turnout: r.ballots,
        registered: reg?.n ?? 0,
        valid: r.quorumMet,
        outcome: { winners: r.winners, runoff: r.runoff, reason: r.reason },
      });
      await tx.update(elections).set({ state: "closed", updatedAt: new Date() }).where(eq(elections.id, id));
      // Points de vote (GAM-01) donnés à tous les votants au dépouillement, jamais au moment du vote : une heure
      // exacte dans le journal des points permettrait de rapprocher l'ordre des votants de celui des bulletins.
      const voters = await tx
        .select({ memberId: ballotReceipts.memberId })
        .from(ballotReceipts)
        .where(and(eq(ballotReceipts.electionId, id), eq(ballotReceipts.round, e.round)));
      for (const v of voters) await awardPoints(tx, req.partyId, v.memberId, "vote", id);
      await audit(tx, {
        ...actor(req),
        action: "votes.count",
        targetType: "election",
        targetId: id,
        metadata: { round: e.round, ballots: r.ballots, reason: r.reason },
      });
      return r;
    });
  }

  /** Deux tours : ouvre le second tour entre les qualifiés, avec la même liste électorale. */
  async openRunoff(req: Req, id: string, dates: { opensAt: Date; closesAt: Date }) {
    await withParty(req.partyId, async (tx) => {
      const e = await this.load(tx, id);
      this.manage(req, e);
      const results = await this.resultsOf(tx, id);
      const last = results.at(-1);
      const outcome = last?.outcome as TallyResult | null;
      if (e.state !== "closed" || e.method !== "two_rounds" || e.round !== 1 || outcome?.reason !== "runoff")
        throw new ApiError(409, "runoff_not_needed");
      if (dates.opensAt <= new Date()) throw new ApiError(400, "opening_passed");
      await tx
        .update(candidates)
        .set({ runoff: true, updatedAt: new Date() })
        .where(and(eq(candidates.electionId, id), inArray(candidates.id, outcome.runoff ?? [])));
      await tx
        .update(elections)
        .set({
          round: 2,
          state: "roll_frozen",
          opensAt: dates.opensAt,
          closesAt: dates.closesAt,
          updatedAt: new Date(),
        })
        .where(eq(elections.id, id));
      await audit(tx, { ...actor(req), action: "votes.runoff", targetType: "election", targetId: id });
    });
  }

  /**
   * VOT-09, VOT-10 : certification des résultats (votes.certify, audité). Les résultats deviennent visibles des
   * membres ; le ou les élus sont installés dans le poste, le mandat précédent prend fin.
   */
  async certify(req: Req, id: string) {
    return withParty(req.partyId, async (tx) => {
      const e = await this.load(tx, id);
      if (!authorize(req, "votes.certify", e.zonePath ?? undefined)) throw new ApiError(403, "forbidden");
      if (e.state !== "closed") throw new ApiError(409, "not_counted");
      const last = (await this.resultsOf(tx, id)).at(-1);
      const outcome = last?.outcome as { winners: string[]; reason: string } | null;
      if (outcome?.reason === "runoff") throw new ApiError(409, "runoff_pending");
      const now = new Date();
      let installed: string[] = [];
      if (e.postId && e.kind === "post" && outcome?.winners.length) {
        const winners = await tx
          .select({ memberId: candidates.memberId })
          .from(candidates)
          .where(and(eq(candidates.electionId, id), inArray(candidates.id, outcome.winners)));
        installed = winners.flatMap((w) => (w.memberId ? [w.memberId] : []));
        if (installed.length) {
          await tx
            .update(postHolders)
            .set({ endsAt: now, updatedAt: now })
            .where(and(eq(postHolders.postId, e.postId), or(isNull(postHolders.endsAt), gt(postHolders.endsAt, now))));
          await tx.insert(postHolders).values(
            installed.map((m) => ({
              partyId: req.partyId,
              postId: e.postId!,
              memberId: m,
              startsAt: now,
              sourceElectionId: id,
            })),
          );
          await audit(tx, {
            ...actor(req),
            action: "role.change",
            targetType: "post",
            targetId: e.postId,
            metadata: { assigned: installed, election: id },
          });
        }
      }
      await tx
        .update(elections)
        .set({ state: "published", certifiedAt: now, certifiedByMemberId: req.memberId, updatedAt: now })
        .where(eq(elections.id, id));
      await audit(tx, {
        ...actor(req),
        action: "votes.certify",
        targetType: "election",
        targetId: id,
        metadata: { reason: outcome?.reason, installed: installed.length },
      });
      return { installed: installed.length };
    });
  }

  /** Journal vérifiable (VOT-09) : empreintes des bulletins du tour, triées, et empreinte de l'ensemble. */
  async journal(req: Req, id: string, round?: number) {
    return withParty(req.partyId, async (tx) => {
      const e = await this.load(tx, id);
      const manager = authorize(req, "votes.manage", e.zonePath ?? undefined);
      if (!manager) {
        const [me] = await tx
          .select({ id: electoralRolls.id })
          .from(electoralRolls)
          .where(and(eq(electoralRolls.electionId, id), eq(electoralRolls.memberId, req.memberId!)));
        if (!me) throw new ApiError(403, "forbidden");
      }
      const r = round ?? e.round;
      const done = (await this.resultsOf(tx, id)).some((x) => x.round === r);
      if (!done) throw new ApiError(409, "not_counted");
      const rows = await tx
        .select({ hash: ballots.publicHash })
        .from(ballots)
        .where(and(eq(ballots.electionId, id), eq(ballots.round, r)))
        .orderBy(asc(ballots.publicHash));
      const hashes = rows.map((x) => x.hash);
      return {
        round: r,
        hashes,
        fingerprint: createHash("sha256").update(hashes.join("\n")).digest("hex"),
      };
    });
  }

  /** Données du procès-verbal (VOT-09). */
  async minutes(req: Req, id: string) {
    const d = await this.detail(req, id);
    if (!d.results.length) throw new ApiError(409, "not_counted");
    const journal = await this.journal(req, id, d.results.at(-1)!.round);
    const [p] = await withParty(req.partyId, (tx) => tx.select({ name: parties.name }).from(parties));
    return {
      ...d,
      title: d.title as { fr: string; ht?: string },
      method: d.method as Method,
      partyName: p?.name ?? "",
      fingerprint: journal.fingerprint,
    };
  }

  // ---------- Membre ----------

  /** Scrutins où le membre est inscrit (ou peut se porter candidat), avec son état. */
  async myElections(req: Req) {
    return withParty(req.partyId, async (tx) => {
      const rows = await tx
        .select({
          id: elections.id,
          title: elections.title,
          kind: elections.kind,
          method: elections.method,
          state: elections.state,
          round: elections.round,
          opensAt: elections.opensAt,
          closesAt: elections.closesAt,
          candidaciesCloseAt: elections.candidaciesCloseAt,
          registered: sql<boolean>`exists (select 1 from electoral_rolls r
            where r.election_id = "elections"."id" and r.member_id = ${req.memberId})`,
          voted: sql<boolean>`exists (select 1 from ballot_receipts b where b.election_id = "elections"."id"
            and b.round = "elections"."round" and b.member_id = ${req.memberId})`,
        })
        .from(elections)
        .where(ne(elections.state, "draft"))
        .orderBy(desc(elections.opensAt));
      // Inscrit, ou scrutin dont les candidatures sont ouvertes (l'éligibilité est vérifiée au dépôt).
      const now = new Date();
      return rows
        .filter(
          (r) =>
            r.registered || (phaseOf(r, now) === "preparation" && r.candidaciesCloseAt && r.candidaciesCloseAt > now),
        )
        .map((r) => ({ ...r, phase: phaseOf(r) }));
    });
  }

  private async onRoll(tx: Tx, id: string, memberId: string) {
    const [r] = await tx
      .select({ id: electoralRolls.id })
      .from(electoralRolls)
      .where(and(eq(electoralRolls.electionId, id), eq(electoralRolls.memberId, memberId)));
    return !!r;
  }

  /** Scrutin vu par un inscrit : candidats en lice, a-t-il voté, résultats une fois certifiés. */
  async myElection(req: Req, id: string) {
    return withParty(req.partyId, async (tx) => {
      const e = await this.load(tx, id);
      const registered = e.state !== "draft" && (await this.onRoll(tx, id, req.memberId!));
      const candidaciesOpen =
        phaseOf(e) === "preparation" && !!e.candidaciesCloseAt && e.candidaciesCloseAt > new Date();
      if (!registered && !candidaciesOpen) throw new ApiError(404, "not_found");
      const [v] = await tx
        .select({ n: count() })
        .from(ballotReceipts)
        .where(
          and(
            eq(ballotReceipts.electionId, id),
            eq(ballotReceipts.round, e.round),
            eq(ballotReceipts.memberId, req.memberId!),
          ),
        );
      const cands = (await this.candidatesOf(tx, id)).filter(
        (c) => c.status === "accepted" && (e.round === 1 || c.runoff),
      );
      return {
        id: e.id,
        title: e.title,
        description: e.description,
        kind: e.kind,
        method: e.method,
        seats: e.seats,
        round: e.round,
        allowBlank: e.allowBlank,
        opensAt: e.opensAt,
        closesAt: e.closesAt,
        candidaciesCloseAt: e.candidaciesCloseAt,
        contestationsCloseAt: e.contestationsCloseAt,
        phase: phaseOf(e),
        registered,
        voted: (v?.n ?? 0) > 0,
        candidates: cands.map(({ memberNumber: _n, decisionReason: _d, ...c }) => c),
        // Résultats seulement après certification (VOT-09).
        results: e.state === "published" ? await this.resultsOf(tx, id) : [],
      };
    });
  }

  /**
   * VOT-05 : un vote par inscrit et par tour, secret. Le reçu et le bulletin sont écrits dans la même transaction
   * mais sans lien : le reçu ignore le choix, le bulletin ignore le votant. Le code rendu n'est gardé nulle part.
   */
  async vote(req: Req, id: string, body: z.infer<typeof ballotBody>) {
    return withParty(req.partyId, async (tx) => {
      // Verrou partagé : le dépouillement (verrou exclusif) attend les votes en cours, aucun bulletin ne se perd.
      await tx.execute(sql`select pg_advisory_xact_lock_shared(hashtextextended(${"election:" + id}, 0))`);
      const e = await this.load(tx, id);
      if (phaseOf(e) !== "open") throw new ApiError(409, "voting_closed");
      if (!(await this.onRoll(tx, id, req.memberId!))) throw new ApiError(403, "not_on_roll");
      const valid = (await this.candidatesOf(tx, id))
        .filter((c) => c.status === "accepted" && (e.round === 1 || c.runoff))
        .map((c) => c.id);
      const picked = [...new Set(body.candidateIds)];
      if (body.blank) {
        if (!e.allowBlank) throw new ApiError(400, "blank_not_allowed");
        if (picked.length) throw new ApiError(400, "invalid_ballot");
      } else {
        const max = e.method === "list" ? e.seats : 1;
        if (picked.length < 1 || picked.length > max || picked.some((c) => !valid.includes(c)))
          throw new ApiError(400, "invalid_ballot");
      }
      try {
        await tx.insert(ballotReceipts).values({
          partyId: req.partyId,
          electionId: id,
          memberId: req.memberId!,
          round: e.round,
          // À l'heure près : l'heure exacte permettrait de rapprocher reçu et bulletin.
          castAt: sql`date_trunc('hour', now())`,
        });
      } catch (err) {
        if ((err as { cause?: { code?: string } }).cause?.code === "23505") throw new ApiError(409, "already_voted");
        throw err;
      }
      const code = receiptCode();
      await tx.insert(ballots).values({
        partyId: req.partyId,
        electionId: id,
        round: e.round,
        choice: body.blank ? { blank: true } : { candidateIds: picked.sort() },
        publicHash: ballotFingerprint(id, e.round, code),
      });
      return { receiptCode: code };
    });
  }

  /** VOT-04 : candidature en ligne, pendant la période prévue, si le membre remplit les conditions. */
  async apply(req: Req, id: string, body: z.infer<typeof candidacyBody>) {
    return withParty(req.partyId, async (tx) => {
      const e = await this.load(tx, id);
      // Les candidatures s'ouvrent avec la publication de la liste figée.
      if (e.kind !== "post" || !e.candidaciesCloseAt || e.state !== "roll_frozen" || e.round !== 1)
        throw new ApiError(409, "candidacies_not_open");
      if (new Date() >= e.candidaciesCloseAt || phaseOf(e) === "open") throw new ApiError(409, "candidacies_closed");
      await this.assertEligible(tx, e, req.memberId!);
      const [m] = await tx
        .select({ first: members.firstName, last: members.lastName })
        .from(members)
        .where(eq(members.id, req.memberId!));
      const [last] = await tx
        .select({ p: sql<number>`coalesce(max(${candidates.position}), -1)::int` })
        .from(candidates)
        .where(eq(candidates.electionId, id));
      const [c] = await tx
        .insert(candidates)
        .values({
          partyId: req.partyId,
          electionId: id,
          memberId: req.memberId!,
          label: { fr: `${m!.first} ${m!.last}` },
          statement: body.statement ?? null,
          eligibilityChecked: new Date(),
          status: "pending",
          position: (last?.p ?? -1) + 1,
        })
        .returning({ id: candidates.id });
      await audit(tx, { ...actor(req), action: "votes.candidacy", targetType: "election", targetId: id });
      return { id: c!.id, status: "pending" };
    });
  }

  /** VOT-03 : contestation de la liste figée, pendant la période prévue. */
  async contest(req: Req, id: string, body: z.infer<typeof contestBody>) {
    return withParty(req.partyId, async (tx) => {
      const e = await this.load(tx, id);
      if (e.state !== "roll_frozen" || !e.contestationsCloseAt) throw new ApiError(409, "contestations_not_open");
      if (new Date() >= e.contestationsCloseAt || phaseOf(e) !== "preparation")
        throw new ApiError(409, "contestations_closed");
      const concerned = body.concernedMemberId ?? req.memberId!;
      // Contester l'inscription d'un autre membre est réservé aux inscrits ; on signale toujours sa propre omission.
      if (concerned !== req.memberId && !(await this.onRoll(tx, id, req.memberId!)))
        throw new ApiError(403, "not_on_roll");
      const [m] = await tx
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.id, concerned), isNull(members.deletedAt)));
      if (!m) throw new ApiError(400, "member_not_found");
      const listed = await this.onRoll(tx, id, concerned);
      if (body.kind === "missing" && listed) throw new ApiError(409, "already_on_roll");
      if (body.kind === "ineligible" && !listed) throw new ApiError(409, "not_on_roll");
      const [c] = await tx
        .insert(rollContests)
        .values({
          partyId: req.partyId,
          electionId: id,
          memberId: req.memberId!,
          concernedMemberId: concerned,
          kind: body.kind,
          reason: body.reason,
        })
        .returning({ id: rollContests.id });
      return { id: c!.id };
    });
  }
}
