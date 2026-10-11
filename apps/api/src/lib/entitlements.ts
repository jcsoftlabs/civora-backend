import { desc, eq, sql } from "drizzle-orm";
import { parties, subscriptions, withParty } from "@civora/db";
import type { Entitlements } from "@civora/shared";

export type EntitlementsLoader = (partyId: string) => Promise<Entitlements | null>;

/**
 * Droits du parti lus en base (SOC-07) : parties porte le palier courant et l'option Élections ;
 * le dernier abonnement porte les options facturées et l'état de suspension.
 */
export const fetchEntitlements: EntitlementsLoader = (partyId) =>
  withParty(partyId, async (tx) => {
    const [party] = await tx
      .select({ tier: parties.tier, electionsModuleUntil: parties.electionsModuleUntil })
      .from(parties)
      .where(eq(parties.id, partyId));
    if (!party) return null;
    const [sub] = await tx
      .select({
        status: subscriptions.status,
        biConnectorOption: subscriptions.biConnectorOption,
        extraStoragePacks: subscriptions.extraStoragePacks,
      })
      .from(subscriptions)
      .orderBy(desc(subscriptions.createdAt), sql`${subscriptions.id}`)
      .limit(1);
    return {
      tier: party.tier,
      electionsModuleUntil: party.electionsModuleUntil,
      biConnectorOption: sub?.biConnectorOption ?? false,
      extraStoragePacks: sub?.extraStoragePacks ?? 0,
      suspended: sub?.status === "suspended",
    };
  });

/**
 * Cache court par parti : un changement de palier s'applique au plus tard après `ttlMs`,
 * immédiatement si le code qui le modifie appelle invalidate() (facturation, console éditeur).
 */
export class EntitlementsCache {
  private readonly entries = new Map<string, { value: Entitlements | null; expires: number }>();

  constructor(
    private readonly load: EntitlementsLoader,
    private readonly ttlMs = 30_000,
    private readonly now = () => Date.now(),
  ) {}

  async get(partyId: string): Promise<Entitlements | null> {
    const hit = this.entries.get(partyId);
    if (hit && hit.expires > this.now()) return hit.value;
    const value = await this.load(partyId);
    this.entries.set(partyId, { value, expires: this.now() + this.ttlMs });
    return value;
  }

  invalidate(partyId: string): void {
    this.entries.delete(partyId);
  }
}
