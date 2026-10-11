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
} from "@civora/db";
import { PERMISSIONS, type Permission } from "@civora/shared";
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

  /** Parti visé par l'écran de connexion (application ou site du parti). */
  private async partyBySlug(slug: string) {
    const [p] = await withAuthLookup({ partySlug: slug }, (tx) =>
      tx.select({ id: parties.id, name: parties.name, otpChannels: parties.otpChannels }).from(parties),
    );
    return p ?? null;
  }

  /**
   * Demande d'un code. La réponse est identique que le compte existe ou non (pas d'énumération des membres) :
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

      const [recent] = await tx
        .select({ n: count() })
        .from(otpChallenges)
        .where(
          and(eq(otpChallenges.userId, m.userId), gt(otpChallenges.createdAt, new Date(this.now() - OTP_WINDOW_MS))),
        );
      if ((recent?.n ?? 0) >= OTP_MAX_PER_WINDOW) return null;

      const challengeId = randomUUID();
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await tx.insert(otpChallenges).values({
        id: challengeId,
        partyId: party.id,
        userId: m.userId,
        channel: input.channel,
        codeHash: this.codeHash(challengeId, code),
        expiresAt: new Date(this.now() + OTP_TTL_MS),
        ip: input.ip ?? null,
        createdAt: new Date(this.now()),
      });
      return { challengeId, code, m };
    });
    if (!found) return decoy;

    const t = OTP_MESSAGES[messageLocale(found.m.locale)];
    if (input.channel === "email" && found.m.email) {
      await this.d.email.send({
        to: found.m.email,
        subject: t.subject(party.name),
        text: t.text(party.name, found.code),
      });
    } else if (input.channel === "sms" && found.m.phone) {
      await this.d.sms.send(found.m.phone, t.sms(party.name, found.code));
    }
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
      const [c] = await tx.select().from(otpChallenges).where(eq(otpChallenges.id, input.challengeId)).for("update");
      if (!c || c.consumedAt || c.expiresAt.getTime() <= this.now() || c.attempts >= OTP_MAX_ATTEMPTS) {
        return { ok: false as const };
      }
      const expected = Buffer.from(c.codeHash, "hex");
      const given = Buffer.from(this.codeHash(c.id, input.code), "hex");
      const match = expected.length === given.length && timingSafeEqual(expected, given);
      await tx
        .update(otpChallenges)
        .set(match ? { attempts: c.attempts + 1, consumedAt: new Date(this.now()) } : { attempts: c.attempts + 1 })
        .where(eq(otpChallenges.id, c.id));
      if (!match) return { ok: false as const };

      const [member] = await tx
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.userId, c.userId), isNull(members.deletedAt)));
      if (!member) return { ok: false as const };

      const isAdmin = (await this.loadGrants(tx, member.id)).length > 0;
      const [mfa] = isAdmin
        ? await tx
            .select({ confirmedAt: memberMfa.confirmedAt })
            .from(memberMfa)
            .where(eq(memberMfa.memberId, member.id))
        : [];

      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(this.now() + (isAdmin ? ADMIN_SESSION_MS : MEMBER_SESSION_MS));
      await tx.insert(sessions).values({
        partyId: party.id,
        userId: c.userId,
        memberId: member.id,
        tokenHash: hashToken(token),
        mfaRequiredAt: isAdmin ? new Date(this.now()) : null,
        expiresAt,
        ip: input.ip ?? null,
        userAgent: input.userAgent?.slice(0, 300) ?? null,
      });
      const mfaState = !isAdmin ? "none" : mfa?.confirmedAt ? "required" : "setup_required";
      return { ok: true as const, token, expiresAt, mfa: mfaState as "none" | "required" | "setup_required" };
    });

    // L'essai est enregistré (transaction validée) avant de répondre par un refus.
    if (!outcome.ok) throw new ApiError(401, "otp_invalid");
    return { token: outcome.token, expiresAt: outcome.expiresAt, mfa: outcome.mfa };
  }

  /** Droits effectifs : postes occupés à cette date, avec la zone de chaque poste (null = national). */
  private async loadGrants(tx: Parameters<Parameters<typeof withParty>[1]>[0], memberId: string): Promise<Grant[]> {
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
  async revokeAll(partyId: string, memberId: string): Promise<number> {
    const rows = await withParty(partyId, (tx) =>
      tx
        .update(sessions)
        .set({ revokedAt: new Date(this.now()) })
        .where(and(eq(sessions.memberId, memberId), isNull(sessions.revokedAt)))
        .returning({ id: sessions.id }),
    );
    return rows.length;
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
      return true;
    });
    if (!ok) throw new ApiError(401, "mfa_invalid");
  }

  private mfaAad(ctx: Pick<AuthContext, "partyId" | "memberId">, version: number) {
    return Buffer.from(`totp|${ctx.partyId}|${ctx.memberId}|v${version}`);
  }
}
