// ADH-12 : export filtré des membres (CSV, Excel, PDF), limité à la zone de la personne, journalisé.
// Jamais de pièce d'identité dans un export (skill tenant-security).
import type { FastifyRequest } from "fastify";
import { and, arrayOverlaps, asc, eq, isNull, sql, type SQL } from "drizzle-orm";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { memberStatuses, members, parties, users, withParty, zones } from "@civora/db";
import { audit } from "../../lib/audit.js";
import { zoneScope } from "../../lib/zone-scope.js";
import { ApiError } from "../../plugins/errors.js";

export const EXPORT_MAX_ROWS = 50_000;

export const exportRequest = z.object({
  format: z.enum(["csv", "xlsx", "pdf"]),
  lang: z.enum(["fr", "ht"]).default("fr"),
  filters: z
    .object({
      state: z.enum(["pending", "approved", "rejected"]).optional(),
      zoneCode: z
        .string()
        .regex(/^[A-Z0-9-]{2,20}$/)
        .optional(),
      statusId: z.string().uuid().optional(),
      tags: z.array(z.string().min(1).max(40)).max(10).optional(),
      diaspora: z.boolean().optional(),
    })
    .default({}),
});

const HEADERS = {
  fr: [
    "Numéro",
    "Nom",
    "Prénom",
    "Adhésion",
    "Statut",
    "Localisation",
    "Code zone",
    "Téléphone",
    "E-mail",
    "Membre depuis",
    "Étiquettes",
  ],
  ht: ["Nimewo", "Non", "Prenon", "Adezyon", "Estati", "Kote", "Kòd zòn", "Telefòn", "Imèl", "Manm depi", "Etikèt"],
} as const;
const STATES = {
  fr: { pending: "En attente", approved: "Validée", rejected: "Rejetée" },
  ht: { pending: "Ap tann", approved: "Valide", rejected: "Rejte" },
} as const;

type Row = (string | null)[];

/**
 * Neutralise l'injection de formules (CSV injection) : une cellule qui commence par = + - @ ou une tabulation
 * serait exécutée par Excel ou LibreOffice. On la préfixe d'une apostrophe.
 */
export function safeCell(v: string | null): string {
  if (v === null) return "";
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

function csv(rows: Row[], headers: readonly string[]): Buffer {
  const esc = (v: string | null) => {
    const s = safeCell(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map((r) => r.map(esc).join(";"));
  // BOM UTF-8 et point-virgule : Excel en français ouvre le fichier avec les accents et les colonnes.
  return Buffer.from("\uFEFF" + lines.join("\r\n") + "\r\n", "utf8");
}

async function xlsx(rows: Row[], headers: readonly string[], partyName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "civora";
  wb.title = `Membres ${partyName}`;
  const ws = wb.addWorksheet("Membres", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow([...headers]).font = { bold: true };
  for (const r of rows) ws.addRow(r.map(safeCell));
  ws.columns.forEach((c) => (c.width = 18));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function pdf(rows: Row[], headers: readonly string[], footer: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    // Colonnes lisibles sur une page : numéro, nom, prénom, adhésion, statut, localisation.
    const cols = [0, 1, 2, 3, 4, 5];
    const widths = [60, 120, 120, 70, 90, 310];
    const line = (cells: (string | null)[], bold = false) => {
      if (doc.y > doc.page.height - 60) doc.addPage();
      const y = doc.y;
      let x = doc.page.margins.left;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8);
      cols.forEach((c, i) => {
        doc.text(cells[c] ?? "", x, y, { width: widths[i]! - 6, height: 22, ellipsis: true });
        x += widths[i]!;
      });
      doc.y = y + 16;
    };
    line([...headers], true);
    for (const r of rows) line(r);
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc
        .font("Helvetica")
        .fontSize(7)
        .text(`${footer}. Page ${i + 1} / ${pages.count}`, 36, doc.page.height - 30, {
          lineBreak: false,
        });
    }
    doc.end();
  });
}

/** Produit l'export dans la portée de la personne (members.export) et l'inscrit au journal d'audit. */
export async function exportMembers(req: FastifyRequest, input: z.infer<typeof exportRequest>) {
  const scope = zoneScope(req, "members.export");
  if (!scope.allowed) throw new ApiError(403, "forbidden");
  const f = input.filters;

  return withParty(req.partyId, async (tx) => {
    const conditions: (SQL | undefined)[] = [isNull(members.deletedAt), scope.where(zones.path)];
    if (f.zoneCode) {
      const [z] = await tx.select({ path: zones.path }).from(zones).where(eq(zones.code, f.zoneCode));
      if (!z) throw new ApiError(400, "zone_not_found");
      // Filtrer sur une zone hors de sa portée ne donne rien de plus : la portée s'applique toujours.
      conditions.push(sql`${zones.path} <@ ${z.path}::ltree`);
    }
    if (f.state) conditions.push(eq(members.applicationState, f.state));
    if (f.statusId) conditions.push(eq(members.statusId, f.statusId));
    if (f.diaspora !== undefined) conditions.push(eq(members.isDiaspora, f.diaspora));
    if (f.tags?.length) conditions.push(arrayOverlaps(members.tags, f.tags));

    const data = await tx
      .select({
        number: members.memberNumber,
        lastName: members.lastName,
        firstName: members.firstName,
        state: members.applicationState,
        status: sql<string | null>`${memberStatuses.label} ->> ${input.lang}`,
        statusFr: sql<string | null>`${memberStatuses.label} ->> 'fr'`,
        location: sql<string>`(select string_agg(a.name, ' > ' order by nlevel(a.path)) from zones a
                               where a.path @> ${zones.path} and nlevel(a.path) > 1)`,
        zoneCode: zones.code,
        phone: members.phoneE164,
        email: users.email,
        joinedAt: members.joinedAt,
        tags: members.tags,
      })
      .from(members)
      .innerJoin(zones, eq(zones.id, members.zoneId))
      .leftJoin(
        memberStatuses,
        and(eq(memberStatuses.partyId, members.partyId), eq(memberStatuses.id, members.statusId)),
      )
      .leftJoin(users, eq(users.id, members.userId))
      .where(and(...conditions))
      .orderBy(asc(members.lastName), asc(members.firstName))
      .limit(EXPORT_MAX_ROWS + 1);
    if (data.length > EXPORT_MAX_ROWS) throw new ApiError(413, "export_too_large");

    const states = STATES[input.lang];
    const rows: Row[] = data.map((m) => [
      m.number,
      m.lastName,
      m.firstName,
      states[m.state],
      m.status ?? m.statusFr,
      m.location,
      m.zoneCode,
      m.phone,
      m.email,
      m.joinedAt ? m.joinedAt.toISOString().slice(0, 10) : null,
      m.tags.join(", "),
    ]);

    const [party] = await tx.select({ name: parties.name, slug: parties.slug }).from(parties);
    const day = new Date().toISOString().slice(0, 10);
    await audit(tx, {
      partyId: req.partyId,
      actorUserId: req.auth?.userId ?? null,
      actorKind: "member",
      action: "export.members",
      targetType: "member",
      // Filtres et volume seulement : aucune donnée de membre au journal.
      metadata: {
        format: input.format,
        filters: f,
        count: rows.length,
        scope: scope.national ? "national" : scope.paths,
      },
      ip: req.ip,
    });

    const headers = HEADERS[input.lang];
    const base = `membres-${party?.slug ?? "parti"}-${day}`;
    const footer = `${party?.name ?? ""}, export du ${day}, ${rows.length} membres. Document confidentiel`;
    if (input.format === "csv")
      return { body: csv(rows, headers), type: "text/csv; charset=utf-8", filename: `${base}.csv` };
    if (input.format === "xlsx") {
      return {
        body: await xlsx(rows, headers, party?.name ?? ""),
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename: `${base}.xlsx`,
      };
    }
    return { body: await pdf(rows, headers, footer), type: "application/pdf", filename: `${base}.pdf` };
  });
}
