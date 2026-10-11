// ADH-06 : validation, rejet et notation des adhésions, par un responsable de la zone du candidat.
import type { FastifyRequest } from "fastify";
import { and, asc, eq, isNull } from "drizzle-orm";
import { members, parties, referrals, users, withParty, zones } from "@civora/db";
import { audit } from "../../lib/audit.js";
import type { EmailSender } from "../../lib/messaging/email.js";
import { APPLICATION_MESSAGES, messageLocale } from "../../lib/messaging/templates.js";
import { zoneScope } from "../../lib/zone-scope.js";
import { ApiError } from "../../plugins/errors.js";
import type { DuesService } from "../dues/service.js";
import { authorize } from "../../plugins/tenant.js";

type Req = FastifyRequest;

export class ApplicationsService {
  constructor(
    private readonly email: EmailSender,
    private readonly dues: DuesService,
  ) {}

  /** File des adhésions en attente dans la zone de la personne (members.approve), les plus anciennes d'abord. */
  async list(req: Req, limit = 50) {
    const scope = zoneScope(req, "members.approve");
    if (!scope.allowed) throw new ApiError(403, "forbidden");
    return withParty(req.partyId, (tx) =>
      tx
        .select({
          id: members.id,
          memberNumber: members.memberNumber,
          firstName: members.firstName,
          lastName: members.lastName,
          zoneCode: zones.code,
          zoneName: zones.name,
          isDiaspora: members.isDiaspora,
          score: members.applicationScore,
          appliedAt: members.createdAt,
          sponsored: referrals.id,
        })
        .from(members)
        .innerJoin(zones, eq(zones.id, members.zoneId))
        .leftJoin(referrals, and(eq(referrals.partyId, members.partyId), eq(referrals.referredMemberId, members.id)))
        .where(and(eq(members.applicationState, "pending"), isNull(members.deletedAt), scope.where(zones.path)))
        .orderBy(asc(members.createdAt))
        .limit(limit),
    ).then((rows) => rows.map(({ sponsored, ...r }) => ({ ...r, sponsored: sponsored !== null })));
  }

  /** Candidat en attente, dans la zone de la personne. */
  private async pending(tx: Parameters<Parameters<typeof withParty>[1]>[0], req: Req, memberId: string) {
    const [m] = await tx
      .select({
        id: members.id,
        state: members.applicationState,
        number: members.memberNumber,
        zonePath: zones.path,
        email: users.email,
        locale: users.locale,
      })
      .from(members)
      .innerJoin(zones, eq(zones.id, members.zoneId))
      .leftJoin(users, eq(users.id, members.userId))
      .where(and(eq(members.id, memberId), isNull(members.deletedAt)));
    if (!m) throw new ApiError(404, "not_found");
    if (!authorize(req, "members.approve", m.zonePath)) throw new ApiError(403, "forbidden");
    return m;
  }

  async decide(
    req: Req,
    memberId: string,
    decision: "approved" | "rejected",
    body: { score?: number | undefined; reason?: string | undefined },
  ) {
    const notice = await withParty(req.partyId, async (tx) => {
      const m = await this.pending(tx, req, memberId);
      if (m.state !== "pending") throw new ApiError(409, "application_already_decided");
      const now = new Date();
      await tx
        .update(members)
        .set({
          applicationState: decision,
          ...(decision === "approved" ? { joinedAt: now } : {}),
          ...(body.score !== undefined ? { applicationScore: body.score } : {}),
          updatedAt: now,
        })
        .where(eq(members.id, memberId));
      if (decision === "approved") {
        await tx
          .update(referrals)
          .set({ validatedAt: now, updatedAt: now })
          .where(eq(referrals.referredMemberId, memberId));
        await this.dues.onMemberApproved(tx, req.partyId, memberId, now); // formules par défaut (FIN-03)
      }
      await audit(tx, {
        partyId: req.partyId,
        actorUserId: req.auth?.userId ?? null,
        actorKind: "member",
        action: decision === "approved" ? "member.approve" : "member.reject",
        targetType: "member",
        targetId: memberId,
        // Le motif est interne : il reste au journal, il n'est pas envoyé au candidat.
        metadata: { score: body.score ?? null, reason: body.reason ?? null },
        ip: req.clientIp,
      });
      const [party] = await tx.select({ name: parties.name }).from(parties);
      return { ...m, partyName: party?.name ?? "" };
    });

    if (notice.email) {
      const t = APPLICATION_MESSAGES[messageLocale(notice.locale)];
      await this.email
        .send(
          decision === "approved"
            ? {
                to: notice.email,
                subject: t.approvedSubject(notice.partyName),
                text: t.approvedText(notice.partyName, notice.number),
              }
            : {
                to: notice.email,
                subject: t.rejectedSubject(notice.partyName),
                text: t.rejectedText(notice.partyName),
              },
        )
        // La décision est enregistrée même si l'e-mail échoue ; le membre la verra dans l'application.
        .catch((err: unknown) => req.log.warn({ err }, "e-mail de décision non envoyé"));
    }
  }

  /**
   * Validation groupée depuis la liste : chaque demande passe par la même décision (zone, journal, e-mail).
   * Une demande déjà traitée ou hors de la zone est comptée à part, sans bloquer les autres.
   */
  async approveMany(req: Req, ids: string[]) {
    const result = { approved: 0, skipped: 0 };
    for (const id of new Set(ids)) {
      try {
        await this.decide(req, id, "approved", {});
        result.approved++;
      } catch (e) {
        if (e instanceof ApiError && [403, 404, 409].includes(e.statusCode)) result.skipped++;
        else throw e;
      }
    }
    return result;
  }

  async score(req: Req, memberId: string, score: number) {
    await withParty(req.partyId, async (tx) => {
      const m = await this.pending(tx, req, memberId);
      if (m.state !== "pending") throw new ApiError(409, "application_already_decided");
      await tx.update(members).set({ applicationScore: score, updatedAt: new Date() }).where(eq(members.id, memberId));
      await audit(tx, {
        partyId: req.partyId,
        actorUserId: req.auth?.userId ?? null,
        actorKind: "member",
        action: "member.score",
        targetType: "member",
        targetId: memberId,
        metadata: { score },
        ip: req.clientIp,
      });
    });
  }
}
