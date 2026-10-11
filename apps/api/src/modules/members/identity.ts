// ADH-01, ADH-08, SEC-02 : pièces d'identité chiffrées au niveau du champ, doublons par empreinte, lecture auditée.
import { and, eq, inArray } from "drizzle-orm";
import { memberIdentities, members, zones, type Tx } from "@civora/db";
import type { FastifyRequest } from "fastify";
import { audit } from "../../lib/audit.js";
import { deriveKey, hmacHex, open, seal } from "../../lib/crypto.js";
import type { PartyKey, PartyKeys } from "../../lib/party-keys.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize } from "../../plugins/tenant.js";

export const IDENTITY_KINDS = ["nin", "nif", "passport", "ssn"] as const;
export type IdentityKind = (typeof IDENTITY_KINDS)[number];

/** Qui lit : permissions du poste, compte, adresse (pour l'audit). */
export interface Reader extends Pick<FastifyRequest, "grants"> {
  userId: string | null;
  ip?: string;
}

/**
 * Forme canonique d'un numéro : majuscules, sans espaces, points ni tirets.
 * « 003-456-789-0 » et « 0034567890 » donnent la même empreinte (doublons à l'import, ADH-08).
 */
export function normalizeIdentity(kind: IdentityKind, value: string): string {
  const v = value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s.\-/]/g, "");
  if (!/^[A-Z0-9]{4,32}$/.test(v)) throw new ApiError(400, "identity_invalid");
  if ((kind === "nin" || kind === "nif" || kind === "ssn") && !/^\d+$/.test(v))
    throw new ApiError(400, "identity_invalid");
  return v;
}

const aad = (partyId: string, memberId: string, kind: IdentityKind, version: number) =>
  Buffer.from(`identity|${partyId}|${memberId}|${kind}|v${version}`);

const fingerprint = (key: PartyKey, kind: IdentityKind, normalized: string) =>
  hmacHex(deriveKey(key.dek, "identity-hmac"), `${kind}:${normalized}`);

export class IdentityService {
  constructor(private readonly keys: PartyKeys) {}

  /** Enregistre une pièce : seul le chiffré et l'empreinte sont stockés. */
  async store(tx: Tx, partyId: string, memberId: string, kind: IdentityKind, value: string): Promise<{ id: string }> {
    const normalized = normalizeIdentity(kind, value);
    const key = await this.keys.active(tx, partyId);
    const [row] = await tx
      .insert(memberIdentities)
      .values({
        partyId,
        memberId,
        kind,
        valueEncrypted: seal(
          deriveKey(key.dek, "identity-enc"),
          Buffer.from(normalized),
          aad(partyId, memberId, kind, key.version),
        ),
        valueHmac: fingerprint(key, kind, normalized),
        keyVersion: key.version,
      })
      .returning({ id: memberIdentities.id });
    if (!row) throw new Error("insertion de la pièce impossible");
    return row;
  }

  /** Membres du parti qui portent déjà ce numéro, sans rien déchiffrer : une empreinte par version de clé. */
  async findDuplicates(tx: Tx, partyId: string, kind: IdentityKind, value: string): Promise<string[]> {
    const normalized = normalizeIdentity(kind, value);
    const versions = await this.keys.versions(tx, partyId);
    if (!versions.length) return [];
    const hmacs = await Promise.all(
      versions.map(async (v) => fingerprint(await this.keys.byVersion(tx, partyId, v), kind, normalized)),
    );
    const rows = await tx
      .selectDistinct({ memberId: memberIdentities.memberId })
      .from(memberIdentities)
      .where(and(eq(memberIdentities.kind, kind), inArray(memberIdentities.valueHmac, hmacs)));
    return rows.map((r) => r.memberId);
  }

  /**
   * Lecture déchiffrée : permission identity.read dans la zone du membre, et une ligne d'audit
   * dans la même transaction (si l'audit échoue, la lecture échoue aussi).
   */
  async read(
    tx: Tx,
    partyId: string,
    reader: Reader,
    identityId: string,
  ): Promise<{ kind: IdentityKind; value: string }> {
    const [row] = await tx
      .select({
        memberId: memberIdentities.memberId,
        kind: memberIdentities.kind,
        valueEncrypted: memberIdentities.valueEncrypted,
        keyVersion: memberIdentities.keyVersion,
        zonePath: zones.path,
      })
      .from(memberIdentities)
      .innerJoin(members, and(eq(members.partyId, memberIdentities.partyId), eq(members.id, memberIdentities.memberId)))
      .innerJoin(zones, eq(zones.id, members.zoneId))
      .where(eq(memberIdentities.id, identityId));
    if (!row) throw new ApiError(404, "not_found");
    if (!authorize(reader, "identity.read", row.zonePath)) throw new ApiError(403, "forbidden");

    const kind = row.kind as IdentityKind;
    const key = await this.keys.byVersion(tx, partyId, row.keyVersion);
    const value = open(
      deriveKey(key.dek, "identity-enc"),
      row.valueEncrypted,
      aad(partyId, row.memberId, kind, row.keyVersion),
    ).toString("utf8");

    await audit(tx, {
      partyId,
      actorUserId: reader.userId,
      actorKind: "member",
      action: "identity.read",
      targetType: "member_identity",
      targetId: identityId,
      metadata: { kind, memberId: row.memberId },
      ...(reader.ip ? { ip: reader.ip } : {}),
    });
    return { kind, value };
  }
}
