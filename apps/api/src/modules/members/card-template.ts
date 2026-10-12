// ADH-13 : modèle de carte de membre du parti (settings.party) et impression des cartes (members.read dans la
// zone des membres). Le même modèle règle la carte numérique : l'application et le web le lisent avec la carte.
import type { FastifyRequest } from "fastify";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { cardTemplates, files, memberStatuses, members, parties, withParty, zones, type Tx } from "@civora/db";
import { cardDesign, resolveCardDesign, type CardDesign } from "@civora/shared";
import { audit } from "../../lib/audit.js";
import type { PartyKeys } from "../../lib/party-keys.js";
import type { ObjectStorage } from "../../lib/storage/types.js";
import { today } from "../../lib/today.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize } from "../../plugins/tenant.js";
import { signCardToken } from "./card.js";
import { cardsPdf, type CardImage, type CardSheet, type PrintedMember } from "./cards-pdf.js";
import type { MessageLocale } from "../../lib/messaging/templates.js";

type Req = FastifyRequest;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const actor = (req: Req) => ({
  partyId: req.partyId,
  actorUserId: req.auth?.userId ?? null,
  actorKind: "member" as const,
  ip: req.clientIp,
});

export class CardTemplateService {
  constructor(
    private readonly keys: PartyKeys,
    private readonly storage: ObjectStorage,
    private readonly partyOrigin: string,
  ) {}

  private async stored(tx: Tx) {
    const [t] = await tx.select({ design: cardTemplates.design }).from(cardTemplates);
    return resolveCardDesign(t?.design);
  }

  private async file(tx: Tx, id: string | null, purposes: string[]) {
    if (!id) return null;
    const [f] = await tx
      .select({ key: files.r2Key, mimeType: files.mimeType, name: files.name })
      .from(files)
      .where(
        and(
          eq(files.id, id),
          inArray(files.purpose, purposes),
          eq(files.uploadStatus, "ready"),
          isNull(files.trashedAt),
        ),
      );
    return f ?? null;
  }

  private async url(tx: Tx, id: string | null, purposes: string[]) {
    const f = await this.file(tx, id, purposes);
    return f ? this.storage.presignDownload(f.key, 3600, f.name) : null;
  }

  private async bytes(tx: Tx, id: string | null, purposes: string[]): Promise<CardImage> {
    const f = await this.file(tx, id, purposes);
    if (!f) return null;
    const obj = await this.storage.read(f.key).catch(() => null);
    return obj ? { body: obj.body, mimeType: f.mimeType } : null;
  }

  private async party(tx: Tx) {
    const [p] = await tx
      .select({
        slug: parties.slug,
        name: parties.name,
        brandColor: parties.brandColor,
        brandColorSecondary: parties.brandColorSecondary,
        logoFileId: parties.logoFileId,
      })
      .from(parties);
    return p!;
  }

  /** Modèle et images, pour l'éditeur du back-office et pour la carte numérique. */
  async design(tx: Tx) {
    const design = await this.stored(tx);
    const p = await this.party(tx);
    return {
      design,
      party: {
        name: p.name,
        brandColor: p.brandColor,
        brandColorSecondary: p.brandColorSecondary,
        logoUrl: await this.url(tx, p.logoFileId, ["party_logo"]),
      },
      assets: {
        backgroundUrl: await this.url(tx, design.background.imageFileId, ["card_background"]),
        signatureUrl: await this.url(tx, design.back.signatory?.signatureFileId ?? null, ["signature"]),
      },
    };
  }

  /** Modèle vu par le membre (sa carte numérique dans l'application), avec son statut et sa photo. */
  async forMember(req: Req) {
    return withParty(req.partyId, async (tx) => {
      const [m] = await tx
        .select({ status: memberStatuses.label, photo: members.photoFileId })
        .from(members)
        .leftJoin(
          memberStatuses,
          and(eq(memberStatuses.partyId, members.partyId), eq(memberStatuses.id, members.statusId)),
        )
        .where(eq(members.id, req.memberId!));
      return {
        ...(await this.design(tx)),
        member: {
          status: (m?.status as { fr: string; ht?: string } | null) ?? null,
          photoUrl: await this.url(tx, m?.photo ?? null, ["member_photo"]),
        },
      };
    });
  }

  async get(req: Req) {
    if (!authorize(req, "settings.party")) throw new ApiError(403, "forbidden");
    return withParty(req.partyId, (tx) => this.design(tx));
  }

  /** Enregistre le modèle : les images citées doivent être des fichiers prêts du parti, du bon usage. */
  async save(req: Req, input: unknown) {
    if (!authorize(req, "settings.party")) throw new ApiError(403, "forbidden");
    const design = cardDesign.parse(input);
    await withParty(req.partyId, async (tx) => {
      if (design.background.imageFileId && !(await this.file(tx, design.background.imageFileId, ["card_background"])))
        throw new ApiError(400, "file_not_ready");
      const sig = design.back.signatory?.signatureFileId ?? null;
      if (sig && !(await this.file(tx, sig, ["signature"]))) throw new ApiError(400, "file_not_ready");
      await tx
        .insert(cardTemplates)
        .values({ partyId: req.partyId, design, updatedByMemberId: req.memberId })
        .onConflictDoUpdate({
          target: cardTemplates.partyId,
          set: { design, updatedByMemberId: req.memberId, updatedAt: new Date() },
        });
      await audit(tx, { ...actor(req), action: "settings.card", targetType: "party", targetId: req.partyId });
    });
  }

  private async sheet(tx: Tx, design: CardSheet["design"], printed: PrintedMember[]): Promise<CardSheet> {
    const p = await this.party(tx);
    return {
      partyName: p.name,
      brandColor: p.brandColor,
      secondaryColor: p.brandColorSecondary,
      logo: await this.bytes(tx, p.logoFileId, ["party_logo"]),
      background: await this.bytes(tx, design.background.imageFileId, ["card_background"]),
      signature: await this.bytes(tx, design.back.signatory?.signatureFileId ?? null, ["signature"]),
      design,
      members: printed,
      year: today().slice(0, 4),
    };
  }

  /** Exemplaire au nom d'un membre fictif, pour vérifier le modèle avant l'impression. */
  async sample(req: Req, format: "cr80" | "a4", locale: MessageLocale, draft?: unknown) {
    if (!authorize(req, "settings.party")) throw new ApiError(403, "forbidden");
    return withParty(req.partyId, async (tx) => {
      const design = draft === undefined ? await this.stored(tx) : resolveCardDesign(cardDesign.parse(draft));
      const p = await this.party(tx);
      const fake: PrintedMember = {
        name: "Nadège Pierre-Louis",
        number: "000001",
        zone: "1re Section Morne Chandelle",
        status: { fr: "Militant", ht: "Militan" },
        since: "2024",
        photo: null,
        verifyUrl: `${this.partyOrigin.replace("{slug}", p.slug)}/v/exemple`,
      };
      return cardsPdf(await this.sheet(tx, design, format === "a4" ? Array(10).fill(fake) : [fake]), format, locale);
    });
  }

  /**
   * Impression des cartes de membres choisis (500 au plus) : members.read dans la zone de chacun, adhésions
   * validées seulement ; le QR de chaque carte est signé avec la clé du parti. Auditée (nombre de cartes).
   */
  async print(req: Req, memberIds: string[], format: "cr80" | "a4", locale: MessageLocale) {
    return withParty(req.partyId, async (tx) => {
      const rows = await tx
        .select({
          id: members.id,
          number: members.memberNumber,
          firstName: members.firstName,
          lastName: members.lastName,
          zoneName: zones.name,
          zonePath: zones.path,
          status: memberStatuses.label,
          joinedAt: members.joinedAt,
          photo: members.photoFileId,
        })
        .from(members)
        .innerJoin(zones, eq(zones.id, members.zoneId))
        .leftJoin(
          memberStatuses,
          and(eq(memberStatuses.partyId, members.partyId), eq(memberStatuses.id, members.statusId)),
        )
        .where(and(inArray(members.id, memberIds), eq(members.applicationState, "approved"), isNull(members.deletedAt)))
        .orderBy(members.memberNumber);
      if (!rows.length) throw new ApiError(404, "not_found");
      if (rows.some((r) => !authorize(req, "members.read", r.zonePath))) throw new ApiError(403, "forbidden");
      const design = await this.stored(tx);
      const p = await this.party(tx);
      const key = await this.keys.active(tx, req.partyId);
      const printed: PrintedMember[] = [];
      for (const r of rows) {
        const photo = design.fields.photo ? await this.bytes(tx, r.photo, ["member_photo"]) : null;
        printed.push({
          name: `${r.firstName} ${r.lastName}`,
          number: r.number,
          zone: r.zoneName,
          status: (r.status as { fr: string; ht?: string } | null) ?? null,
          since: r.joinedAt?.toISOString().slice(0, 4) ?? null,
          photo: photo && IMAGE_TYPES.includes(photo.mimeType) ? photo : null,
          verifyUrl: `${this.partyOrigin.replace("{slug}", p.slug)}/v/${signCardToken(key.dek, key.version, r.id)}`,
        });
      }
      await audit(tx, {
        ...actor(req),
        action: "cards.print",
        targetType: "party",
        targetId: req.partyId,
        metadata: { count: printed.length, format },
      });
      return { pdf: await cardsPdf(await this.sheet(tx, design, printed), format, locale), count: printed.length };
    });
  }
}

export type { CardDesign };
