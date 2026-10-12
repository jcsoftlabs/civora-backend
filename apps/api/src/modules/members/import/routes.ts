// ADH-07 à ADH-09 : routes de l'assistant d'import des membres (permission members.import, zone par zone).
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../plugins/auth.js";
import { requireFeature } from "../../../plugins/tenant.js";
import { decideBody, importSettings, importStart, rowsQuery, type MemberImportService } from "./service.js";

const idParam = z.object({ id: z.string().uuid() });
const linksQuery = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  lang: z.enum(["fr", "ht"]).default("fr"),
});

/** Libellés du rapport téléchargé (CSV), dans la langue de la personne. */
const REPORT: Record<"fr" | "ht", Record<string, string>> = {
  fr: {
    line: "Ligne",
    name: "Nom",
    zone: "Zone",
    problem: "Problème",
    result: "Résultat",
    name_missing: "Prénom ou nom manquant",
    zone_unknown: "Section ou ville introuvable",
    zone_outside_scope: "Zone hors de votre périmètre",
    phone_invalid: "Téléphone illisible, non importé",
    email_invalid: "E-mail illisible, non importé",
    birth_date_invalid: "Date de naissance illisible, non importée",
    joined_at_invalid: "Date d'adhésion illisible, date de l'import retenue",
    status_unknown: "Statut inconnu, statut par défaut retenu",
    identity_invalid: "Pièce d'identité illisible, non importée",
    email_in_use: "Adresse déjà utilisée, fiche créée sans compte",
    duplicate: "Doublon",
    created: "Créé",
    merged: "Fusionné",
    skipped: "Écarté",
    failed: "Échec",
  },
  ht: {
    line: "Liy",
    name: "Non",
    zone: "Zòn",
    problem: "Pwoblèm",
    result: "Rezilta",
    name_missing: "Non oswa siyati manke",
    zone_unknown: "Nou pa jwenn seksyon an oswa vil la",
    zone_outside_scope: "Zòn nan pa nan responsablite ou",
    phone_invalid: "Telefòn nan pa li byen, li pa antre",
    email_invalid: "Imel la pa li byen, li pa antre",
    birth_date_invalid: "Dat nesans lan pa li byen, li pa antre",
    joined_at_invalid: "Dat adezyon an pa li byen, se dat enpòtasyon an ki rete",
    status_unknown: "Estati a pa konnen, se estati pa defo a ki rete",
    identity_invalid: "Pyès idantite a pa li byen, li pa antre",
    email_in_use: "Adrès la deja sèvi, fich la kreye san kont",
    duplicate: "Doub",
    created: "Kreye",
    merged: "Mete ansanm",
    skipped: "Kite sou kote",
    failed: "Echèk",
  },
};

const csvCell = (v: string) => (/[";\n,]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export default async function memberImportRoutes(app: FastifyInstance, opts: { imports: MemberImportService }) {
  const svc = opts.imports;
  const guard = { preHandler: [requireAuth, requireFeature("members.import")] };

  app.post(
    "/member-imports",
    { ...guard, config: { rateLimit: { max: 30, timeWindow: "1 hour" } } },
    async (req, reply) => reply.code(201).send(await svc.start(req, importStart.parse(req.body))),
  );
  app.get("/member-imports", guard, async (req) => ({ imports: await svc.list(req) }));
  app.get("/member-imports/:id", guard, async (req) => svc.get(req, idParam.parse(req.params).id));
  app.put("/member-imports/:id/settings", guard, async (req) =>
    svc.analyze(req, idParam.parse(req.params).id, importSettings.parse(req.body)),
  );
  app.get("/member-imports/:id/rows", guard, async (req) =>
    svc.rows(req, idParam.parse(req.params).id, rowsQuery.parse(req.query)),
  );
  app.post("/member-imports/:id/decisions", guard, async (req) =>
    svc.decide(req, idParam.parse(req.params).id, decideBody.parse(req.body)),
  );
  app.post("/member-imports/:id/run", guard, async (req, reply) => {
    await svc.run(req, idParam.parse(req.params).id);
    return reply.code(202).send();
  });
  app.post("/member-imports/:id/invitations", guard, async (req) =>
    svc.requestInvites(req, idParam.parse(req.params).id),
  );
  app.get("/member-imports/:id/whatsapp", guard, async (req) => {
    const q = linksQuery.parse(req.query);
    return svc.whatsapp(req, idParam.parse(req.params).id, q.page, q.lang);
  });

  /** Rapport des lignes à reprendre (erreurs, avertissements, doublons, échecs), en CSV pour Excel. */
  app.get("/member-imports/:id/report.csv", guard, async (req, reply) => {
    const id = idParam.parse(req.params).id;
    const L = REPORT[req.headers["accept-language"]?.startsWith("ht") ? "ht" : "fr"];
    const out = [[L.line, L.name, L.zone, L.problem, L.result].join(";")];
    for (let page = 1; ; page++) {
      const { rows } = await svc.rows(req, id, { kind: "all", page });
      for (const r of rows) {
        const problems = [...r.issues.map((i) => L[i] ?? i), ...(r.duplicate ? [L.duplicate!] : [])];
        if (!problems.length && (r.result === "created" || r.result === null)) continue;
        out.push(
          [String(r.line), r.name, r.zone, problems.join(", "), r.result ? (L[r.result] ?? r.result) : ""]
            .map(csvCell)
            .join(";"),
        );
      }
      if (rows.length < 50) break;
    }
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="rapport-import.csv"`)
      .header("cache-control", "no-store")
      .send(`\uFEFF${out.join("\r\n")}\r\n`);
  });
}
