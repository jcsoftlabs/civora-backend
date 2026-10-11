import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { partyKeys, type Tx } from "@civora/db";
import type { KeyProvider } from "./crypto.js";

export interface PartyKey {
  version: number;
  dek: Buffer;
}

/**
 * Clés de données des partis. Toujours appelé dans withParty : la RLS limite party_keys au parti courant.
 * Les clés déchiffrées restent quelques minutes en mémoire pour éviter un appel au KMS par champ.
 */
export class PartyKeys {
  private readonly cache = new Map<string, { key: PartyKey; expires: number }>();

  constructor(
    private readonly provider: KeyProvider,
    private readonly ttlMs = 5 * 60_000,
  ) {}

  /** Clé active du parti, créée au premier usage. */
  async active(tx: Tx, partyId: string): Promise<PartyKey> {
    const [row] = await tx
      .select({ version: partyKeys.version })
      .from(partyKeys)
      .where(and(eq(partyKeys.partyId, partyId), eq(partyKeys.active, true)))
      .orderBy(desc(partyKeys.version))
      .limit(1);
    if (row) return this.byVersion(tx, partyId, row.version);
    return this.create(tx, partyId, 1);
  }

  /** Clé d'une version donnée (lecture des données chiffrées avant une rotation). */
  async byVersion(tx: Tx, partyId: string, version: number): Promise<PartyKey> {
    const cacheKey = `${partyId}:${version}`;
    const hit = this.cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.key;
    const [row] = await tx
      .select({ wrappedKey: partyKeys.wrappedKey })
      .from(partyKeys)
      .where(and(eq(partyKeys.partyId, partyId), eq(partyKeys.version, version)));
    if (!row) throw new Error("clé de parti introuvable");
    const key = { version, dek: await this.provider.unwrap(row.wrappedKey) };
    this.cache.set(cacheKey, { key, expires: Date.now() + this.ttlMs });
    return key;
  }

  /** Versions existantes : la recherche de doublons calcule une empreinte par version. */
  async versions(tx: Tx, partyId: string): Promise<number[]> {
    const rows = await tx.select({ version: partyKeys.version }).from(partyKeys).where(eq(partyKeys.partyId, partyId));
    return rows.map((r) => r.version);
  }

  /** Rotation : nouvelle clé active ; les anciennes restent lisibles jusqu'au rechiffrement. */
  async rotate(tx: Tx, partyId: string): Promise<PartyKey> {
    const versions = await this.versions(tx, partyId);
    await tx.update(partyKeys).set({ active: false, updatedAt: new Date() }).where(eq(partyKeys.partyId, partyId));
    return this.create(tx, partyId, Math.max(0, ...versions) + 1);
  }

  /** Création sûre en concurrence : si une autre requête a créé la même version, on relit la sienne. */
  private async create(tx: Tx, partyId: string, version: number): Promise<PartyKey> {
    const dek = randomBytes(32);
    const inserted = await tx
      .insert(partyKeys)
      .values({ partyId, version, active: true, wrappedKey: await this.provider.wrap(dek) })
      .onConflictDoNothing({ target: [partyKeys.partyId, partyKeys.version] })
      .returning({ version: partyKeys.version });
    if (!inserted.length) return this.byVersion(tx, partyId, version);
    const key = { version, dek };
    this.cache.set(`${partyId}:${version}`, { key, expires: Date.now() + this.ttlMs });
    return key;
  }
}
