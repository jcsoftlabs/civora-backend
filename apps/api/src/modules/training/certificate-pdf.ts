// FOR-04 : certificat de fin de formation, A4 paysage, au modèle du parti (textes, couleur, logo, signataires).
// Une page ; les images (logo, signatures) sont lues par le serveur, jamais chargées depuis une adresse distante.
import PDFDocument from "pdfkit";
import type { MessageLocale } from "../../lib/messaging/templates.js";
import type { CertificateTemplate } from "./schemas.js";

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

const INK = "#1C1B19";
const INK_2 = "#6B6862";
/** pdfkit n'intègre que le PNG et le JPEG. */
const EMBEDDABLE = ["image/png", "image/jpeg"];

type I18n = { fr: string; ht?: string | undefined };
type Image = { body: Buffer; mimeType: string } | null;

export interface CertificateView {
  number: string;
  completedAt: Date;
  courseTitle: I18n;
  firstName: string;
  lastName: string;
  memberNumber: string;
  partyName: string;
  template: CertificateTemplate;
  brandColor: string | null;
  logo: Image;
  /** Image de signature de chaque signataire, dans l'ordre du modèle. */
  signatures: Image[];
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

const pick = (t: I18n | null | undefined, locale: MessageLocale) => (t ? (locale === "ht" && t.ht) || t.fr : null);
const embeddable = (img: Image): img is { body: Buffer; mimeType: string } =>
  !!img && EMBEDDABLE.includes(img.mimeType);

export function certificatePdf(c: CertificateView, locale: MessageLocale): Promise<Buffer> {
  const t = LABELS[locale];
  const tpl = c.template;
  const title = pick(tpl.title, locale) ?? t.title;
  const mention = pick(tpl.mention, locale) ?? t.awarded;
  const footer = pick(tpl.footer, locale);
  const course = pick(c.courseTitle, locale) ?? "";
  const accent = tpl.accentColor ?? c.brandColor ?? INK;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 0,
      info: { Title: `${title} ${c.number}` },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (b: Buffer) => chunks.push(b));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const w = doc.page.width;
    const h = doc.page.height;
    // Double filet à la couleur du parti, comme un document officiel.
    doc
      .lineWidth(2)
      .rect(28, 28, w - 56, h - 56)
      .stroke(accent);
    doc
      .lineWidth(0.5)
      .rect(36, 36, w - 72, h - 72)
      .stroke(accent);

    let y = 64;
    if (tpl.showLogo && embeddable(c.logo)) {
      try {
        doc.image(c.logo.body, w / 2 - 32, y, { fit: [64, 64], align: "center", valign: "center" });
        y += 74;
      } catch {
        // Image illisible : le certificat reste valable sans logo.
      }
    } else y += 26;
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(13);
    doc.text(c.partyName.toUpperCase(), 0, y, { align: "center", width: w, characterSpacing: 2 });
    y += 30;
    doc
      .fillColor(accent)
      .font("Helvetica-Bold")
      .fontSize(32)
      .text(title, 60, y, { align: "center", width: w - 120 });
    y = doc.y + 18;
    doc.fillColor(INK).font("Helvetica").fontSize(13).text(mention, 0, y, { align: "center", width: w });
    y += 24;
    doc.font("Helvetica-Bold").fontSize(28).text(`${c.firstName} ${c.lastName}`, 0, y, { align: "center", width: w });
    y += 40;
    doc
      .fillColor(INK_2)
      .font("Helvetica")
      .fontSize(11)
      .text(`${t.member} ${c.memberNumber}`, 0, y, { align: "center", width: w });
    y += 28;
    doc.fillColor(INK).fontSize(13).text(t.course, 0, y, { align: "center", width: w });
    y += 22;
    doc
      .font("Helvetica-Bold")
      .fontSize(19)
      .text(course, 80, y, { align: "center", width: w - 160 });
    if (footer) {
      doc
        .fillColor(INK_2)
        .font("Helvetica")
        .fontSize(10)
        .text(footer, 120, doc.y + 10, { align: "center", width: w - 240 });
    }

    // Signataires : signature au-dessus d'un filet, puis nom et fonction.
    const signers = tpl.signatories;
    const baseY = h - 118;
    if (signers.length) {
      const slot = (w - 160) / signers.length;
      signers.forEach((s, i) => {
        const x = 80 + i * slot;
        const cw = Math.min(slot - 24, 200);
        const cx = x + (slot - cw) / 2;
        const img = c.signatures[i] ?? null;
        if (embeddable(img)) {
          try {
            doc.image(img.body, cx, baseY - 52, { fit: [cw, 48], align: "center", valign: "bottom" });
          } catch {
            // Signature illisible : le filet reste, à signer à la main.
          }
        }
        doc
          .lineWidth(0.6)
          .moveTo(cx, baseY)
          .lineTo(cx + cw, baseY)
          .stroke(INK);
        doc
          .fillColor(INK)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(s.name, cx, baseY + 5, { width: cw, align: "center" });
        doc
          .fillColor(INK_2)
          .font("Helvetica")
          .fontSize(9)
          .text(pick(s.role, locale) ?? "", cx, doc.y + 1, {
            width: cw,
            align: "center",
          });
      });
    }
    const metaY = signers.length ? h - 66 : h - 120;
    doc.fillColor(INK).font("Helvetica").fontSize(10);
    doc.text(`${t.date} ${certificateDate(c.completedAt)}`, 80, metaY, { width: (w - 160) / 2, lineBreak: false });
    doc.text(`${t.number} ${c.number}`, w / 2, metaY, { width: (w - 160) / 2, align: "right", lineBreak: false });
    doc.end();
  });
}
