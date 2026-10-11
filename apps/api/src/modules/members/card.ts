// ADH-11 : carte de membre numérique avec QR code vérifiable. Le QR porte un lien signé avec la clé du parti :
// impossible à fabriquer ou à modifier. Il ne contient aucune donnée personnelle : tout est relu au scan.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { and, eq, isNull, sql } from "drizzle-orm";
import { files, members, parties, withParty, zones, type Tx } from "@civora/db";
import { deriveKey } from "../../lib/crypto.js";
import type { PartyKeys } from "../../lib/party-keys.js";
import type { ObjectStorage } from "../../lib/storage/types.js";
import { today } from "../../lib/today.js";
import { ApiError } from "../../plugins/errors.js";
import type { AuthService } from "../auth/service.js";

const FORMAT = 1;
const SIG_BYTES = 16;
const UUID_HEX = /^([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})$/i;

function uuidBytes(id: string): Buffer {
  const m = UUID_HEX.exec(id);
  if (!m) throw new Error("uuid invalide");
  return Buffer.from(m.slice(1).join(""), "hex");
}
function bytesUuid(b: Buffer): string {
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Jeton : [format][version de clé][identifiant du membre, 16 octets] + signature HMAC tronquée à 16 octets. */
export function signCardToken(dek: Buffer, keyVersion: number, memberId: string): string {
  const payload = Buffer.concat([Buffer.from([FORMAT, keyVersion]), uuidBytes(memberId)]);
  const sig = createHmac("sha256", deriveKey(dek, "member-card")).update(payload).digest().subarray(0, SIG_BYTES);
  return Buffer.concat([payload, sig]).toString("base64url");
}

export function parseCardToken(
  token: string,
): { keyVersion: number; memberId: string; payload: Buffer; sig: Buffer } | null {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const raw = Buffer.from(token, "base64url");
  // Encodage canonique exigé : les bits de remplissage du dernier caractère ne doivent pas permettre deux écritures
  // d'un même jeton.
  if (raw.toString("base64url") !== token) return null;
  if (raw.length !== 2 + 16 + SIG_BYTES || raw[0] !== FORMAT) return null;
  return {
    keyVersion: raw[1]!,
    memberId: bytesUuid(raw.subarray(2, 18)),
    payload: raw.subarray(0, 18),
    sig: raw.subarray(18),
  };
}

export class MemberCardService {
  constructor(
    private readonly keys: PartyKeys,
    private readonly auth: AuthService,
    private readonly storage: ObjectStorage,
    private readonly partyOrigin: string,
  ) {}

  /** Carte du membre connecté : données affichées et lien du QR. Adhésion validée exigée. */
  async myCard(req: FastifyRequest) {
    return withParty(req.partyId, async (tx) => {
      const [m] = await tx
        .select({
          id: members.id,
          number: members.memberNumber,
          firstName: members.firstName,
          lastName: members.lastName,
          state: members.applicationState,
          joinedAt: members.joinedAt,
          zoneName: zones.name,
        })
        .from(members)
        .innerJoin(zones, eq(zones.id, members.zoneId))
        .where(and(eq(members.id, req.memberId!), isNull(members.deletedAt)));
      if (!m) throw new ApiError(404, "not_found");
      if (m.state !== "approved") throw new ApiError(409, "card_requires_approval");
      const [p] = await tx
        .select({
          slug: parties.slug,
          name: parties.name,
          brandColor: parties.brandColor,
          brandColorSecondary: parties.brandColorSecondary,
        })
        .from(parties);
      const key = await this.keys.active(tx, req.partyId);
      const token = signCardToken(key.dek, key.version, m.id);
      return {
        party: p,
        member: {
          number: m.number,
          name: `${m.firstName} ${m.lastName}`,
          location: m.zoneName,
          since: m.joinedAt?.toISOString().slice(0, 4) ?? null,
        },
        verifyUrl: `${this.partyOrigin.replace("{slug}", p!.slug)}/v/${token}`,
      };
    });
  }

  /**
   * Vérification publique d'un QR (contrôle à l'entrée d'un rassemblement). Ne révèle que le nécessaire :
   * nom, numéro, validité, cotisations à jour, photo pour comparer. Toute carte invalide répond simplement non.
   */
  async verify(slug: string, token: string) {
    const invalid = { valid: false as const };
    const parsed = parseCardToken(token);
    if (!parsed) return invalid;
    const party = await this.auth.partyBySlug(slug);
    if (!party) return invalid;
    return withParty(party.id, async (tx) => {
      let dek: Buffer;
      try {
        dek = (await this.keys.byVersion(tx, party.id, parsed.keyVersion)).dek;
      } catch {
        return invalid;
      }
      const expected = createHmac("sha256", deriveKey(dek, "member-card"))
        .update(parsed.payload)
        .digest()
        .subarray(0, SIG_BYTES);
      if (!timingSafeEqual(expected, parsed.sig)) return invalid;
      const [m] = await tx
        .select({
          id: members.id,
          number: members.memberNumber,
          firstName: members.firstName,
          lastName: members.lastName,
          state: members.applicationState,
          photo: members.photoFileId,
        })
        .from(members)
        .where(and(eq(members.id, parsed.memberId), isNull(members.deletedAt)));
      if (!m || m.state !== "approved") return invalid;
      return {
        valid: true as const,
        party: party.name,
        member: { number: m.number, name: `${m.firstName} ${m.lastName}`, photoUrl: await this.photoUrl(tx, m.photo) },
        duesUpToDate: await this.upToDate(tx, m.id),
        checkedAt: new Date().toISOString(),
      };
    });
  }

  private async upToDate(tx: Tx, memberId: string) {
    const [late] = await tx.execute<{ late: boolean }>(sql`
      select exists (
        select 1 from dues_obligations o join dues_plans p on p.party_id = o.party_id and p.id = o.plan_id
        where o.member_id = ${memberId} and o.paid_at is null and o.due_date + p.grace_days < ${today()}::date
      ) as late`);
    return !late?.late;
  }

  private async photoUrl(tx: Tx, fileId: string | null) {
    if (!fileId) return null;
    const [f] = await tx
      .select({ key: files.r2Key, status: files.uploadStatus })
      .from(files)
      .where(eq(files.id, fileId));
    return f && f.status === "ready" ? this.storage.presignDownload(f.key, 120) : null;
  }
}
