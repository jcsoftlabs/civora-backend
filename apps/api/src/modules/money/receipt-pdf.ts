import PDFDocument from "pdfkit";
import { formatAmount } from "../../lib/money.js";
import type { MessageLocale } from "../../lib/messaging/templates.js";
import type { ReceiptView } from "./service.js";

const LABELS = {
  fr: {
    title: "Reçu de paiement",
    number: "Reçu n°",
    date: "Date",
    member: "Membre",
    method: "Mode de paiement",
    recordedBy: "Enregistré par",
    total: "Total payé",
    line: "Cotisation",
    period: "Période",
    amount: "Montant",
    methods: { cash: "Espèces", moncash: "MonCash", natcash: "NatCash", kashpaw: "KashPaw", stripe: "Carte" } as Record<
      string,
      string
    >,
    footer: "Reçu émis par civora pour le compte du parti. Conservez-le.",
  },
  ht: {
    title: "Resi peman",
    number: "Resi nimewo",
    date: "Dat",
    member: "Manm",
    method: "Fason ou peye",
    recordedBy: "Moun ki anrejistre l",
    total: "Total ou peye",
    line: "Kotizasyon",
    period: "Peryòd",
    amount: "Kantite",
    methods: {
      cash: "Lajan kach",
      moncash: "MonCash",
      natcash: "NatCash",
      kashpaw: "KashPaw",
      stripe: "Kat",
    } as Record<string, string>,
    footer: "Resi civora bay pou pati a. Kenbe l.",
  },
} as const;

/** Reçu PDF A5, une page : en-tête du parti, membre, lignes de cotisation, total. */
export function receiptPdf(r: ReceiptView, lang: MessageLocale): Promise<Buffer> {
  const t = LABELS[lang];
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A5", margin: 36, info: { Title: `${t.title} ${r.number}` } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(16).text(r.partyName);
    doc.font("Helvetica").fontSize(11).fillColor("#6B6862").text(t.title).fillColor("#1C1B19").moveDown();
    const row = (label: string, value: string) => {
      doc.font("Helvetica-Bold").fontSize(9).text(label, { continued: true }).font("Helvetica").text(`  ${value}`);
    };
    row(t.number, r.number);
    row(t.date, r.issuedAt.slice(0, 10));
    row(t.member, `${r.member.name} (${r.member.number})`);
    row(t.method, t.methods[r.provider] ?? r.provider);
    if (r.recordedBy) row(t.recordedBy, r.recordedBy);
    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(9).text(`${t.line} / ${t.period} / ${t.amount}`);
    doc.font("Helvetica");
    for (const l of r.lines)
      doc.text(`${l.plan[lang] ?? l.plan.fr ?? ""}   ${l.periodStart}   ${formatAmount(l.amount, r.currency)}`);
    doc.moveDown();
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(`${t.total} : ${formatAmount(r.amount, r.currency)}`);
    doc.moveDown(2).font("Helvetica").fontSize(7).fillColor("#6B6862").text(t.footer);
    doc.end();
  });
}
