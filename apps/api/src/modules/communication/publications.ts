// COM-01 : annonces, actualités, éditoriaux, podcasts et albums, ciblés par zone, statut, organe ou diaspora.
import type { FastifyRequest } from "fastify";
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { files, publications, withParty, type Tx } from "@civora/db";
import { audienceInput, memberInAudience, resolveAudience, type Audience } from "../../lib/audience.js";
import { audit } from "../../lib/audit.js";
import { currentMember } from "../../lib/member-context.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize } from "../../plugins/tenant.js";
import type { FilesService } from "../files/service.js";

const i18n = z.object({ fr: z.string().trim().min(1).max(20_000), ht: z.string().trim().max(20_000).optional() });
const title = z.object({ fr: z.string().trim().min(1).max(160), ht: z.string().trim().max(160).optional() });
export const PUBLICATION_KINDS = ["announcement", "news", "editorial", "podcast", "album"] as const;

export const publicationCreate = z.object({
  kind: z.enum(PUBLICATION_KINDS),
  title,
  body: i18n.optional(),
  audience: audienceInput.default(null),
  /** Images d'un album, fichier audio d'un podcast : fichiers envoyés avec l'usage publication_media. */
  mediaFileIds: z.array(z.string().uuid()).max(50).default([]),
});
export const publicationUpdate = publicationCreate.partial();
export const publishBody = z.object({ at: z.coerce.date().optional() });
export const feedQuery = z.object({
  kind: z.enum(PUBLICATION_KINDS).optional(),
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const manageQuery = z.object({ status: z.enum(["draft", "scheduled", "published"]).optional() });

type Req = FastifyRequest;
const PERM = "publications.manage" as const;

/** Une publication se gère avec publications.manage sur toute sa cible (zones visées, ou national). */
function canManage(req: Req, audience: Audience | null) {
  return audience?.zonePaths ? audience.zonePaths.every((p) => authorize(req, PERM, p)) : authorize(req, PERM);
}

const columns = {
  id: publications.id,
  kind: publications.kind,
  title: publications.title,
  body: publications.body,
  audience: publications.audience,
  publishedAt: publications.publishedAt,
  createdAt: publications.createdAt,
};

export class PublicationsService {
  constructor(private readonly files: FilesService) {}

  private async checkMedia(tx: Tx, ids: string[]) {
    for (const id of ids) await this.files.readyFile(tx, id, "publication_media");
  }

  async create(req: Req, body: z.infer<typeof publicationCreate>) {
    return withParty(req.partyId, async (tx) => {
      const audience = await resolveAudience(tx, req, PERM, body.audience);
      await this.checkMedia(tx, body.mediaFileIds);
      const [p] = await tx
        .insert(publications)
        .values({
          partyId: req.partyId,
          kind: body.kind,
          title: body.title,
          body: body.body ?? null,
          audience,
          mediaFileIds: body.mediaFileIds,
        })
        .returning({ id: publications.id });
      return { id: p!.id };
    });
  }

  private async load(tx: Parameters<Parameters<typeof withParty>[1]>[0], req: Req, id: string) {
    const [p] = await tx
      .select({ ...columns, mediaFileIds: publications.mediaFileIds })
      .from(publications)
      .where(eq(publications.id, id));
    if (!p) throw new ApiError(404, "not_found");
    if (!canManage(req, p.audience as Audience | null)) throw new ApiError(403, "forbidden");
    return p;
  }

  async update(req: Req, id: string, body: z.infer<typeof publicationUpdate>) {
    await withParty(req.partyId, async (tx) => {
      const before = await this.load(tx, req, id);
      const audience = body.audience !== undefined ? await resolveAudience(tx, req, PERM, body.audience) : undefined;
      if (body.mediaFileIds) await this.checkMedia(tx, body.mediaFileIds);
      // Médias retirés de la publication : à la corbeille (vidée après 30 jours, DOC-07).
      const removed = body.mediaFileIds
        ? (before.mediaFileIds ?? []).filter((m) => !body.mediaFileIds!.includes(m))
        : [];
      if (removed.length)
        await tx
          .update(files)
          .set({ trashedAt: new Date() })
          .where(and(inArray(files.id, removed), eq(files.purpose, "publication_media")));
      await tx
        .update(publications)
        .set({
          ...(body.kind ? { kind: body.kind } : {}),
          ...(body.title ? { title: body.title } : {}),
          ...(body.body ? { body: body.body } : {}),
          ...(audience !== undefined ? { audience } : {}),
          ...(body.mediaFileIds ? { mediaFileIds: body.mediaFileIds } : {}),
          updatedAt: new Date(),
        })
        .where(eq(publications.id, id));
    });
  }

  /** Publication immédiate ou programmée (`at` dans le futur). */
  async publish(req: Req, id: string, at?: Date) {
    await withParty(req.partyId, async (tx) => {
      const p = await this.load(tx, req, id);
      const when = at ?? new Date();
      await tx.update(publications).set({ publishedAt: when, updatedAt: new Date() }).where(eq(publications.id, id));
      await audit(tx, {
        partyId: req.partyId,
        actorUserId: req.auth?.userId ?? null,
        actorKind: "member",
        action: "publication.publish",
        targetType: "publication",
        targetId: id,
        metadata: {
          kind: p.kind,
          at: when.toISOString(),
          audience: (p.audience as Audience | null)?.zoneCodes ?? "all",
        },
        ip: req.clientIp,
      });
    });
  }

  async unpublish(req: Req, id: string) {
    await withParty(req.partyId, async (tx) => {
      await this.load(tx, req, id);
      await tx.update(publications).set({ publishedAt: null, updatedAt: new Date() }).where(eq(publications.id, id));
    });
  }

  /** Publications que la personne peut gérer (brouillons, programmées, publiées), avec leurs médias. */
  async manageList(req: Req, status?: "draft" | "scheduled" | "published") {
    if (!req.grants.some((g) => g.permission === PERM)) throw new ApiError(403, "forbidden");
    const now = new Date();
    return withParty(req.partyId, async (tx) => {
      const rows = (
        await tx
          .select({ ...columns, mediaFileIds: publications.mediaFileIds })
          .from(publications)
          .where(
            status === "draft"
              ? isNull(publications.publishedAt)
              : status === "scheduled"
                ? gt(publications.publishedAt, now)
                : status === "published"
                  ? lte(publications.publishedAt, now)
                  : undefined,
          )
          .orderBy(desc(publications.createdAt))
          .limit(200)
      ).filter((p) => canManage(req, p.audience as Audience | null));
      // Médias déjà joints : l'éditeur les montre pour qu'on enrichisse un album au lieu de le remplacer.
      const urls = await this.files.mediaUrls(
        tx,
        rows.flatMap((r) => r.mediaFileIds ?? []),
      );
      return rows.map(({ mediaFileIds, ...r }) => ({
        ...r,
        media: (mediaFileIds ?? []).flatMap((id) => (urls.has(id) ? [{ id, ...urls.get(id)! }] : [])),
      }));
    });
  }

  /** Fil du membre : publications parues qui le ciblent, de la plus récente à la plus ancienne. */
  async feed(req: Req, q: z.infer<typeof feedQuery>) {
    return withParty(req.partyId, async (tx) => {
      const me = await currentMember(tx, req.memberId!);
      const now = new Date();
      const rows = await tx
        .select({
          id: publications.id,
          kind: publications.kind,
          title: publications.title,
          body: publications.body,
          publishedAt: publications.publishedAt,
          mediaFileIds: publications.mediaFileIds,
        })
        .from(publications)
        .where(
          and(
            isNotNull(publications.publishedAt),
            lte(publications.publishedAt, q.before && q.before < now ? q.before : now),
            q.before ? lt(publications.publishedAt, q.before) : undefined,
            q.kind ? eq(publications.kind, q.kind) : undefined,
            memberInAudience(sql.raw(`"publications"."audience"`), me.sql),
          ),
        )
        .orderBy(desc(publications.publishedAt))
        .limit(q.limit);
      // Médias : URL de lecture signées (1 heure), jamais d'accès public au stockage.
      const urls = await this.files.mediaUrls(
        tx,
        rows.flatMap((r) => r.mediaFileIds ?? []),
      );
      const items = rows.map(({ mediaFileIds, ...r }) => ({
        ...r,
        media: (mediaFileIds ?? []).flatMap((id) => (urls.has(id) ? [{ id, ...urls.get(id)! }] : [])),
      }));
      return { items, nextBefore: rows.length === q.limit ? rows.at(-1)?.publishedAt : null };
    });
  }
}
