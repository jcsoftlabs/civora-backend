// SOC-01, SOC-03 : création d'un espace parti en libre-service, identité visuelle (marque blanche).
import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  files,
  memberStatuses,
  members,
  organs,
  otpChallenges,
  parties,
  postHolders,
  posts,
  subscriptions,
  users,
  withAuthLookup,
  withParty,
  zones,
} from "@civora/db";
import { PERMISSIONS, PLANS, POST_TEMPLATES, TIERS } from "@civora/shared";
import { audit } from "../../lib/audit.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize } from "../../plugins/tenant.js";
import { normalizeEmail, type AuthService } from "../auth/service.js";
import type { FilesService } from "../files/service.js";

/** Sous-domaines réservés à la plateforme : jamais attribués à un parti. */
export const RESERVED_SLUGS = new Set([
  "www",
  "api",
  "app",
  "admin",
  "console",
  "civora",
  "mail",
  "smtp",
  "static",
  "assets",
  "cdn",
  "docs",
  "help",
  "aide",
  "support",
  "status",
  "blog",
  "auth",
  "login",
  "join",
  "demo",
  "test",
  "dev",
  "staging",
  "billing",
]);
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const PENDING_TTL_MS = 24 * 3600_000;
const TRIAL_DAYS = 30;
const LANGS = ["fr", "ht", "en", "es"] as const;

export const slugSchema = z.string().regex(SLUG, "adresse invalide");
const name = z.string().trim().min(1).max(80);
export const brandColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "couleur #RRGGBB");

export const signupStart = z.object({
  party: z.object({
    name: z.string().trim().min(2).max(120),
    slug: slugSchema,
    brandColor: brandColor.default("#0F6E66"),
    brandColorSecondary: brandColor.nullable().optional(),
    /** Langues des contenus du parti ; par défaut français puis créole, dans la limite du palier. */
    languages: z.array(z.enum(LANGS)).min(1).max(4).optional(),
    tier: z.enum(TIERS as [string, ...string[]]).default("essentiel"),
  }),
  founder: z.object({
    email: z.string().email().max(254),
    firstName: name,
    lastName: name,
    /** Section communale ou ville de la diaspora du fondateur (ADH-02). */
    zoneCode: z.string().regex(/^[A-Z0-9-]{2,20}$/),
    locale: z.enum(["fr", "ht"]).default("fr"),
  }),
});
export const signupComplete = z.object({
  signupId: z.string().uuid(),
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
});
export const brandingUpdate = z
  .object({
    name: z.string().trim().min(2).max(120),
    brandColor,
    brandColorSecondary: brandColor.nullable(),
    languages: z.array(z.enum(LANGS)).min(1).max(4),
    logoFileId: z.string().uuid().nullable(),
  })
  .partial();

interface Draft {
  firstName: string;
  lastName: string;
  zoneCode: string;
  email: string;
  userId: string;
}

export class PartiesService {
  constructor(
    private readonly auth: AuthService,
    private readonly files: FilesService,
  ) {}

  /** Espace existant pour ce slug, quel que soit son état. */
  private async bySlug(slug: string) {
    const [p] = await withAuthLookup({ partySlug: slug }, (tx) =>
      tx.select({ id: parties.id, status: parties.status, createdAt: parties.createdAt }).from(parties),
    );
    return p ?? null;
  }

  /** Disponibilité d'une adresse : réservée, prise, ou libre (une création abandonnée depuis 24 h la libère). */
  async slugAvailability(slug: string): Promise<{ available: boolean; reason?: "reserved" | "taken" | "invalid" }> {
    if (!SLUG.test(slug)) return { available: false, reason: "invalid" };
    if (RESERVED_SLUGS.has(slug)) return { available: false, reason: "reserved" };
    const p = await this.bySlug(slug);
    if (!p) return { available: true };
    if (p.status === "pending" && Date.now() - p.createdAt.getTime() > PENDING_TTL_MS) return { available: true };
    return { available: false, reason: "taken" };
  }

  /** Supprime une création abandonnée (en attente depuis plus de 24 h) pour libérer son adresse. */
  private async reclaim(slug: string) {
    const p = await this.bySlug(slug);
    if (!p || p.status !== "pending" || Date.now() - p.createdAt.getTime() <= PENDING_TTL_MS) return;
    await withParty(p.id, async (tx) => {
      await tx.delete(otpChallenges);
      await tx.delete(parties).where(eq(parties.id, p.id));
    });
  }

  /** Étape 1 : réserve l'adresse, met l'espace en attente et envoie un code au fondateur. */
  async start(body: z.infer<typeof signupStart>, ip?: string) {
    const availability = await this.slugAvailability(body.party.slug);
    if (!availability.available) throw new ApiError(409, `slug_${availability.reason}`);
    await this.reclaim(body.party.slug);
    const tier = body.party.tier as (typeof TIERS)[number];
    const languages = body.party.languages ?? (["fr", "ht"] as const).slice(0, PLANS[tier].quotas.siteLanguages);
    if (languages.length > PLANS[tier].quotas.siteLanguages) {
      throw Object.assign(new ApiError(402, "quota_site_languages"), {
        requiredTier: TIERS.find((t) => PLANS[t].quotas.siteLanguages >= languages.length),
      });
    }

    const partyId = randomUUID();
    const email = normalizeEmail(body.founder.email);
    const issued = await withParty(partyId, async (tx) => {
      const [zone] = await tx.select({ level: zones.level }).from(zones).where(eq(zones.code, body.founder.zoneCode));
      if (!zone || !["section_communale", "diaspora_pays", "diaspora_ville"].includes(zone.level))
        throw new ApiError(400, "zone_too_broad");
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
      const user =
        existing ??
        (await tx.insert(users).values({ email, locale: body.founder.locale }).returning({ id: users.id }))[0]!;
      const draft: Draft = {
        firstName: body.founder.firstName,
        lastName: body.founder.lastName,
        zoneCode: body.founder.zoneCode,
        email,
        userId: user.id,
      };
      try {
        await tx.insert(parties).values({
          id: partyId,
          slug: body.party.slug,
          name: body.party.name,
          brandColor: body.party.brandColor.toUpperCase(),
          brandColorSecondary: body.party.brandColorSecondary?.toUpperCase() ?? null,
          languages: [...languages],
          tier,
          status: "pending",
          signupDraft: draft,
        });
      } catch (e) {
        if ((e as { cause?: { code?: string } }).cause?.code === "23505") throw new ApiError(409, "slug_taken");
        throw e;
      }
      return this.auth.issueChallenge(tx, { partyId, userId: user.id, channel: "email", purpose: "party_signup", ip });
    });
    if (!issued) throw new ApiError(429, "rate_limited");
    await this.auth.deliverCode(
      { email, phone: null, locale: body.founder.locale },
      "email",
      body.party.name,
      issued.code,
      "party_signup",
    );
    return { signupId: partyId, challengeId: issued.challengeId };
  }

  /**
   * Étape 2 : code juste, l'espace s'ouvre avec son fondateur (membre 000001), le bureau national et le poste
   * de président (toutes les permissions), les autres postes types vides, un premier statut, 30 jours d'essai.
   */
  async complete(body: z.infer<typeof signupComplete>, meta: { ip?: string; userAgent?: string }) {
    const outcome = await withParty(body.signupId, async (tx) => {
      const [party] = await tx.select().from(parties).where(eq(parties.id, body.signupId));
      if (!party || party.status !== "pending") return { error: new ApiError(401, "otp_invalid") };
      const c = await this.auth.consumeChallenge(tx, {
        partyId: party.id,
        challengeId: body.challengeId,
        code: body.code,
        purpose: "party_signup",
        ip: meta.ip,
      });
      if (!c) return { error: new ApiError(401, "otp_invalid") };
      try {
        return await tx.transaction(async (sp) => ({ ok: await this.activate(sp, party, c.userId, meta) }));
      } catch (e) {
        await this.auth.releaseChallenge(tx, body.challengeId);
        // Le fondateur adhère déjà à un autre parti : un compte n'adhère qu'à un seul parti.
        if ((e as { cause?: { code?: string } }).cause?.code === "23505")
          return { error: new ApiError(409, "already_member_elsewhere") };
        throw e;
      }
    });
    if ("error" in outcome) throw outcome.error;
    return outcome.ok;
  }

  private async activate(
    tx: Parameters<Parameters<typeof withParty>[1]>[0],
    party: typeof parties.$inferSelect,
    userId: string,
    meta: { ip?: string; userAgent?: string },
  ) {
    const draft = party.signupDraft as Draft;
    if (draft.userId !== userId) throw new ApiError(401, "otp_invalid");
    const [zone] = await tx
      .select({ id: zones.id, code: zones.code })
      .from(zones)
      .where(eq(zones.code, draft.zoneCode));
    const now = new Date();
    const [status] = await tx
      .insert(memberStatuses)
      .values({ partyId: party.id, label: { fr: "Membre", ht: "Manm" }, rank: 0 })
      .returning({ id: memberStatuses.id });
    const [founder] = await tx
      .insert(members)
      .values({
        partyId: party.id,
        userId,
        memberNumber: "000001",
        firstName: draft.firstName,
        lastName: draft.lastName,
        zoneId: zone!.id,
        isDiaspora: zone!.code.startsWith("DIA"),
        residenceCountry: zone!.code.startsWith("DIA") ? (zone!.code.split("-")[1] ?? null) : "HT",
        statusId: status!.id,
        applicationState: "approved",
        joinedAt: now,
      })
      .returning({ id: members.id });
    const [bureau] = await tx
      .insert(organs)
      .values({ partyId: party.id, name: "Bureau national", kind: "bureau" })
      .returning({ id: organs.id });
    // Postes types (permissions.ts) : le président a tout, les autres attendent leur titulaire.
    for (const [title, permissions] of Object.entries(POST_TEMPLATES)) {
      const [post] = await tx
        .insert(posts)
        .values({
          partyId: party.id,
          organId: bureau!.id,
          title,
          permissions: title.startsWith("Président") ? [...PERMISSIONS] : permissions,
        })
        .returning({ id: posts.id });
      if (title.startsWith("Président")) {
        await tx
          .insert(postHolders)
          .values({ partyId: party.id, postId: post!.id, memberId: founder!.id, startsAt: now });
      }
    }
    await tx.insert(subscriptions).values({
      partyId: party.id,
      tier: party.tier,
      status: "trial",
      currentPeriodEnd: new Date(now.getTime() + TRIAL_DAYS * 86_400_000),
    });
    await tx
      .update(parties)
      .set({ status: "active", activatedAt: now, signupDraft: null, updatedAt: now })
      .where(eq(parties.id, party.id));
    await audit(tx, {
      partyId: party.id,
      actorUserId: userId,
      actorKind: "member",
      action: "party.create",
      targetType: "party",
      targetId: party.id,
      metadata: { slug: party.slug, tier: party.tier },
      ...(meta.ip ? { ip: meta.ip } : {}),
    });
    const session = await this.auth.openSession(tx, {
      partyId: party.id,
      userId,
      memberId: founder!.id,
      channel: "email",
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { slug: party.slug, token: session.token, expiresAt: session.expiresAt, mfa: session.mfa };
  }

  /**
   * Identité publique d'un espace (SOC-03) : écran d'adhésion, site du parti, thème de l'application.
   * Logo par URL signée d'une heure.
   */
  async publicProfile(slug: string) {
    const [p] = await withAuthLookup({ partySlug: slug }, (tx) =>
      tx
        .select({
          id: parties.id,
          name: parties.name,
          slug: parties.slug,
          brandColor: parties.brandColor,
          brandColorSecondary: parties.brandColorSecondary,
          languages: parties.languages,
          admissionMode: parties.admissionMode,
          otpChannels: parties.otpChannels,
          status: parties.status,
          logoFileId: parties.logoFileId,
        })
        .from(parties),
    );
    if (!p || p.status !== "active") throw new ApiError(404, "not_found");
    let logoUrl: string | null = null;
    if (p.logoFileId) {
      const [logo] = await withParty(p.id, (tx) =>
        tx.select({ key: files.r2Key, name: files.name }).from(files).where(eq(files.id, p.logoFileId!)),
      );
      if (logo) logoUrl = await this.files.storage.presignDownload(logo.key, 3600, logo.name);
    }
    const { id: _id, status: _s, logoFileId: _l, ...rest } = p;
    return { ...rest, logoUrl };
  }

  /** Identité visuelle et langues, modifiables par le national (settings.party, audité). */
  async updateBranding(req: FastifyRequest, body: z.infer<typeof brandingUpdate>) {
    if (!authorize(req, "settings.party")) throw new ApiError(403, "forbidden");
    const e = req.partyEntitlements ?? (await req.server.entitlements.get(req.partyId));
    if (body.languages && e && body.languages.length > PLANS[e.tier].quotas.siteLanguages) {
      throw Object.assign(new ApiError(402, "quota_site_languages"), {
        requiredTier: TIERS.find((t) => PLANS[t].quotas.siteLanguages >= body.languages!.length),
      });
    }
    await withParty(req.partyId, async (tx) => {
      if (body.logoFileId) await this.files.readyFile(tx, body.logoFileId, "party_logo");
      await tx
        .update(parties)
        .set({
          ...(body.name ? { name: body.name } : {}),
          ...(body.brandColor ? { brandColor: body.brandColor.toUpperCase() } : {}),
          ...(body.brandColorSecondary !== undefined
            ? { brandColorSecondary: body.brandColorSecondary?.toUpperCase() ?? null }
            : {}),
          ...(body.languages ? { languages: body.languages } : {}),
          ...(body.logoFileId !== undefined ? { logoFileId: body.logoFileId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(parties.id, req.partyId));
      await audit(tx, {
        partyId: req.partyId,
        actorUserId: req.auth?.userId ?? null,
        actorKind: "member",
        action: "settings.branding",
        targetType: "party",
        targetId: req.partyId,
        metadata: { fields: Object.keys(body) },
        ip: req.ip,
      });
    });
  }
}
