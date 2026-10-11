// SOC-12 : demande de démonstration depuis le site commercial. Rien n'est stocké : la demande part par e-mail
// à l'équipe commerciale. Route publique, limitée par adresse IP, avec un champ piège contre les robots.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { EmailSender } from "../../lib/messaging/email.js";
import { ApiError } from "../../plugins/errors.js";

const line = (max: number) => z.string().trim().max(max);
export const demoRequest = z
  .object({
    name: line(120).min(2),
    organization: line(160).min(2),
    kind: z.enum(["party", "association", "ngo", "union", "other"]),
    size: z.enum(["s", "m", "l"]),
    phone: line(30)
      .regex(/^\+?[0-9 ().-]{6,30}$/)
      .optional()
      .or(z.literal("")),
    email: z.string().trim().email().max(200).optional().or(z.literal("")),
    message: line(2000).optional(),
    locale: z.enum(["fr", "ht"]).default("fr"),
    /** Champ invisible : un humain le laisse vide. */
    website: z.string().max(200).optional(),
  })
  .refine((d) => !!d.phone || !!d.email, { message: "contact requis", path: ["phone"] });

const KINDS = { party: "Parti politique", association: "Association", ngo: "ONG", union: "Syndicat", other: "Autre" };
const SIZES = { s: "moins de 1 000 membres", m: "1 000 à 10 000 membres", l: "plus de 10 000 membres" };

export default async function marketingRoutes(app: FastifyInstance, opts: { email: EmailSender; to?: string }) {
  app.post(
    "/public/demo-requests",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour", keyGenerator: (r) => r.clientIp } } },
    async (req, reply) => {
      const parsed = demoRequest.safeParse(req.body);
      if (!parsed.success)
        throw new ApiError(
          400,
          parsed.error.issues.some((i) => i.path[0] === "phone") ? "contact_required" : "invalid_request",
        );
      const d = parsed.data;
      // Robot : on répond comme si tout allait bien, sans rien envoyer.
      if (d.website) return reply.code(202).send({ ok: true });
      if (!opts.to) throw new ApiError(503, "demo_unavailable");
      await opts.email.send({
        to: opts.to,
        subject: `Demande de démo : ${d.organization} (${KINDS[d.kind]})`,
        text: [
          `Nom : ${d.name}`,
          `Organisation : ${d.organization}`,
          `Type : ${KINDS[d.kind]}, ${SIZES[d.size]}`,
          `Téléphone ou WhatsApp : ${d.phone || "non indiqué"}`,
          `E-mail : ${d.email || "non indiqué"}`,
          `Langue : ${d.locale === "ht" ? "créole" : "français"}`,
          "",
          d.message ? `Message :\n${d.message}` : "Pas de message.",
        ].join("\n"),
      });
      return reply.code(202).send({ ok: true });
    },
  );
}
