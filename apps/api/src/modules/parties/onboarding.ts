// SOC-09 : assistant de démarrage d'un nouvel espace. Chaque étape se déduit des données du parti (rien à cocher
// à la main) ; le responsable peut passer une étape ou masquer l'assistant. Réservé à settings.party.
import type { FastifyRequest } from "fastify";
import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  auditLog,
  cardTemplates,
  duesPlans,
  memberImports,
  members,
  merchantAccounts,
  organs,
  parties,
  postHolders,
  withParty,
} from "@civora/db";
import { can } from "@civora/shared";
import { audit } from "../../lib/audit.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize } from "../../plugins/tenant.js";

export const ONBOARDING_STEPS = ["identity", "admission", "dues", "organs", "members", "card", "invite"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const onboardingUpdate = z.union([
  z.object({ skip: z.enum(ONBOARDING_STEPS) }),
  z.object({ unskip: z.enum(ONBOARDING_STEPS) }),
  z.object({ dismiss: z.boolean() }),
]);

interface Stored {
  skipped?: string[];
  dismissedAt?: string | null;
}

const count = sql<number>`count(*)::int`;

export async function onboarding(req: FastifyRequest) {
  if (!authorize(req, "settings.party")) throw new ApiError(403, "forbidden");
  const e = req.partyEntitlements ?? (await req.server.entitlements.get(req.partyId));
  const withCard = !!e && can(e, "members.card");
  return withParty(req.partyId, async (tx) => {
    const [p] = await tx
      .select({ logo: parties.logoFileId, onboarding: parties.onboarding, createdAt: parties.createdAt })
      .from(parties);
    const done = async (actions: string[]) =>
      ((await tx.select({ n: count }).from(auditLog).where(inArray(auditLog.action, actions)))[0]?.n ?? 0) > 0;
    const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;

    const approved = and(eq(members.applicationState, "approved"), isNull(members.deletedAt));
    const [plans, merchants, organCount, holders, memberCount, imported, invited, card] = await Promise.all([
      n(tx.select({ n: count }).from(duesPlans)),
      n(tx.select({ n: count }).from(merchantAccounts)),
      n(tx.select({ n: count }).from(organs)),
      n(tx.select({ n: count }).from(postHolders).where(isNull(postHolders.endsAt))),
      n(tx.select({ n: count }).from(members).where(approved)),
      n(tx.select({ n: count }).from(memberImports).where(eq(memberImports.state, "done"))),
      n(tx.select({ n: count }).from(memberImports).where(isNotNull(memberImports.inviteRequestedAt))),
      n(tx.select({ n: count }).from(cardTemplates)),
    ]);
    // Membres qui se sont déjà connectés (compte relié), hors fondateur.
    const accounts = await n(
      tx
        .select({ n: count })
        .from(members)
        .where(and(approved, isNotNull(members.userId), ne(members.memberNumber, "000001"))),
    );

    const stored = (p?.onboarding as Stored | null) ?? {};
    const skipped = new Set(stored.skipped ?? []);
    const facts: Record<OnboardingStep, { done: boolean; detail?: Record<string, number | boolean> }> = {
      identity: { done: !!p?.logo || (await done(["settings.branding"])) },
      admission: { done: await done(["settings.admission"]) },
      dues: { done: plans > 0, detail: { plans, merchants } },
      // Le bureau national et le poste du fondateur sont créés avec l'espace : il faut un organe ou un titulaire de plus.
      organs: { done: organCount > 1 || holders > 1, detail: { organs: organCount, holders } },
      members: { done: memberCount > 1 || imported > 0, detail: { members: memberCount } },
      card: { done: card > 0 },
      invite: { done: invited > 0 || accounts > 0, detail: { invited: invited > 0 } },
    };
    const steps = ONBOARDING_STEPS.filter((k) => k !== "card" || withCard).map((key) => ({
      key,
      done: facts[key].done,
      skipped: !facts[key].done && skipped.has(key),
      ...(facts[key].detail ? { detail: facts[key].detail } : {}),
    }));
    const remaining = steps.filter((s) => !s.done && !s.skipped).length;
    return {
      steps,
      remaining,
      completed: remaining === 0,
      dismissed: !!stored.dismissedAt,
    };
  });
}

export async function updateOnboarding(req: FastifyRequest, input: z.infer<typeof onboardingUpdate>) {
  if (!authorize(req, "settings.party")) throw new ApiError(403, "forbidden");
  await withParty(req.partyId, async (tx) => {
    const [p] = await tx.select({ onboarding: parties.onboarding }).from(parties);
    const stored: Stored = { skipped: [], dismissedAt: null, ...((p?.onboarding as Stored | null) ?? {}) };
    const skipped = new Set(stored.skipped);
    if ("skip" in input) skipped.add(input.skip);
    if ("unskip" in input) skipped.delete(input.unskip);
    if ("dismiss" in input) stored.dismissedAt = input.dismiss ? new Date().toISOString() : null;
    await tx
      .update(parties)
      .set({ onboarding: { ...stored, skipped: [...skipped] }, updatedAt: new Date() })
      .where(eq(parties.id, req.partyId));
    await audit(tx, {
      partyId: req.partyId,
      actorUserId: req.auth?.userId ?? null,
      actorKind: "member",
      action: "settings.onboarding",
      targetType: "party",
      targetId: req.partyId,
      metadata: input,
      ip: req.clientIp,
    });
  });
}
