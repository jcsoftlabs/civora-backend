// ADH-01 à ADH-04 : adhésion par code e-mail, fiche membre, statuts configurables, mode d'adhésion.
import type { FastifyRequest } from "fastify";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  memberIdentities,
  memberStatuses,
  members,
  parties,
  referrals,
  users,
  withParty,
  zones,
  type Tx,
} from "@civora/db";
import { backfillReferralCodes, onApproved, partyEngagement, sponsorByCode } from "../engagement/points.js";
import { audit } from "../../lib/audit.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize } from "../../plugins/tenant.js";
import { normalizeEmail, type AuthService } from "../auth/service.js";
import type { DuesService } from "../dues/service.js";
import type { IdentityService } from "./identity.js";
import type {
  admissionUpdate,
  joinComplete,
  joinStart,
  meUpdate,
  memberAdminUpdate,
  statusCreate,
  statusUpdate,
} from "./schemas.js";
import type { z } from "zod";

type Req = FastifyRequest;
const actor = (req: Req) => ({
  partyId: req.partyId,
  actorUserId: req.auth?.userId ?? null,
  actorKind: "member" as const,
  ip: req.clientIp,
});

/** Zones où un membre peut se localiser (ADH-02) : section communale en Haïti, pays ou ville de la diaspora. */
const MEMBER_ZONE_LEVELS = new Set(["section_communale", "diaspora_pays", "diaspora_ville"]);

async function memberZone(tx: Tx, code: string) {
  const [z] = await tx
    .select({ id: zones.id, code: zones.code, level: zones.level, path: zones.path })
    .from(zones)
    .where(eq(zones.code, code));
  if (!z) throw new ApiError(400, "zone_not_found");
  if (!MEMBER_ZONE_LEVELS.has(z.level)) throw new ApiError(400, "zone_too_broad");
  const isDiaspora = z.level.startsWith("diaspora");
  // DIA-US-MIA → US ; Haïti → HT.
  return { ...z, isDiaspora, residenceCountry: isDiaspora ? (z.code.split("-")[1] ?? null) : "HT" };
}

async function approvedMemberByNumber(tx: Tx, number: string) {
  const [m] = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.memberNumber, number), eq(members.applicationState, "approved"), isNull(members.deletedAt)));
  return m ?? null;
}

/** Numéro de membre suivant, sans doublon même sous inscriptions simultanées (verrou par parti). */
export async function nextMemberNumber(tx: Tx, partyId: string): Promise<string> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"members:" + partyId}, 0))`);
  const [r] = await tx.execute<{ n: string }>(
    sql`select coalesce(max(member_number::bigint), 0) + 1 as n from members where member_number ~ '^[0-9]+$'`,
  );
  return String(r?.n ?? 1).padStart(6, "0");
}

export class MembersService {
  constructor(
    private readonly auth: AuthService,
    private readonly identity: IdentityService,
    private readonly dues: DuesService,
  ) {}

  /** Écran d'adhésion d'un parti : nom, mode d'adhésion, langues. Public. */
  async joinInfo(slug: string) {
    const party = await this.auth.partyBySlug(slug);
    if (!party) throw new ApiError(404, "not_found");
    // Thème de l'accueil de l'application mobile, avant la connexion : nom, couleur, type d'organisation.
    return {
      name: party.name,
      admissionMode: party.admissionMode,
      otpChannels: party.otpChannels,
      brandColor: party.brandColor,
      kind: party.kind,
    };
  }

  /**
   * Étape 1 : code envoyé à l'adresse e-mail pour prouver qu'elle appartient à la personne.
   * Réponse identique dans tous les cas (aucune information sur l'existence d'un compte).
   */
  async joinStart(input: z.infer<typeof joinStart>, ip?: string): Promise<{ challengeId: string }> {
    const decoy = { challengeId: crypto.randomUUID() };
    const party = await this.auth.partyBySlug(input.partySlug);
    if (!party) return decoy;
    const email = normalizeEmail(input.email);
    const issued = await withParty(party.id, async (tx) => {
      const [existing] = await tx
        .select({ id: users.id, locale: users.locale })
        .from(users)
        .where(eq(users.email, email));
      const user =
        existing ??
        (
          await tx
            .insert(users)
            .values({ email, locale: input.locale })
            .returning({ id: users.id, locale: users.locale })
        )[0]!;
      const ch = await this.auth.issueChallenge(tx, {
        partyId: party.id,
        userId: user.id,
        channel: "email",
        purpose: "signup",
        ip,
      });
      return ch ? { ...ch, locale: user.locale } : null;
    });
    if (!issued) return decoy;
    await this.auth.deliverCode(
      { email, phone: null, locale: issued.locale },
      "email",
      party,
      issued.code,
      "signup",
    );
    return { challengeId: issued.challengeId };
  }

  /** Étape 2 : code + fiche. Crée le membre selon le mode d'adhésion du parti et ouvre une session. */
  async joinComplete(input: z.infer<typeof joinComplete>, meta: { ip?: string; userAgent?: string }) {
    const party = await this.auth.partyBySlug(input.partySlug);
    if (!party) throw new ApiError(401, "otp_invalid");

    const outcome = await withParty(party.id, async (tx) => {
      const c = await this.auth.consumeChallenge(tx, {
        partyId: party.id,
        challengeId: input.challengeId,
        code: input.code,
        purpose: "signup",
        ip: meta.ip,
      });
      // Échec : on laisse la transaction se valider pour compter l'essai.
      if (!c) return { error: new ApiError(401, "otp_invalid") };
      try {
        // Sous-transaction : une erreur de validation n'annule pas la consommation du code.
        return await tx.transaction(async (sp) => ({ ok: await this.createMember(sp, party, c.userId, input, meta) }));
      } catch (e) {
        if (e instanceof ApiError) {
          // Formulaire à corriger : le code reste valable pour le nouvel essai.
          if (e.code !== "already_member") await this.auth.releaseChallenge(tx, input.challengeId);
          return { error: e };
        }
        // Un compte n'adhère qu'à un seul parti (members.user_id unique) : déjà membre ailleurs.
        if ((e as { cause?: { code?: string } }).cause?.code === "23505")
          return { error: new ApiError(409, "already_member_elsewhere") };
        throw e;
      }
    });
    if ("error" in outcome) throw outcome.error;
    return outcome.ok;
  }

  private async createMember(
    tx: Tx,
    party: { id: string; admissionMode: string },
    userId: string,
    input: z.infer<typeof joinComplete>,
    meta: { ip?: string; userAgent?: string },
  ) {
    const [already] = await tx.select({ id: members.id }).from(members).where(eq(members.userId, userId));
    if (already) throw new ApiError(409, "already_member");

    const zone = await memberZone(tx, input.zoneCode);
    const referent = input.referentMemberNumber ? await approvedMemberByNumber(tx, input.referentMemberNumber) : null;
    if (input.referentMemberNumber && !referent) throw new ApiError(400, "referent_not_found");

    // Parrain : par son code de parrainage (ENG-01) ou son numéro ; obligatoire si le parti adhère par parrainage.
    let sponsor: { id: string } | null = null;
    const engagement = await partyEngagement(tx);
    if (input.sponsorCode && engagement.referral) {
      sponsor = await sponsorByCode(tx, input.sponsorCode);
      if (!sponsor) throw new ApiError(400, "sponsor_not_found");
    } else if (input.sponsorMemberNumber) {
      sponsor = await approvedMemberByNumber(tx, input.sponsorMemberNumber);
      if (!sponsor) throw new ApiError(400, "sponsor_not_found");
    }
    if (party.admissionMode === "parrainage" && !sponsor) throw new ApiError(400, "sponsor_required");
    if (
      input.identity &&
      (await this.identity.findDuplicates(tx, party.id, input.identity.kind, input.identity.value)).length
    ) {
      // Ne dit pas à qui appartient le numéro : la fusion est l'affaire d'un responsable (ADH-08).
      throw new ApiError(409, "identity_duplicate");
    }

    const approved = party.admissionMode === "libre";
    const [m] = await tx
      .insert(members)
      .values({
        partyId: party.id,
        userId,
        memberNumber: await nextMemberNumber(tx, party.id),
        firstName: input.firstName,
        lastName: input.lastName,
        birthDate: input.birthDate ? input.birthDate.toISOString().slice(0, 10) : null,
        phoneE164: input.phone ?? null,
        zoneId: zone.id,
        isDiaspora: zone.isDiaspora,
        residenceCountry: zone.residenceCountry,
        referentMemberId: referent?.id ?? null,
        applicationState: approved ? "approved" : "pending",
        joinedAt: approved ? new Date() : null,
      })
      .returning({ id: members.id, memberNumber: members.memberNumber, applicationState: members.applicationState });
    const member = m!;
    if (sponsor)
      await tx.insert(referrals).values({
        partyId: party.id,
        sponsorMemberId: sponsor.id,
        referredMemberId: member.id,
        // Adhésion libre : le filleul est membre tout de suite, le parrainage est validé.
        validatedAt: approved ? new Date() : null,
      });
    if (approved) await onApproved(tx, party.id, member.id);
    if (input.identity) await this.identity.store(tx, party.id, member.id, input.identity.kind, input.identity.value);
    if (approved) await this.dues.onMemberApproved(tx, party.id, member.id, new Date()); // adhésion libre
    await audit(tx, {
      partyId: party.id,
      actorUserId: userId,
      actorKind: "member",
      action: "member.join",
      targetType: "member",
      targetId: member.id,
      metadata: { admissionMode: party.admissionMode, zone: zone.code, identity: input.identity?.kind ?? null },
      ...(meta.ip ? { ip: meta.ip } : {}),
    });
    const session = await this.auth.openSession(tx, {
      partyId: party.id,
      userId,
      memberId: member.id,
      channel: "email",
      ip: meta.ip,
      userAgent: meta.userAgent,
      scope: input.client === "app" ? "member" : "full",
    });
    return { ...member, token: session.token, expiresAt: session.expiresAt };
  }

  /** Fiche d'un membre : profil, localisation et fil d'Ariane, statut ; jamais la valeur des pièces d'identité. */
  private async profile(tx: Tx, memberId: string) {
    const [m] = await tx
      .select({
        id: members.id,
        memberNumber: members.memberNumber,
        firstName: members.firstName,
        lastName: members.lastName,
        birthDate: members.birthDate,
        phone: members.phoneE164,
        photoFileId: members.photoFileId,
        isDiaspora: members.isDiaspora,
        residenceCountry: members.residenceCountry,
        applicationState: members.applicationState,
        applicationScore: members.applicationScore,
        email: users.email,
        createdAt: members.createdAt,
        joinedAt: members.joinedAt,
        category: members.category,
        tags: members.tags,
        statusId: members.statusId,
        statusLabel: memberStatuses.label,
        referentMemberId: members.referentMemberId,
        zoneCode: zones.code,
        zonePath: zones.path,
      })
      .from(members)
      .innerJoin(zones, eq(zones.id, members.zoneId))
      .leftJoin(
        memberStatuses,
        and(eq(memberStatuses.partyId, members.partyId), eq(memberStatuses.id, members.statusId)),
      )
      .leftJoin(users, eq(users.id, members.userId))
      .where(and(eq(members.id, memberId), isNull(members.deletedAt)));
    if (!m) throw new ApiError(404, "not_found");
    const [referent] = m.referentMemberId
      ? await tx
          .select({ number: members.memberNumber, firstName: members.firstName, lastName: members.lastName })
          .from(members)
          .where(eq(members.id, m.referentMemberId))
      : [];
    const location = await tx
      .select({ code: zones.code, level: zones.level, name: zones.name, nameHt: zones.nameHt })
      .from(zones)
      .where(sql`${zones.path} @> ${m.zonePath}::ltree and nlevel(${zones.path}) > 0`)
      .orderBy(sql`nlevel(${zones.path})`);
    const identities = await tx
      .select({ id: memberIdentities.id, kind: memberIdentities.kind })
      .from(memberIdentities)
      .where(eq(memberIdentities.memberId, memberId));
    const { zonePath, ...rest } = m;
    return { member: { ...rest, referent: referent ?? null, location, identities }, zonePath };
  }

  async getMe(req: Req) {
    return withParty(req.partyId, async (tx) => (await this.profile(tx, req.memberId!)).member);
  }

  async updateMe(req: Req, body: z.infer<typeof meUpdate>) {
    await withParty(req.partyId, async (tx) => {
      const zone = body.zoneCode ? await memberZone(tx, body.zoneCode) : null;
      await tx
        .update(members)
        .set({
          ...(body.firstName ? { firstName: body.firstName } : {}),
          ...(body.lastName ? { lastName: body.lastName } : {}),
          ...(body.birthDate !== undefined
            ? { birthDate: body.birthDate ? body.birthDate.toISOString().slice(0, 10) : null }
            : {}),
          ...(body.phone !== undefined ? { phoneE164: body.phone } : {}),
          ...(zone ? { zoneId: zone.id, isDiaspora: zone.isDiaspora, residenceCountry: zone.residenceCountry } : {}),
          updatedAt: new Date(),
        })
        .where(eq(members.id, req.memberId!));
    });
  }

  /** Fiche vue par un responsable : members.read dans la zone du membre (SEC-05). */
  async getMember(req: Req, id: string) {
    return withParty(req.partyId, async (tx) => {
      const { member, zonePath } = await this.profile(tx, id);
      if (!authorize(req, "members.read", zonePath)) throw new ApiError(403, "forbidden");
      return member;
    });
  }

  async adminUpdate(req: Req, id: string, body: z.infer<typeof memberAdminUpdate>) {
    await withParty(req.partyId, async (tx) => {
      const { zonePath } = await this.profile(tx, id);
      if (!authorize(req, "members.write", zonePath)) throw new ApiError(403, "forbidden");
      if (body.statusId) {
        const [s] = await tx
          .select({ id: memberStatuses.id })
          .from(memberStatuses)
          .where(eq(memberStatuses.id, body.statusId));
        if (!s) throw new ApiError(400, "status_not_found");
      }
      await tx
        .update(members)
        .set({
          ...(body.statusId !== undefined ? { statusId: body.statusId } : {}),
          ...(body.category !== undefined ? { category: body.category } : {}),
          ...(body.tags ? { tags: body.tags } : {}),
          updatedAt: new Date(),
        })
        .where(eq(members.id, id));
      await audit(tx, {
        ...actor(req),
        action: "member.update",
        targetType: "member",
        targetId: id,
        metadata: { fields: Object.keys(body) },
      });
    });
  }

  /** Lecture d'une pièce d'identité en clair : identity.read dans la zone du membre, auditée (SEC-02). */
  async revealIdentity(req: Req, memberId: string, identityId: string) {
    return withParty(req.partyId, async (tx) => {
      const [own] = await tx
        .select({ id: memberIdentities.id })
        .from(memberIdentities)
        .where(and(eq(memberIdentities.id, identityId), eq(memberIdentities.memberId, memberId)));
      if (!own) throw new ApiError(404, "not_found");
      return this.identity.read(
        tx,
        req.partyId,
        { grants: req.grants, userId: req.auth?.userId ?? null, ip: req.clientIp },
        identityId,
      );
    });
  }

  // ADH-03 : niveaux de statut du parti.
  async listStatuses(req: Req) {
    return withParty(req.partyId, (tx) =>
      tx
        .select({ id: memberStatuses.id, label: memberStatuses.label, rank: memberStatuses.rank })
        .from(memberStatuses)
        .orderBy(asc(memberStatuses.rank)),
    );
  }

  async createStatus(req: Req, body: z.infer<typeof statusCreate>) {
    if (!authorize(req, "settings.party")) throw new ApiError(403, "forbidden");
    return withParty(req.partyId, async (tx) => {
      const [s] = await tx
        .insert(memberStatuses)
        .values({ partyId: req.partyId, label: body.label, rank: body.rank })
        .returning({ id: memberStatuses.id });
      await audit(tx, {
        ...actor(req),
        action: "settings.status.create",
        targetType: "member_status",
        targetId: s!.id,
        metadata: { label: body.label },
      });
      return { id: s!.id };
    });
  }

  async updateStatus(req: Req, id: string, body: z.infer<typeof statusUpdate>) {
    if (!authorize(req, "settings.party")) throw new ApiError(403, "forbidden");
    await withParty(req.partyId, async (tx) => {
      const rows = await tx
        .update(memberStatuses)
        .set({
          ...(body.label ? { label: body.label } : {}),
          ...(body.rank !== undefined ? { rank: body.rank } : {}),
          updatedAt: new Date(),
        })
        .where(eq(memberStatuses.id, id))
        .returning({ id: memberStatuses.id });
      if (!rows.length) throw new ApiError(404, "not_found");
      await audit(tx, {
        ...actor(req),
        action: "settings.status.update",
        targetType: "member_status",
        targetId: id,
        metadata: body,
      });
    });
  }

  /** ADH-04 : mode d'adhésion, modifiable à tout moment (réglage du parti, audité). */
  async setAdmissionMode(req: Req, body: z.infer<typeof admissionUpdate>) {
    if (!authorize(req, "settings.party")) throw new ApiError(403, "forbidden");
    await withParty(req.partyId, async (tx) => {
      const [before] = await tx.select({ mode: parties.admissionMode }).from(parties);
      await tx
        .update(parties)
        .set({ admissionMode: body.admissionMode, updatedAt: new Date() })
        .where(eq(parties.id, req.partyId));
      // Adhésion par parrainage : le parrainage devient actif, chaque membre validé reçoit son code (ENG-01).
      if (body.admissionMode === "parrainage") await backfillReferralCodes(tx);
      await audit(tx, {
        ...actor(req),
        action: "settings.admission",
        targetType: "party",
        targetId: req.partyId,
        metadata: { before: before?.mode ?? null, after: body.admissionMode },
      });
    });
  }
}
