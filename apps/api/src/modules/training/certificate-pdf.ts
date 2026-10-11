// FOR-04 : certificat de fin de formation, A4 paysage, au nom du parti. Une page, sans image distante.
import PDFDocument from "pdfkit";
import type { MessageLocale } from "../../lib/messaging/templates.js";

const LABELS = {
  fr: {
    title: "Certificat de formation",
    awarded: "Ce certificat est décerné à",
    member: "Membre n°",
    course: "pour avoir suivi et réussi la formation",
    date: "Délivré le",
    number: "Certificat n°",
  },
  ht: {
    title: "Sètifika fòmasyon",
    awarded: "Sètifika sa a bay",
    member: "Manm nimewo",
    course: "paske li swiv epi li reyisi fòmasyon",
    date: "Bay",
    number: "Sètifika nimewo",
  },
} as const;

export interface CertificateView {
  number: string;
  completedAt: Date;
  courseTitle: { fr: string; ht?: string };
  firstName: string;
  lastName: string;
  memberNumber: string;
  partyName: string;
}

/** Date du certificat à l'heure d'Haïti : « 11 octobre 2026 » (un soir en Haïti n'est pas le lendemain). */
export function certificateDate(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "America/Port-au-Prince",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(d)
    .replace(/[\u202f\u00a0]/g, " ");
}

export function certificatePdf(c: CertificateView, locale: MessageLocale): Promise<Buffer> {
  const t = LABELS[locale];
  const course = (locale === "ht" && c.courseTitle.ht) || c.courseTitle.fr;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 56,
      info: { Title: `${t.title} ${c.number}` },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (b: Buffer) => chunks.push(b));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const w = doc.page.width;
    const h = doc.page.height;
    // Double filet, comme un document officiel.
    doc
      .lineWidth(2)
      .rect(28, 28, w - 56, h - 56)
      .stroke("#1C1B19");
    doc
      .lineWidth(0.5)
      .rect(36, 36, w - 72, h - 72)
      .stroke("#1C1B19");
    doc.fillColor("#1C1B19");
    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .text(c.partyName.toUpperCase(), 0, 90, { align: "center", characterSpacing: 2 });
    doc.font("Helvetica-Bold").fontSize(34).text(t.title, 0, 130, { align: "center" });
    doc.font("Helvetica").fontSize(14).text(t.awarded, 0, 205, { align: "center" });
    doc.font("Helvetica-Bold").fontSize(30).text(`${c.firstName} ${c.lastName}`, 0, 235, { align: "center" });
    doc.font("Helvetica").fontSize(12).text(`${t.member} ${c.memberNumber}`, 0, 280, { align: "center" });
    doc.font("Helvetica").fontSize(14).text(t.course, 0, 320, { align: "center" });
    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .text(course, 80, 348, { align: "center", width: w - 160 });
    doc.font("Helvetica").fontSize(11);
    doc.text(`${t.date} ${certificateDate(c.completedAt)}`, 80, h - 120, { width: (w - 160) / 2 });
    doc.text(`${t.number} ${c.number}`, w / 2, h - 120, { width: (w - 160) / 2, align: "right" });
    doc.end();
  });
}
