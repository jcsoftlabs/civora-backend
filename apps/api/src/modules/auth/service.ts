// SEC-04, SEC-09 : connexion par code à usage unique, sessions révocables, double authentification des administrateurs.
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, count, eq, gt, isNull, lte, or } from "drizzle-orm";
import {
  memberMfa,
  members,
  otpChallenges,
  parties,
  postHolders,
  posts,
  sessions,
  users,
  withAuthLookup,
  withParty,
  zones,
  type Tx,
} from "@civora/db";
import { PERMISSIONS, type Permission } from "@civora/shared";
import { audit } from "../../lib/audit.js";
import { deriveKey, open, seal } from "../../lib/crypto.js";
import type { EmailSender } from "../../lib/messaging/email.js";
import type { SmsSender } from "../../lib/messaging/sms.js";
import { OTP_MESSAGES, messageLocale } from "../../lib/messaging/templates.js";
import type { PartyKeys } from "../../lib/party-keys.js";
import { generateTotpSecret, otpauthUri, verifyTotp } from "../../lib/totp.js";
import { ApiError } from "../../plugins/errors.js";

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
/** Au plus 5 codes par compte et par quart d'heure (SEC-09) ; au-delà, la demande est ignorée sans le dire. */
export const OTP_MAX_PER_WINDOW = 5;
const OTP_WINDOW_MS = 15 * 60_000;
const MEMBER_SESSION_MS = 30 * 24 * 3600_000;
const ADMIN_SESSION_MS = 7 * 24 * 3600_000;

export type Channel = "email" | "sms";
/** Un code de connexion ne sert jamais à adhérer, et inversement. */
export type OtpPurpose = "login" | "signup" | "party_signup";

export interface Grant {
  permission: Permission;
  zonePath: string | null;
}

export interface AuthContext {
  sessionId: string;
  partyId: string;
  userId: string;
  memberId: string;
  /** Administrateur dont la double authentification n'est pas encore validée sur cette session. */
  mfaPending: boolean;
  grants: Grant[];
}

export interface AuthDeps {
  /** Secret serveur qui protège les empreintes des codes (AUTH_SECRET). */
  secret: Buffer;
  email: EmailSender;
  sms: SmsSender;
  keys: PartyKeys;
  now?: () => number;
}

export const normalizeEmail = (email: string) => email.normalize("NFKC").trim().toLowerCase();
export const hashToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);

export class AuthService {
  constructor(private readonly d: AuthDeps) {}

  private now() {
    return this.d.now?.() ?? Date.now();
  }

  private codeHash(challengeId: string, code: string): string {
    return createHmac("sha256", this.d.secret).update(`${challengeId}:${code}`).digest("hex");
  }

  /** Parti visé par l'écran de connexion ou d'adhésion (application ou site du parti). */
  async partyBySlug(slug: string) {
    const [p] = await withAuthLookup({ partySlug: slug }, (tx) =>
      tx
        .select({
          id: parties.id,
          name: parties.name,
          otpChannels: parties.otpChannels,
          admissionMode: parties.admissionMode,
          status: parties.status,
        })
        .from(parties),
    );
    // Un espace en cours de création n'existe pas encore pour la connexion ni l'adhésion.
    return p && p.status === "active" ? p : null;
  }

  /**
   * Crée un code à usage unique pour ce compte, dans ce parti. null si le compte a déjà reçu trop de codes
   * dans le quart d'heure (SEC-09) : l'appelant répond alors comme si tout allait bien.
   */
  async issueChallenge(
    tx: Tx,
    p: { partyId: string; userId: string; channel: Channel; purpose: OtpPurpose; ip?: string | undefined },
  ): Promise<{ challengeId: string; code: string } | null> {
    const [recent] = await tx
      .select({ n: count() })
      .from(otpChallenges)
      .where(
        and(eq(otpChallenges.userId, p.userId), gt(otpChallenges.createdAt, new Date(this.now() - OTP_WINDOW_MS))),
      );
    if ((recent?.n ?? 0) >= OTP_MAX_PER_WINDOW) return null;
    const challengeId = randomUUID();
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await tx.insert(otpChallenges).values({
      id: challengeId,
      partyId: p.partyId,
      userId: p.userId,
      channel: p.channel,
      purpose: p.purpose,
      codeHash: this.codeHash(challengeId, code),
      expiresAt: new Date(this.now() + OTP_TTL_MS),
      ip: p.ip ?? null,
      createdAt: new Date(this.now()),
    });
    return { challengeId, code };
  }

  /**
   * Consomme un code : renvoie le compte si le code est bon, null sinon. Chaque essai est compté ; le dernier
   * essai épuisé est audité. L'appelant doit laisser la transaction se valider même en cas d'échec.
   */
  async consumeChallenge(
    tx: Tx,
    p: { partyId: string; challengeId: string; code: string; purpose: OtpPurpose; ip?: string | undefined },
  ): Promise<{ userId: string; channel: string } | null> {
    const [c] = await tx.select().from(otpChallenges).where(eq(otpChallenges.id, p.challengeId)).for("update");
    if (
      !c ||
      c.purpose !== p.purpose ||
      c.consumedAt ||
      c.expiresAt.getTime() <= this.now() ||
      c.attempts >= OTP_MAX_ATTEMPTS
    ) {
      return null;
    }
    const expected = Buffer.from(c.codeHash, "hex");
    const given = Buffer.from(this.codeHash(c.id, p.code), "hex");
    const match = expected.length === given.length && timingSafeEqual(expected, given);
    await tx
      .update(otpChallenges)
      .set(match ? { attempts: c.attempts + 1, consumedAt: new Date(this.now()) } : { attempts: c.attempts + 1 })
      .where(eq(otpChallenges.id, c.id));
    if (match) return { userId: c.userId, channel: c.channel };
    if (c.attempts + 1 >= OTP_MAX_ATTEMPTS) {
      await audit(tx, {
        partyId: p.partyId,
        actorUserId: c.userId,
        actorKind: "member",
        action: "auth.otp.locked",
        targetType: "otp_challenge",
        targetId: c.id,
        ...(p.ip ? { ip: p.ip } : {}),
      });
    }
    return null;
  }

  /** Rend un code de nouveau utilisable (formulaire refusé après un code juste) ; l'essai reste compté. */
  async releaseChallenge(tx: Tx, challengeId: string): Promise<void> {
    await tx.update(otpChallenges).set({ consumedAt: null }).where(eq(otpChallenges.id, challengeId));
  }

  /** Envoie le code par le canal choisi, dans la langue du compte. */
  async deliverCode(
    to: { email: string | null; phone: string | null; locale: string | null },
    channel: Channel,
    partyName: string,
    code: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    const t = OTP_MESSAGES[messageLocale(to.locale)];
    const subject =
      purpose === "party_signup"
        ? t.partySubject(partyName)
        : purpose === "signup"
          ? t.signupSubject(partyName)
          : t.subject(partyName);
    const text =
      purpose === "party_signup"
        ? t.partyText(partyName, code)
        : purpose === "signup"
          ? t.signupText(partyName, code)
          : t.text(partyName, code);
    if (channel === "email" && to.email) await this.d.email.send({ to: to.email, subject, text });
    else if (channel === "sms" && to.phone) await this.d.sms.send(to.phone, t.sms(partyName, code));
  }

  /** Ouvre une session ; un titulaire de poste devra valider sa 2FA avant d'exercer ses droits. */
  async openSession(
    tx: Tx,
    p: {
      partyId: string;
      userId: string;
      memberId: string;
      channel: string;
      ip?: string | undefined;
      userAgent?: string | undefined;
    },
  ): Promise<{ token: string; expiresAt: Date; mfa: "none" | "required" | "setup_required" }> {
    const isAdmin = (await this.loadGrants(tx, p.memberId)).length > 0;
    const [mfa] = isAdmin
      ? await tx
          .select({ confirmedAt: memberMfa.confirmedAt })
          .from(memberMfa)
          .where(eq(memberMfa.memberId, p.memberId))
      : [];
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.now() + (isAdmin ? ADMIN_SESSION_MS : MEMBER_SESSION_MS));
    await tx.insert(sessions).values({
      partyId: p.partyId,
      userId: p.userId,
      memberId: p.memberId,
      tokenHash: hashToken(token),
      mfaRequiredAt: isAdmin ? new Date(this.now()) : null,
      expiresAt,
      ip: p.ip ?? null,
      userAgent: p.userAgent?.slice(0, 300) ?? null,
    });
    const mfaState: "none" | "required" | "setup_required" = !isAdmin
      ? "none"
      : mfa?.confirmedAt
        ? "required"
        : "setup_required";
    await audit(tx, {
      partyId: p.partyId,
      actorUserId: p.userId,
      actorKind: "member",
      action: "auth.login",
      targetType: "member",
      targetId: p.memberId,
      metadata: { channel: p.channel, admin: isAdmin },
      ...(p.ip ? { ip: p.ip } : {}),
    });
    return { token, expiresAt, mfa: mfaState };
  }

  /**
   * Demande d'un code de connexion. La réponse est identique que le compte existe ou non (pas d'énumération) :
   * un identifiant de défi est toujours renvoyé ; il ne mène à rien si personne n'a reçu de code.
   */
  async requestOtp(input: {
    partySlug: string;
    channel: Channel;
    destination: string;
    ip?: string;
  }): Promise<{ challengeId: string }> {
    const decoy = { challengeId: randomUUID() };
    const party = await this.partyBySlug(input.partySlug);
    if (!party) return decoy;
    if (!party.otpChannels.includes(input.channel)) throw new ApiError(400, "otp_channel_disabled");

    const found = await withParty(party.id, async (tx) => {
      const where =
        input.channel === "email"
          ? eq(users.email, normalizeEmail(input.destination))
          : eq(users.phoneE164, input.destination);
      const [m] = await tx
        .select({ userId: users.id, email: users.email, phone: users.phoneE164, locale: users.locale })
        .from(members)
        .innerJoin(users, eq(users.id, members.userId))
        .where(and(where, isNull(members.deletedAt)))
        .limit(1);
      if (!m) return null;
      const ch = await this.issueChallenge(tx, {
        partyId: party.id,
        userId: m.userId,
        channel: input.channel,
        purpose: "login",
        ip: input.ip,
      });
      return ch ? { ...ch, m } : null;
    });
    if (!found) return decoy;
    await this.deliverCode(found.m, input.channel, party.name, found.code, "login");
    return { challengeId: found.challengeId };
  }

  /** Vérifie le code et ouvre une session. Chaque essai est compté, même en cas d'échec. */
  async verifyOtp(input: {
    partySlug: string;
    challengeId: string;
    code: string;
    ip?: string;
    userAgent?: string;
  }): Promise<{ token: string; expiresAt: Date; mfa: "none" | "required" | "setup_required" }> {
    const party = await this.partyBySlug(input.partySlug);
    if (!party) throw new ApiError(401, "otp_invalid");

    const outcome = await withParty(party.id, async (tx) => {
      const c = await this.consumeChallenge(tx, { partyId: party.id, ...input, purpose: "login" });
      if (!c) return null;
      const [member] = await tx
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.userId, c.userId), isNull(members.deletedAt)));
      if (!member) return null;
      return this.openSession(tx, {
        partyId: party.id,
        userId: c.userId,
        memberId: member.id,
        channel: c.channel,
        ip: input.ip,
        userAgent: input.userAgent,
      });
    });
    // L'essai est enregistré (transaction validée) avant de répondre par un refus.
    if (!outcome) throw new ApiError(401, "otp_invalid");
    return outcome;
  }

  /** Droits effectifs : postes occupés à cette date, avec la zone de chaque poste (null = national). */
  private async loadGrants(tx: Tx, memberId: string): Promise<Grant[]> {
    const now = new Date(this.now());
    const rows = await tx
      .select({ permissions: posts.permissions, zonePath: zones.path })
      .from(postHolders)
      .innerJoin(posts, and(eq(posts.partyId, postHolders.partyId), eq(posts.id, postHolders.postId)))
      .leftJoin(zones, eq(zones.id, posts.scopeZoneId))
      .where(
        and(
          eq(postHolders.memberId, memberId),
          lte(postHolders.startsAt, now),
          or(isNull(postHolders.endsAt), gt(postHolders.endsAt, now)),
        ),
      );
    return rows.flatMap((r) =>
      r.permissions
        .filter((p): p is Permission => PERMISSION_SET.has(p))
        .map((permission) => ({ permission, zonePath: r.zonePath ?? null })),
    );
  }

  /** Jeton présenté par l'application : session valide, non révoquée, non expirée. */
  async authenticate(token: string): Promise<AuthContext | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const tokenHash = hashToken(token);
    const [s] = await withAuthLookup({ sessionTokenHash: tokenHash }, (tx) => tx.select().from(sessions));
    if (!s || s.revokedAt || s.expiresAt.getTime() <= this.now()) return null;

    return withParty(s.partyId, async (tx) => {
      const [member] = await tx
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.id, s.memberId), isNull(members.deletedAt)));
      if (!member) return null;
      // Dernière activité, au plus une écriture toutes les 5 minutes.
      if (!s.lastSeenAt || this.now() - s.lastSeenAt.getTime() > 5 * 60_000) {
        await tx
          .update(sessions)
          .set({ lastSeenAt: new Date(this.now()) })
          .where(eq(sessions.id, s.id));
      }
      const mfaPending = s.mfaRequiredAt !== null && s.mfaVerifiedAt === null;
      return {
        sessionId: s.id,
        partyId: s.partyId,
        userId: s.userId,
        memberId: s.memberId,
        mfaPending,
        // Tant que la 2FA n'est pas validée, aucun droit d'administration n'est actif.
        grants: mfaPending ? [] : await this.loadGrants(tx, s.memberId),
      };
    });
  }

  async logout(ctx: Pick<AuthContext, "partyId" | "sessionId">): Promise<void> {
    await withParty(ctx.partyId, (tx) =>
      tx
        .update(sessions)
        .set({ revokedAt: new Date(this.now()) })
        .where(eq(sessions.id, ctx.sessionId)),
    );
  }

  /** Révoque toutes les sessions d'un membre (téléphone perdu, départ d'un responsable). */
  async revokeAll(partyId: string, memberId: string, actorUserId: string | null = null): Promise<number> {
    return withParty(partyId, async (tx) => {
      const rows = await tx
        .update(sessions)
        .set({ revokedAt: new Date(this.now()) })
        .where(and(eq(sessions.memberId, memberId), isNull(sessions.revokedAt)))
        .returning({ id: sessions.id });
      await audit(tx, {
        partyId,
        actorUserId,
        actorKind: "member",
        action: "auth.sessions.revoked",
        targetType: "member",
        targetId: memberId,
        metadata: { count: rows.length },
      });
      return rows.length;
    });
  }

  /** Inscription à la 2FA : secret chiffré avec la clé du parti, montré une seule fois. */
  async setupMfa(ctx: AuthContext, accountLabel: string): Promise<{ otpauthUri: string }> {
    return withParty(ctx.partyId, async (tx) => {
      const [existing] = await tx
        .select({ confirmedAt: memberMfa.confirmedAt })
        .from(memberMfa)
        .where(eq(memberMfa.memberId, ctx.memberId));
      if (existing?.confirmedAt) throw new ApiError(409, "mfa_already_enabled");
      const [party] = await tx.select({ name: parties.name }).from(parties);
      const secret = generateTotpSecret();
      const key = await this.d.keys.active(tx, ctx.partyId);
      const secretEncrypted = seal(deriveKey(key.dek, "totp"), secret, this.mfaAad(ctx, key.version));
      await tx
        .insert(memberMfa)
        .values({ partyId: ctx.partyId, memberId: ctx.memberId, secretEncrypted, keyVersion: key.version })
        .onConflictDoUpdate({
          target: [memberMfa.partyId, memberMfa.memberId],
          set: { secretEncrypted, keyVersion: key.version, lastUsedStep: null, updatedAt: new Date(this.now()) },
        });
      return { otpauthUri: otpauthUri(secret, `civora ${party?.name ?? ""}`.trim(), accountLabel) };
    });
  }

  /** Valide un code de l'application d'authentification et lève la restriction de la session. */
  async verifyMfa(ctx: AuthContext, code: string): Promise<void> {
    const ok = await withParty(ctx.partyId, async (tx) => {
      const [m] = await tx.select().from(memberMfa).where(eq(memberMfa.memberId, ctx.memberId)).for("update");
      if (!m) throw new ApiError(409, "mfa_not_enrolled");
      const key = await this.d.keys.byVersion(tx, ctx.partyId, m.keyVersion);
      const secret = open(deriveKey(key.dek, "totp"), m.secretEncrypted, this.mfaAad(ctx, m.keyVersion));
      const step = verifyTotp(secret, code, m.lastUsedStep, this.now());
      if (step === null) return false;
      await tx
        .update(memberMfa)
        .set({
          lastUsedStep: step,
          confirmedAt: m.confirmedAt ?? new Date(this.now()),
          updatedAt: new Date(this.now()),
        })
        .where(eq(memberMfa.id, m.id));
      await tx
        .update(sessions)
        .set({ mfaVerifiedAt: new Date(this.now()) })
        .where(eq(sessions.id, ctx.sessionId));
      if (!m.confirmedAt) {
        await audit(tx, {
          partyId: ctx.partyId,
          actorUserId: ctx.userId,
          actorKind: "member",
          action: "auth.mfa.enabled",
          targetType: "member",
          targetId: ctx.memberId,
        });
      }
      return true;
    });
    if (!ok) throw new ApiError(401, "mfa_invalid");
  }

  private mfaAad(ctx: Pick<AuthContext, "partyId" | "memberId">, version: number) {
    return Buffer.from(`totp|${ctx.partyId}|${ctx.memberId}|v${version}`);
  }
}
