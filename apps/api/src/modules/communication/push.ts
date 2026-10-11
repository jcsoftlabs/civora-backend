// COM-02 : notifications push ciblées par zone, statut, organe ou diaspora, envoyées par le worker.
import type { FastifyRequest } from "fastify";
import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { members, outreachCampaigns, pushDevices, users, withParty, zones } from "@civora/db";
import { audienceInput, memberColumns, memberInAudience, resolveAudience, type Audience } from "../../lib/audience.js";
import { audit } from "../../lib/audit.js";
import type { PushSender } from "../../lib/messaging/push.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize } from "../../plugins/tenant.js";

const text = (max: number) =>
  z.object({ fr: z.string().trim().min(1).max(max), ht: z.string().trim().max(max).optional() });
export const deviceBody = z.object({
  token: z.string().min(20).max(4096),
  platform: z.enum(["android", "ios", "web"]),
});
export const pushCampaign = z.object({
  title: text(65),
  body: text(240),
  audience: audienceInput.default(null),
  scheduledAt: z.coerce.date().optional(),
});

type Req = FastifyRequest;
const PERM = "outreach.send" as const;
const canManage = (req: Req, a: Audience | null) =>
  a?.zonePaths ? a.zonePaths.every((p) => authorize(req, PERM, p)) : authorize(req, PERM);

export class PushService {
  constructor(private readonly sender: PushSender) {}

  /** L'application enregistre le téléphone du membre connecté (jeton FCM), ou le met à jour. */
  async registerDevice(req: Req, body: z.infer<typeof deviceBody>) {
    await withParty(req.partyId, (tx) =>
      tx
        .insert(pushDevices)
        .values({ partyId: req.partyId, memberId: req.memberId!, token: body.token, platform: body.platform })
        .onConflictDoUpdate({
          target: [pushDevices.partyId, pushDevices.token],
          set: { memberId: req.memberId!, platform: body.platform, lastSeenAt: new Date(), updatedAt: new Date() },
        }),
    );
  }

  async removeDevice(req: Req, token: string) {
    await withParty(req.partyId, (tx) =>
      tx.delete(pushDevices).where(and(eq(pushDevices.token, token), eq(pushDevices.memberId, req.memberId!))),
    );
  }

  /** Campagne push : audience dans la portée de la personne, envoi immédiat ou programmé (par le worker). */
  async create(req: Req, body: z.infer<typeof pushCampaign>) {
    return withParty(req.partyId, async (tx) => {
      const audience = await resolveAudience(tx, req, PERM, body.audience);
      const [c] = await tx
        .insert(outreachCampaigns)
        .values({
          partyId: req.partyId,
          channel: "push",
          audience: audience ?? {},
          content: { title: body.title, body: body.body },
          scheduledAt: body.scheduledAt ?? new Date(),
          createdByMemberId: req.memberId,
        })
        .returning({ id: outreachCampaigns.id });
      await audit(tx, {
        partyId: req.partyId,
        actorUserId: req.auth?.userId ?? null,
        actorKind: "member",
        action: "outreach.push.create",
        targetType: "outreach_campaign",
        targetId: c!.id,
        metadata: {
          audience: audience?.zoneCodes ?? "all",
          scheduledAt: (body.scheduledAt ?? new Date()).toISOString(),
        },
        ip: req.ip,
      });
      return { id: c!.id };
    });
  }

  async list(req: Req) {
    if (!req.grants.some((g) => g.permission === PERM)) throw new ApiError(403, "forbidden");
    const rows = await withParty(req.partyId, (tx) =>
      tx
        .select({
          id: outreachCampaigns.id,
          channel: outreachCampaigns.channel,
          content: outreachCampaigns.content,
          audience: outreachCampaigns.audience,
          status: outreachCampaigns.status,
          scheduledAt: outreachCampaigns.scheduledAt,
          sentAt: outreachCampaigns.sentAt,
          sentCount: outreachCampaigns.sentCount,
          failedCount: outreachCampaigns.failedCount,
        })
        .from(outreachCampaigns)
        .orderBy(desc(outreachCampaigns.createdAt))
        .limit(100),
    );
    return rows.filter((c) => canManage(req, normalize(c.audience)));
  }

  async cancel(req: Req, id: string) {
    await withParty(req.partyId, async (tx) => {
      const [c] = await tx
        .select({ audience: outreachCampaigns.audience, status: outreachCampaigns.status })
        .from(outreachCampaigns)
        .where(eq(outreachCampaigns.id, id));
      if (!c) throw new ApiError(404, "not_found");
      if (!canManage(req, normalize(c.audience))) throw new ApiError(403, "forbidden");
      if (c.status !== "scheduled") throw new ApiError(409, "campaign_not_cancellable");
      await tx
        .update(outreachCampaigns)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(outreachCampaigns.id, id));
    });
  }

  /**
   * Envoi des campagnes push dont l'heure est venue (job notifications.fanout, chaque minute). Chaque campagne est
   * réservée (sending) avant l'envoi : deux workers ne l'envoient pas deux fois. Texte dans la langue de chacun.
   */
  async dispatchDue(partyId: string): Promise<{ campaigns: number; sent: number; failed: number }> {
    const due = await withParty(partyId, async (tx) => {
      const rows = await tx
        .select({ id: outreachCampaigns.id, audience: outreachCampaigns.audience, content: outreachCampaigns.content })
        .from(outreachCampaigns)
        .where(
          and(
            eq(outreachCampaigns.channel, "push"),
            eq(outreachCampaigns.status, "scheduled"),
            or(isNull(outreachCampaigns.scheduledAt), lte(outreachCampaigns.scheduledAt, new Date())),
          ),
        )
        .for("update", { skipLocked: true })
        .limit(10);
      if (rows.length) {
        await tx
          .update(outreachCampaigns)
          .set({ status: "sending" })
          .where(
            inArray(
              outreachCampaigns.id,
              rows.map((r) => r.id),
            ),
          );
      }
      return rows;
    });

    const total = { campaigns: due.length, sent: 0, failed: 0 };
    for (const c of due) {
      try {
        const r = await this.sendCampaign(partyId, c);
        total.sent += r.sent;
        total.failed += r.failed;
      } catch (err) {
        // Envoi impossible (FCM indisponible ou non configuré) : la campagne repart en attente.
        await withParty(partyId, (tx) =>
          tx
            .update(outreachCampaigns)
            .set({ status: "scheduled", updatedAt: new Date() })
            .where(eq(outreachCampaigns.id, c.id)),
        );
        throw err;
      }
    }
    return total;
  }

  private async sendCampaign(partyId: string, c: { id: string; audience: unknown; content: unknown }) {
    {
      const content = c.content as { title: Record<string, string>; body: Record<string, string> };
      const audience = normalize(c.audience);
      const devices = await withParty(partyId, (tx) =>
        tx
          .select({ token: pushDevices.token, locale: users.locale })
          .from(pushDevices)
          .innerJoin(members, and(eq(members.partyId, pushDevices.partyId), eq(members.id, pushDevices.memberId)))
          .innerJoin(zones, eq(zones.id, members.zoneId))
          .leftJoin(users, eq(users.id, members.userId))
          .where(
            and(
              isNull(members.deletedAt),
              eq(members.applicationState, "approved"),
              memberInAudience(sql`${JSON.stringify(audience)}::text::jsonb`, memberColumns(members, zones.path)),
            ),
          ),
      );
      let sent = 0;
      let failed = 0;
      const invalid: string[] = [];
      for (const lang of ["fr", "ht"] as const) {
        const tokens = devices.filter((d) => (d.locale === "ht" ? "ht" : "fr") === lang).map((d) => d.token);
        for (let i = 0; i < tokens.length; i += 500) {
          const r = await this.sender.send(tokens.slice(i, i + 500), {
            title: content.title[lang] ?? content.title.fr ?? "",
            body: content.body[lang] ?? content.body.fr ?? "",
            data: { campaignId: c.id },
          });
          sent += r.sent;
          failed += r.failed;
          invalid.push(...r.invalidTokens);
        }
      }
      await withParty(partyId, async (tx) => {
        if (invalid.length) await tx.delete(pushDevices).where(inArray(pushDevices.token, invalid));
        await tx
          .update(outreachCampaigns)
          .set({ status: "sent", sentAt: new Date(), sentCount: sent, failedCount: failed, updatedAt: new Date() })
          .where(eq(outreachCampaigns.id, c.id));
        await audit(tx, {
          partyId,
          actorUserId: null,
          actorKind: "system",
          action: "outreach.push.sent",
          targetType: "outreach_campaign",
          targetId: c.id,
          metadata: { sent, failed, removedDevices: invalid.length },
        });
      });
      return { sent, failed };
    }
  }
}

/** Audience stockée : {} signifie tout le parti. */
function normalize(a: unknown): Audience | null {
  return a && typeof a === "object" && Object.keys(a).length ? (a as Audience) : null;
}
