import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Chiffrement enveloppe (SEC-02, architecture §4).
 * - Clé maîtresse : chez le KeyProvider (KMS en production, variable d'environnement en local).
 * - Clé de données par parti (DEK) : 32 octets aléatoires, stockés uniquement chiffrés par la clé maîtresse.
 * - Champ : AES-256-GCM avec IV aléatoire et données associées (AAD) qui lient le chiffré à sa ligne.
 */

const ALG = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const FORMAT_V1 = 1;

/** Fournisseur de la clé maîtresse : seul composant qui voit la clé ; remplaçable par un KMS managé. */
export interface KeyProvider {
  wrap(dek: Buffer): Promise<Buffer>;
  unwrap(wrapped: Buffer): Promise<Buffer>;
}

/** Chiffre `plaintext` : [format 1 octet][IV 12][tag 16][chiffré]. */
export function seal(key: Buffer, plaintext: Buffer, aad: Buffer): Buffer {
  if (key.length !== 32) throw new Error("clé de 32 octets attendue");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALG, key, iv);
  cipher.setAAD(aad);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.from([FORMAT_V1]), iv, cipher.getAuthTag(), body]);
}

/** Déchiffre et authentifie ; lève une erreur si la clé, l'AAD ou le chiffré ne correspondent pas. */
export function open(key: Buffer, sealed: Buffer, aad: Buffer): Buffer {
  if (sealed[0] !== FORMAT_V1 || sealed.length < 1 + IV_BYTES + TAG_BYTES) throw new Error("chiffré invalide");
  const iv = sealed.subarray(1, 1 + IV_BYTES);
  const tag = sealed.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed.subarray(1 + IV_BYTES + TAG_BYTES)), decipher.final()]);
}

/** Sous-clé dérivée de la DEK pour un usage donné (séparation des clés : chiffrement et empreintes). */
export function deriveKey(dek: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", dek, Buffer.alloc(0), `civora:${purpose}`, 32));
}

export function hmacHex(key: Buffer, value: string): string {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Clé maîtresse locale, lue dans l'environnement (développement, CI, petite production sans KMS).
 * Trousseau versionné pour la rotation : KMS_MASTER_KEY (courante) et KMS_MASTER_KEY_PREVIOUS (ancienne, lecture seule).
 * Format de la clé enveloppée : [identifiant de clé 1 octet][chiffré].
 */
export class LocalKeyProvider implements KeyProvider {
  private static readonly AAD = Buffer.from("civora:party-dek");
  private readonly current: { id: number; key: Buffer };
  private readonly ring = new Map<number, Buffer>();

  constructor(keys: Array<{ id: number; base64: string }>) {
    if (!keys.length) throw new Error("clé maîtresse absente");
    for (const k of keys) {
      const key = Buffer.from(k.base64, "base64");
      if (key.length !== 32) throw new Error(`clé maîtresse ${k.id} : 32 octets en base64 attendus`);
      if (k.id < 1 || k.id > 255) throw new Error("identifiant de clé maîtresse entre 1 et 255");
      this.ring.set(k.id, key);
    }
    const first = keys[0]!;
    this.current = { id: first.id, key: this.ring.get(first.id)! };
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): LocalKeyProvider {
    const keys = [{ id: Number(env.KMS_MASTER_KEY_ID ?? 1), base64: env.KMS_MASTER_KEY ?? "" }];
    if (env.KMS_MASTER_KEY_PREVIOUS) {
      keys.push({ id: Number(env.KMS_MASTER_KEY_PREVIOUS_ID ?? keys[0]!.id - 1), base64: env.KMS_MASTER_KEY_PREVIOUS });
    }
    return new LocalKeyProvider(keys);
  }

  async wrap(dek: Buffer): Promise<Buffer> {
    return Buffer.concat([Buffer.from([this.current.id]), seal(this.current.key, dek, LocalKeyProvider.AAD)]);
  }

  async unwrap(wrapped: Buffer): Promise<Buffer> {
    const key = this.ring.get(wrapped[0] ?? 0);
    if (!key) throw new Error("clé maîtresse inconnue pour cette clé de parti");
    return open(key, wrapped.subarray(1), LocalKeyProvider.AAD);
  }
}
