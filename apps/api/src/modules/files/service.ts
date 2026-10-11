// Stockage des fichiers (DOC-01, ADH-01, COM-01) : envoi direct au stockage par URL signée, vérification après
// envoi, lecture par URL signée de courte durée, réservée aux personnes autorisées. Jamais d'accès public.
import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { files, members, withParty, zones, type Tx } from "@civora/db";
import { audit } from "../../lib/audit.js";
import type { ObjectStorage } from "../../lib/storage/types.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize } from "../../plugins/tenant.js";

const MB = 1024 * 1024;
const IMAGES = ["image/jpeg", "image/png", "image/webp"];
const AUDIO = ["audio/mpeg", "audio/mp4", "audio/aac", "audio/x-m4a"];
const OFFICE = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

/** Types et tailles admis par usage ; la taille dépend du type (une image n'est pas un podcast). */
export const PURPOSES = {
  member_photo: { folder: "members", types: IMAGES, maxBytes: () => 5 * MB },
  publication_media: {
    folder: "publications",
    types: [...IMAGES, ...AUDIO],
    maxBytes: (t: string) => (AUDIO.includes(t) ? 100 * MB : 10 * MB),
  },
  document: { folder: "documents", types: [...OFFICE, ...IMAGES], maxBytes: () => 25 * MB },
  /** Logo du parti (SOC-03) : images matricielles seulement (pas de SVG, qui peut contenir du script). */
  party_logo: { folder: "branding", types: IMAGES, maxBytes: () => 2 * MB },
} as const;
export type Purpose = keyof typeof PURPOSES;

export const uploadRequest = z.object({
  purpose: z.enum(Object.keys(PURPOSES) as [Purpose, ...Purpose[]]),
  name: z.string().trim().min(1).max(200),
  mimeType: z.string().max(100),
  sizeBytes: z.number().int().positive(),
});

const UPLOAD_TTL_S = 15 * 60;
const DOWNLOAD_TTL_S = 5 * 60;
type Req = FastifyRequest;

export class FilesService {
  constructor(readonly storage: ObjectStorage) {}

  /** Étape 1 : vérifie le type, la taille et le droit d'envoyer, puis délivre une URL d'envoi de 15 minutes. */
  async requestUpload(req: Req, body: z.infer<typeof uploadRequest>) {
    const rule = PURPOSES[body.purpose];
    if (!(rule.types as readonly string[]).includes(body.mimeType)) throw new ApiError(400, "file_type_not_allowed");
    if (body.sizeBytes > rule.maxBytes(body.mimeType)) throw new ApiError(413, "file_too_large");
    if (body.purpose === "publication_media" && !req.grants.some((g) => g.permission === "publications.manage")) {
      throw new ApiError(403, "forbidden");
    }
    if (body.purpose === "document" && !req.grants.some((g) => g.permission === "documents.write"))
      throw new ApiError(403, "forbidden");

    const id = randomUUID();
    const r2Key = `party/${req.partyId}/${rule.folder}/${id}`;
    await withParty(req.partyId, (tx) =>
      tx.insert(files).values({
        id,
        partyId: req.partyId,
        r2Key,
        name: body.name,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        purpose: body.purpose,
        uploadedByMemberId: req.memberId,
      }),
    );
    const ticket = await this.storage.presignUpload(r2Key, body.mimeType, UPLOAD_TTL_S);
    return { fileId: id, upload: ticket };
  }

  /**
   * Étape 2 : l'application signale la fin de l'envoi. On vérifie l'objet dans le stockage (présent, même type,
   * même taille, dans la limite) ; sinon il est supprimé et le fichier refusé.
   */
  async complete(req: Req, fileId: string) {
    const f = await withParty(req.partyId, async (tx) => {
      const [row] = await tx.select().from(files).where(eq(files.id, fileId));
      if (!row || row.uploadedByMemberId !== req.memberId) throw new ApiError(404, "not_found");
      return row;
    });
    if (f.uploadStatus === "ready") return { fileId, status: "ready" as const };
    const obj = await this.storage.head(f.r2Key);
    const rule = PURPOSES[f.purpose as Purpose];
    const ok =
      obj &&
      obj.size === f.sizeBytes &&
      obj.size <= rule.maxBytes(f.mimeType) &&
      (obj.contentType ?? "") === f.mimeType;
    if (!ok) {
      if (obj) await this.storage.delete(f.r2Key);
      await withParty(req.partyId, (tx) =>
        tx.update(files).set({ uploadStatus: "rejected", updatedAt: new Date() }).where(eq(files.id, fileId)),
      );
      throw new ApiError(400, obj ? "file_mismatch" : "file_not_received");
    }
    await withParty(req.partyId, (tx) =>
      tx.update(files).set({ uploadStatus: "ready", updatedAt: new Date() }).where(eq(files.id, fileId)),
    );
    return { fileId, status: "ready" as const };
  }

  /** Fichier prêt, d'un usage donné ; `mine` exige qu'il ait été envoyé par la personne. */
  async readyFile(tx: Tx, fileId: string, purpose: Purpose, mine?: string) {
    const [f] = await tx
      .select({
        id: files.id,
        purpose: files.purpose,
        status: files.uploadStatus,
        by: files.uploadedByMemberId,
        trashedAt: files.trashedAt,
      })
      .from(files)
      .where(eq(files.id, fileId));
    if (!f || f.purpose !== purpose || f.status !== "ready" || f.trashedAt || (mine && f.by !== mine))
      throw new ApiError(400, "file_not_ready");
    return f;
  }

  /** Photo du membre (ADH-01) : la précédente part à la corbeille (vidée après 30 jours, DOC-07). */
  async setMyPhoto(req: Req, fileId: string) {
    await withParty(req.partyId, async (tx) => {
      await this.readyFile(tx, fileId, "member_photo", req.memberId!);
      const [m] = await tx.select({ photo: members.photoFileId }).from(members).where(eq(members.id, req.memberId!));
      await tx.update(members).set({ photoFileId: fileId, updatedAt: new Date() }).where(eq(members.id, req.memberId!));
      if (m?.photo && m.photo !== fileId)
        await tx.update(files).set({ trashedAt: new Date() }).where(eq(files.id, m.photo));
    });
  }

  /**
   * URL de lecture de 5 minutes. Photo d'un membre : le membre lui-même ou members.read dans sa zone.
   * Média de publication : tout membre du parti. Document : documents.read, ou la personne qui l'a envoyé.
   */
  async downloadUrl(req: Req, fileId: string) {
    const f = await withParty(req.partyId, async (tx) => {
      const [row] = await tx
        .select()
        .from(files)
        .where(and(eq(files.id, fileId), isNull(files.trashedAt)));
      if (!row || row.uploadStatus !== "ready") throw new ApiError(404, "not_found");
      let allowed = row.uploadedByMemberId === req.memberId;
      if (!allowed && (row.purpose === "publication_media" || row.purpose === "party_logo")) allowed = true;
      if (!allowed && row.purpose === "member_photo") {
        const [owner] = await tx
          .select({ id: members.id, path: zones.path })
          .from(members)
          .innerJoin(zones, eq(zones.id, members.zoneId))
          .where(eq(members.photoFileId, fileId));
        allowed = !!owner && (owner.id === req.memberId || authorize(req, "members.read", owner.path));
      }
      if (!allowed && row.purpose === "document") allowed = authorize(req, "documents.read");
      if (!allowed) throw new ApiError(403, "forbidden");
      if (row.purpose === "document") {
        await audit(tx, {
          partyId: req.partyId,
          actorUserId: req.auth?.userId ?? null,
          actorKind: "member",
          action: "document.read",
          targetType: "file",
          targetId: fileId,
          ip: req.ip,
        });
      }
      return row;
    });
    return {
      url: await this.storage.presignDownload(f.r2Key, DOWNLOAD_TTL_S, f.name),
      expiresInSeconds: DOWNLOAD_TTL_S,
    };
  }

  /** URL de lecture des médias d'une publication, pour le fil (tout membre du parti y a droit). */
  async mediaUrls(tx: Tx, ids: string[]) {
    if (!ids.length) return new Map<string, { mimeType: string; url: string }>();
    const rows = await tx
      .select({ id: files.id, key: files.r2Key, name: files.name, mimeType: files.mimeType })
      .from(files)
      .where(
        and(
          inArray(files.id, ids),
          eq(files.uploadStatus, "ready"),
          eq(files.purpose, "publication_media"),
          isNull(files.trashedAt),
        ),
      );
    const out = new Map<string, { mimeType: string; url: string }>();
    for (const r of rows)
      out.set(r.id, { mimeType: r.mimeType, url: await this.storage.presignDownload(r.key, 60 * 60, r.name) });
    return out;
  }
}
