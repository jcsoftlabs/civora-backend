import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { messageLocale } from "../../lib/messaging/templates.js";
import { requireAuth } from "../../plugins/auth.js";
import { requireFeature } from "../../plugins/tenant.js";
import type { CardTemplateService } from "./card-template.js";

const format = z.enum(["cr80", "a4"]).default("cr80");
const printBody = z.object({ memberIds: z.array(z.string().uuid()).min(1).max(500), format });

/** ADH-13 : modèle et impression des cartes (formules avec la carte de membre). */
export default async function cardTemplateRoutes(app: FastifyInstance, opts: { templates: CardTemplateService }) {
  const svc = opts.templates;
  const guard = { preHandler: [requireAuth, requireFeature("members.card")] };
  const locale = (h: string | undefined) => messageLocale(h?.startsWith("ht") ? "ht" : "fr");
  const pdf = (reply: FastifyReply, body: Buffer, name: string) =>
    reply
      .header("content-type", "application/pdf")
      .header("content-disposition", `inline; filename="${name}"`)
      .header("cache-control", "no-store")
      .send(body);

  app.get("/party/card-template", guard, async (req) => svc.get(req));
  app.get("/members/me/card-design", guard, async (req) => svc.forMember(req));
  app.put("/party/card-template", guard, async (req, reply) => {
    await svc.save(req, (req.body as { design?: unknown } | undefined)?.design);
    return reply.code(204).send();
  });
  // Exemplaire : du modèle enregistré, ou du brouillon en cours d'édition (POST).
  app.get("/party/card-template/sample", guard, async (req, reply) => {
    const f = format.parse((req.query as { format?: string }).format);
    return pdf(reply, await svc.sample(req, f, locale(req.headers["accept-language"])), `carte-exemple-${f}.pdf`);
  });
  app.post("/party/card-template/sample", guard, async (req, reply) => {
    const b = z.object({ design: z.unknown(), format }).parse(req.body);
    return pdf(
      reply,
      await svc.sample(req, b.format, locale(req.headers["accept-language"]), b.design),
      `carte-exemple-${b.format}.pdf`,
    );
  });
  app.post(
    "/members/cards/print",
    {
      ...guard,
      config: { rateLimit: { max: 20, timeWindow: "1 hour", keyGenerator: (r) => r.auth?.sessionId ?? r.clientIp } },
    },
    async (req, reply) => {
      const b = printBody.parse(req.body);
      const r = await svc.print(req, b.memberIds, b.format, locale(req.headers["accept-language"]));
      return pdf(reply, r.pdf, `cartes-${b.format}.pdf`);
    },
  );
}
