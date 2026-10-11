// SOC-10 : connexion à la console de l'éditeur. Comptes du personnel distincts des comptes d'organisation :
// code à six chiffres par e-mail (dix minutes, cinq essais), puis double authentification obligatoire
// (application d'authentification). Session de douze heures, jeton aléatoire dont seule l'empreinte est gardée.
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { platformAuditLog, platformStaff, staffChallenges, staffSessions, withConsole, type Tx } from "@civora/db";
import type { KeyProvider } from "../../lib/crypto.js";
import type { EmailSender } from "../../lib/messaging/email.js";
import { base32Encode, generateTotpSecret, otpauthUri, verifyTotp } from "../../lib/totp.js";

export type StaffRole = "owner" | "support";
export interface StaffContext {
  staffId: string;
  sessionId: string;
  email: string;
  name: string;
  role: StaffRole;
  /** setup_required : secret à enregistrer ; required : code à saisir ; none : session complète. */
  mfa: "none" | "required" | "setup_required";
}

const CODE_TTL_MS = 10 * 60_000;
const CODE_MAX_ATTEMPTS = 5;
const CODES_PER_HOUR = 5;
const SESSION_TTL_MS = 12 * 3600_000;
const MFA_AAD = "civora:staff-mfa";

export const hashStaffToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
export const normalizeStaffEmail = (email: string) => email.trim().toLowerCase();

/** Entrée du journal de la console (ajout seulement). */
export async function consoleAudit(
  tx: Tx,
  e: { staffId: string | null; action: string; targetPartyId?: string | null; metadata?: object; ip?: string },
) {
  await tx.insert(platformAuditLog).values({
    staffId: e.staffId,
    action: e.action,
    targetPartyId: e.targetPartyId ?? null,
    metadata: e.metadata ?? null,
    ip: e.ip ?? null,
  });
}

export class ConsoleAuth {
  constructor(private readonly d: { secret: Buffer; email: EmailSender; keys: KeyProvider; now?: () => number }) {}

  private now() {
    return this.d.now?.() ?? Date.now();
  }
  private codeHash(challengeId: string, code: string) {
    return createHmac("sha256", this.d.secret).update(`staff:${challengeId}:${code}`).digest("hex");
  }

  /**
   * Demande de code. La réponse est la même que l'adresse existe ou non (pas d'énumération du personnel) ;
   * seul un compte actif reçoit un e-mail.
   */
  async requestCode(rawEmail: string, ip?: string): Promise<{ challengeId: string }> {
    const email = normalizeStaffEmail(rawEmail);
    return withConsole(async (tx) => {
      const [s] = await tx
        .select({ id: platformStaff.id, name: platformStaff.name })
        .from(platformStaff)
        .where(and(eq(platformStaff.email, email), isNull(platformStaff.disabledAt)));
      if (!s) return { challengeId: randomUUID() };
      const [recent] = await tx
        .select({ n: count() })
        .from(staffChallenges)
        .where(and(eq(staffChallenges.staffId, s.id), gt(staffChallenges.createdAt, new Date(this.now() - 3600_000))));
      if ((recent?.n ?? 0) >= CODES_PER_HOUR) return { challengeId: randomUUID() };
      const challengeId = randomUUID();
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await tx.insert(staffChallenges).values({
        id: challengeId,
        staffId: s.id,
        codeHash: this.codeHash(challengeId, code),
        expiresAt: new Date(this.now() + CODE_TTL_MS),
        createdAt: new Date(this.now()),
      });
      await this.d.email.send({
        to: email,
        subject: `${code} : votre code de connexion à la console civora`,
        text: `Bonjour ${s.name},\n\nVotre code de connexion à la console civora : ${code}\nIl expire dans dix minutes.\n\nSi vous n'avez rien demandé, ignorez ce message.`,
      });
      await consoleAudit(tx, { staffId: s.id, action: "console.code", ...(ip ? { ip } : {}) });
      return { challengeId };
    });
  }

  /** Code juste : session ouverte, en attente de la double authentification. */
  async verifyCode(challengeId: string, code: string, meta: { ip?: string; userAgent?: string }) {
    return withConsole(async (tx) => {
      const [c] = await tx.select().from(staffChallenges).where(eq(staffChallenges.id, challengeId)).for("update");
      if (!c || c.consumedAt || c.expiresAt.getTime() <= this.now() || c.attempts >= CODE_MAX_ATTEMPTS) return null;
      const expected = Buffer.from(c.codeHash, "hex");
      const given = Buffer.from(this.codeHash(c.id, code), "hex");
      const ok = expected.length === given.length && timingSafeEqual(expected, given);
      await tx
        .update(staffChallenges)
        .set(ok ? { attempts: c.attempts + 1, consumedAt: new Date(this.now()) } : { attempts: c.attempts + 1 })
        .where(eq(staffChallenges.id, c.id));
      if (!ok) return null;
      const [s] = await tx
        .select({ id: platformStaff.id, confirmed: platformStaff.mfaConfirmedAt, disabled: platformStaff.disabledAt })
        .from(platformStaff)
        .where(eq(platformStaff.id, c.staffId));
      if (!s || s.disabled) return null;
      const token = randomBytes(32).toString("base64url");
      await tx.insert(staffSessions).values({
        staffId: s.id,
        tokenHash: hashStaffToken(token),
        expiresAt: new Date(this.now() + SESSION_TTL_MS),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      });
      await consoleAudit(tx, { staffId: s.id, action: "console.login", ...(meta.ip ? { ip: meta.ip } : {}) });
      return {
        token,
        expiresAt: new Date(this.now() + SESSION_TTL_MS),
        mfa: s.confirmed ? ("required" as const) : ("setup_required" as const),
      };
    });
  }

  /** Session valide (non expirée, non révoquée, compte actif) ; mfa indique ce qu'il reste à faire. */
  async authenticate(token: string): Promise<StaffContext | null> {
    if (!token || token.length > 200) return null;
    return withConsole(async (tx) => {
      const [r] = await tx
        .select({
          sessionId: staffSessions.id,
          expiresAt: staffSessions.expiresAt,
          revokedAt: staffSessions.revokedAt,
          verifiedAt: staffSessions.mfaVerifiedAt,
          staffId: platformStaff.id,
          email: platformStaff.email,
          name: platformStaff.name,
          role: platformStaff.role,
          confirmed: platformStaff.mfaConfirmedAt,
          disabled: platformStaff.disabledAt,
        })
        .from(staffSessions)
        .innerJoin(platformStaff, eq(platformStaff.id, staffSessions.staffId))
        .where(eq(staffSessions.tokenHash, hashStaffToken(token)));
      if (!r || r.revokedAt || r.disabled || r.expiresAt.getTime() <= this.now()) return null;
      await tx
        .update(staffSessions)
        .set({ lastSeenAt: new Date(this.now()) })
        .where(eq(staffSessions.id, r.sessionId));
      return {
        staffId: r.staffId,
        sessionId: r.sessionId,
        email: r.email,
        name: r.name,
        role: r.role as StaffRole,
        mfa: r.verifiedAt ? "none" : r.confirmed ? "required" : "setup_required",
      };
    });
  }

  /** Premier passage : secret TOTP enregistré (enveloppé), à confirmer par un premier code. */
  async setupMfa(ctx: StaffContext) {
    if (ctx.mfa !== "setup_required") return null;
    const secret = generateTotpSecret();
    await withConsole(async (tx) => {
      await tx
        .update(platformStaff)
        .set({
          mfaSecret: await this.d.keys.wrap(Buffer.concat([Buffer.from(MFA_AAD), secret])),
          updatedAt: new Date(),
        })
        .where(eq(platformStaff.id, ctx.staffId));
    });
    return { secret: base32Encode(secret), uri: otpauthUri(secret, "civora console", ctx.email) };
  }

  private async secretOf(tx: Tx, staffId: string) {
    const [s] = await tx
      .select({ secret: platformStaff.mfaSecret, last: platformStaff.mfaLastStep })
      .from(platformStaff)
      .where(eq(platformStaff.id, staffId));
    if (!s?.secret) return null;
    const raw = await this.d.keys.unwrap(s.secret);
    const prefix = Buffer.from(MFA_AAD);
    if (!raw.subarray(0, prefix.length).equals(prefix)) return null;
    return { secret: raw.subarray(prefix.length), last: s.last };
  }

  /** Code de l'application : confirme le secret au premier passage, puis complète la session. */
  async verifyMfa(ctx: StaffContext, code: string, ip?: string): Promise<boolean> {
    return withConsole(async (tx) => {
      const s = await this.secretOf(tx, ctx.staffId);
      if (!s) return false;
      const step = verifyTotp(s.secret, code, s.last, this.now());
      if (step === null) return false;
      await tx
        .update(platformStaff)
        .set({
          mfaLastStep: step,
          ...(ctx.mfa === "setup_required" ? { mfaConfirmedAt: new Date(this.now()) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(platformStaff.id, ctx.staffId));
      await tx
        .update(staffSessions)
        .set({ mfaVerifiedAt: new Date(this.now()) })
        .where(eq(staffSessions.id, ctx.sessionId));
      await consoleAudit(tx, {
        staffId: ctx.staffId,
        action: ctx.mfa === "setup_required" ? "console.mfa.enabled" : "console.mfa.verified",
        ...(ip ? { ip } : {}),
      });
      return true;
    });
  }

  async logout(ctx: StaffContext) {
    await withConsole((tx) =>
      tx
        .update(staffSessions)
        .set({ revokedAt: new Date(this.now()) })
        .where(eq(staffSessions.id, ctx.sessionId)),
    );
  }
}
