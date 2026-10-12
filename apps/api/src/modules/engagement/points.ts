// GAM-01, GAM-09 : barème des points et journal. Chaque gain est une ligne du journal, jamais modifiée ; une même
// action ne rapporte qu'une fois (contrainte point_entries_once). Hors formule (gamification), rien n'est inscrit.
import { randomInt } from "node:crypto";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { members, parties, pointEntries, referrals, type Tx } from "@civora/db";
import { hasFeature, type Tier } from "@civora/shared";

export const POINT_ACTIONS = ["referral", "training", "vote", "dues", "attendance"] as const;
export type PointAction = (typeof POINT_ACTIONS)[number];

/** Barème par défaut : le parti le modifie dans ses réglages. */
export const DEFAULT_SCALE: Record<PointAction, number> = {
  referral: 50,
  training: 30,
  vote: 10,
  dues: 20,
  attendance: 15,
};

export async function partyEngagement(tx: Tx) {
  const [p] = await tx
    .select({
      tier: parties.tier,
      scale: parties.pointsScale,
      referral: parties.referralSettings,
      admissionMode: parties.admissionMode,
    })
    .from(parties);
  const scale = { ...DEFAULT_SCALE, ...((p?.scale as Partial<Record<PointAction, number>> | null) ?? {}) };
  return {
    points: !!p && hasFeature(p.tier as Tier, "gamification"),
    scale,
    // Parrainage actif : réglé par le parti, toujours actif si l'adhésion se fait par parrainage (ADH-04).
    referral: p?.admissionMode === "parrainage" || (p?.referral as { enabled?: boolean } | null)?.enabled === true,
  };
}

/** Inscrit les points d'une action au barème, une seule fois par référence. Sans effet hors formule. */
export async function awardPoints(
  tx: Tx,
  partyId: string,
  memberId: string,
  action: PointAction,
  referenceId: string,
): Promise<void> {
  const e = await partyEngagement(tx);
  const points = e.scale[action];
  if (!e.points || !points) return;
  await tx
    .insert(pointEntries)
    .values({ partyId, memberId, action, points, referenceId })
    .onConflictDoNothing({
      target: [pointEntries.partyId, pointEntries.memberId, pointEntries.action, pointEntries.referenceId],
    });
}

// ---------- Codes de parrainage (ENG-01) ----------

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** « FARA-7K3Q » : quatre lettres du prénom (sans accent), puis quatre signes tirés au hasard. */
export function referralCodeFor(firstName: string): string {
  const letters = firstName
    .normalize("NFD")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, "X");
  const tail = Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${letters}-${tail}`;
}

/** Code du membre validé, créé au besoin (unique dans le parti ; nouveau tirage en cas de collision). */
export async function ensureReferralCode(tx: Tx, memberId: string): Promise<string | null> {
  const [m] = await tx
    .select({ code: members.referralCode, first: members.firstName, state: members.applicationState })
    .from(members)
    .where(and(eq(members.id, memberId), isNull(members.deletedAt)));
  if (!m || m.state !== "approved") return null;
  if (m.code) return m.code;
  for (let i = 0; i < 5; i++) {
    const code = referralCodeFor(m.first);
    const [taken] = await tx.select({ id: members.id }).from(members).where(eq(members.referralCode, code));
    if (taken) continue;
    await tx.update(members).set({ referralCode: code, updatedAt: new Date() }).where(eq(members.id, memberId));
    return code;
  }
  return null;
}

/** À l'activation du parrainage : un code pour chaque membre validé qui n'en a pas. */
export async function backfillReferralCodes(tx: Tx): Promise<number> {
  const rows = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.applicationState, "approved"), isNull(members.deletedAt), isNull(members.referralCode)));
  for (const r of rows) await ensureReferralCode(tx, r.id);
  return rows.length;
}

/** Parrain désigné par son code (membre validé du même parti), ou null. */
export async function sponsorByCode(tx: Tx, code: string) {
  const [m] = await tx
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.referralCode, code.trim().toUpperCase()),
        eq(members.applicationState, "approved"),
        isNull(members.deletedAt),
        isNotNull(members.referralCode),
      ),
    );
  return m ?? null;
}

/** Membre validé : son code de parrainage si le parti parraine, et les points de son parrain (ENG-01, GAM-01). */
export async function onApproved(tx: Tx, partyId: string, memberId: string): Promise<void> {
  const e = await partyEngagement(tx);
  if (e.referral) await ensureReferralCode(tx, memberId);
  const [r] = await tx
    .select({ sponsor: referrals.sponsorMemberId })
    .from(referrals)
    .where(eq(referrals.referredMemberId, memberId));
  if (r) await awardPoints(tx, partyId, r.sponsor, "referral", memberId);
}
