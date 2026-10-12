// ADH-13 : impression des cartes de membre au modèle du parti. Deux formats :
// - cr80 : une carte par page au format carte bancaire (85,6 × 54 mm), recto puis verso, pour les imprimantes de
//   cartes PVC (Evolis, Zebra, Fargo) ;
// - a4 : dix cartes par feuille avec traits de coupe ; les versos suivent sur une feuille aux colonnes inversées,
//   pour qu'ils tombent derrière leur recto en recto verso.
// Les images (fond, logo, photos, signature) sont lues par le serveur ; aucune n'est chargée depuis une adresse.
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { CardDesign, CardField } from "@civora/shared";
import type { MessageLocale } from "../../lib/messaging/templates.js";

type I18n = { fr: string; ht?: string | undefined };
export type CardImage = { body: Buffer; mimeType: string } | null;
export interface PrintedMember {
  name: string;
  number: string;
  zone: string | null;
  status: I18n | null;
  since: string | null;
  photo: CardImage;
  verifyUrl: string;
}
export interface CardSheet {
  partyName: string;
  brandColor: string;
  secondaryColor: string | null;
  logo: CardImage;
  background: CardImage;
  signature: CardImage;
  design: CardDesign & { fields: Record<CardField, boolean> };
  members: PrintedMember[];
  /** Année de validité affichée (mode « année civile »). */
  year: string;
}

const MM = 72 / 25.4;
const CR80 = { w: 85.6 * MM, h: 54 * MM };
const CREAM = "#F6E7C8";
const INK = "#1C1B19";
const BRIGHT = "#F2B84B";
const EMBEDDABLE = ["image/png", "image/jpeg"];

const LABELS = {
  fr: { card: "Carte de membre", number: "N°", since: "Membre depuis", valid: "Valable", until: "Valable jusqu'au" },
  ht: { card: "Kat manm", number: "Nimewo", since: "Manm depi", valid: "Valab", until: "Valab jiska" },
} as const;

const pick = (t: I18n | null | undefined, locale: MessageLocale) => (t ? (locale === "ht" && t.ht) || t.fr : null);
const ok = (img: CardImage): img is { body: Buffer; mimeType: string } => !!img && EMBEDDABLE.includes(img.mimeType);

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lum(hex: string) {
  const c = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
function mix(a: string, b: string, t: number) {
  const [p, q] = [rgb(a), rgb(b)];
  return `#${p
    .map((v, i) =>
      Math.round(v + (q[i]! - v) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
/** Même règle que la carte numérique : la couleur du parti assombrie jusqu'à 4,5:1 avec le texte crème. */
function cardColors(brand: string) {
  let bg = brand;
  if (contrast(bg, CREAM) < 4.5 && contrast(bg, INK) >= 4.5) return { bg, depth: mix(bg, "#000000", 0.18), text: INK };
  for (let i = 0; contrast(bg, CREAM) < 4.5 && i < 30; i++) bg = mix(bg, "#000000", 0.05);
  return { bg, depth: mix(bg, "#000000", 0.3), text: CREAM };
}

function hypotrochoid(R: number, r: number, d: number, cx: number, cy: number, scale: number, steps = 700) {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const turns = r / gcd(R, r);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI * turns;
    pts.push([
      cx + ((R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t)) * scale,
      cy + ((R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t)) * scale,
    ]);
  }
  return pts;
}

/** Dessine une face de carte à (x, y), taille w × h. */
async function drawSide(
  doc: PDFKit.PDFDocument,
  side: "front" | "back",
  x: number,
  y: number,
  w: number,
  h: number,
  s: CardSheet,
  m: PrintedMember,
  locale: MessageLocale,
) {
  const d = s.design;
  const t = LABELS[locale];
  const base = cardColors(d.background.color ?? s.brandColor);
  const text = d.textColor ?? base.text;
  const accent = d.accentColor ?? s.secondaryColor ?? BRIGHT;
  const u = w / CR80.w; // échelle (1 au format carte)
  const vertical = d.orientation === "vertical";

  doc.save();
  doc.rect(x, y, w, h).clip();
  doc.rect(x, y, w, h).fill(base.bg);
  if (d.background.kind === "image" && ok(s.background)) {
    try {
      doc.image(s.background.body, x, y, { cover: [w, h], align: "center", valign: "center" });
      doc.rect(x, y, w, h).fillOpacity(d.background.veil).fill("#000000").fillOpacity(1);
    } catch {
      // Image illisible : l'aplat reste.
    }
  }
  // Disque coupé par le bord et motif de sécurité, ton sur ton.
  doc
    .circle(x + w * 0.86, y + h * 1.02, w * 0.48)
    .fillOpacity(0.4)
    .fill(base.depth)
    .fillOpacity(1);
  if (d.pattern === "rosette") {
    const cx = x + w * 0.84;
    const cy = y + h * 0.98;
    const scale = (w * 0.9) / 340;
    for (const [R, r, dd, op] of [
      [100, 36, 62, 0.32],
      [100, 36, 44, 0.22],
      [90, 30, 30, 0.16],
    ] as const) {
      const pts = hypotrochoid(R, r, dd, cx, cy, scale);
      doc.moveTo(pts[0]![0], pts[0]![1]);
      for (const p of pts.slice(1)) doc.lineTo(p[0], p[1]);
      doc
        .lineWidth(0.25 * u)
        .strokeOpacity(op)
        .stroke(text)
        .strokeOpacity(1);
    }
  } else if (d.pattern === "waves") {
    for (let i = 0; i < 14; i++) {
      const yy = y + h * 0.12 + i * h * 0.06;
      doc.moveTo(x, yy);
      for (let xx = 0; xx <= w; xx += 3 * u)
        doc.lineTo(x + xx, yy + Math.sin((xx / w) * Math.PI * 3 + i * 0.5) * 6 * u);
      doc
        .lineWidth(0.25 * u)
        .strokeOpacity(0.25)
        .stroke(text)
        .strokeOpacity(1);
    }
  }
  // Filet intérieur.
  const inset = 5 * u;
  doc
    .roundedRect(x + inset, y + inset, w - 2 * inset, h - 2 * inset, 7 * u)
    .lineWidth(0.3 * u)
    .strokeOpacity(0.3)
    .stroke(text)
    .strokeOpacity(1);

  const pad = 12 * u;
  doc.fillColor(text);
  if (side === "front") {
    // En-tête : logo ou sceau, nom du parti, pastille de validité.
    let hx = x + pad;
    if (d.showLogo && ok(s.logo)) {
      try {
        doc.image(s.logo.body, hx, y + pad - 2 * u, { fit: [22 * u, 22 * u] });
        hx += 27 * u;
      } catch {
        // Logo illisible : le nom suffit.
      }
    }
    const validity =
      d.validity.mode === "year" ? s.year : d.validity.mode === "until" && d.validity.until ? d.validity.until : null;
    const pillW =
      validity && d.fields.validity
        ? doc
            .font("Helvetica-Bold")
            .fontSize(7 * u)
            .widthOfString(validity) +
          10 * u
        : 0;
    doc
      .font("Helvetica-Bold")
      .fontSize(9.5 * u)
      .text(s.partyName, hx, y + pad + 3 * u, {
        width: x + w - pad - hx - pillW - 4 * u,
        lineBreak: false,
        ellipsis: true,
      });
    if (pillW) {
      doc.roundedRect(x + w - pad - pillW, y + pad + 1 * u, pillW, 12 * u, 6 * u).fill(accent);
      doc
        .fillColor(contrast(accent, INK) > contrast(accent, "#FFFFFF") ? INK : "#FFFFFF")
        .fontSize(7 * u)
        .text(validity!, x + w - pad - pillW, y + pad + 3.6 * u, { width: pillW, align: "center", lineBreak: false });
      doc.fillColor(text);
    }

    // Photo à droite (carte) ou en haut (badge).
    const photoW = d.fields.photo ? (vertical ? 46 : 40) * u : 0;
    const photoH = photoW * 1.25;
    const px = vertical ? x + (w - photoW) / 2 : x + w - pad - photoW;
    const py = vertical ? y + 34 * u : y + 34 * u;
    if (d.fields.photo) {
      doc
        .roundedRect(px, py, photoW, photoH, 4 * u)
        .fillOpacity(0.18)
        .fill(text)
        .fillOpacity(1);
      if (ok(m.photo)) {
        try {
          doc.save();
          doc.roundedRect(px, py, photoW, photoH, 4 * u).clip();
          doc.image(m.photo.body, px, py, { cover: [photoW, photoH], align: "center", valign: "center" });
          doc.restore();
        } catch {
          // Photo illisible : le cadre reste, à compléter au feutre.
        }
      }
    }

    const left = x + pad;
    const textW = vertical ? w - 2 * pad : w - 2 * pad - photoW - 8 * u;
    let ty = vertical ? py + photoH + 8 * u : y + 38 * u;
    const title = pick(d.title, locale) ?? t.card;
    doc
      .font("Helvetica")
      .fontSize(6.5 * u)
      .fillOpacity(0.75)
      .text(title, left, ty, { width: textW, align: vertical ? "center" : "left" });
    doc.fillOpacity(1);
    ty += 9 * u;
    if (d.fields.number) {
      doc
        .font("Helvetica-Bold")
        .fontSize(19 * u)
        .text(m.number, left, ty, { width: textW, align: vertical ? "center" : "left", characterSpacing: 1 * u });
      ty += 24 * u;
    }
    doc
      .font("Helvetica-Bold")
      .fontSize(9.5 * u)
      .text(m.name, left, ty, { width: textW, align: vertical ? "center" : "left", lineBreak: false, ellipsis: true });
    ty += 12 * u;
    const lines = [
      d.fields.zone ? m.zone : null,
      d.fields.status ? pick(m.status, locale) : null,
      d.fields.since && m.since ? `${t.since} ${m.since}` : null,
    ].filter((v): v is string => !!v);
    doc
      .font("Helvetica")
      .fontSize(6.8 * u)
      .fillOpacity(0.85);
    for (const l of lines) {
      doc.text(l, left, ty, { width: textW, align: vertical ? "center" : "left", lineBreak: false, ellipsis: true });
      ty += 8.5 * u;
    }
    doc.fillOpacity(1);
    if (d.qrSide === "front") await qr(doc, m.verifyUrl, x + w - pad - 32 * u, y + h - pad - 32 * u, 32 * u);
    // Micro-texte au nom du parti, le long du bord.
    doc
      .font("Helvetica")
      .fontSize(2.6 * u)
      .fillOpacity(0.4)
      .text(`${s.partyName}  `.repeat(30), x + 8 * u, y + h - 7.5 * u, {
        width: w - 16 * u,
        height: 4 * u,
        lineBreak: false,
      });
    doc.fillOpacity(1);
  } else {
    const body = pick(d.back.text, locale);
    const qrSize = d.qrSide === "back" ? 46 * u : 0;
    const textW = w - 2 * pad - (qrSize ? qrSize + 10 * u : 0);
    doc
      .font("Helvetica-Bold")
      .fontSize(9 * u)
      .text(s.partyName, x + pad, y + pad, { width: textW });
    if (body)
      doc
        .font("Helvetica")
        .fontSize(6.5 * u)
        .text(body, x + pad, y + pad + 14 * u, { width: textW, height: h * 0.45, ellipsis: true });
    const sig = d.back.signatory;
    if (sig) {
      const sx = x + pad;
      const baseY = y + h - pad - 14 * u;
      if (ok(s.signature)) {
        try {
          doc.image(s.signature.body, sx, baseY - 24 * u, { fit: [70 * u, 22 * u], valign: "bottom" });
        } catch {
          // Signature illisible : le filet reste.
        }
      }
      doc
        .moveTo(sx, baseY)
        .lineTo(sx + 80 * u, baseY)
        .lineWidth(0.4 * u)
        .stroke(text);
      doc
        .font("Helvetica-Bold")
        .fontSize(6.5 * u)
        .text(sig.name, sx, baseY + 2 * u, { width: 110 * u, lineBreak: false });
      doc
        .font("Helvetica")
        .fontSize(5.8 * u)
        .text(pick(sig.role, locale) ?? "", sx, baseY + 9 * u, { width: 110 * u, lineBreak: false });
    }
    if (qrSize) await qr(doc, m.verifyUrl, x + w - pad - qrSize, y + (h - qrSize) / 2, qrSize);
  }
  doc.restore();
}

/** QR code de vérification, dessiné en carrés vectoriels sur fond blanc (net à toute taille). */
async function qr(doc: PDFKit.PDFDocument, value: string, x: number, y: number, size: number) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
  const n = modules.size;
  const quiet = 2;
  const cell = size / (n + quiet * 2);
  doc.roundedRect(x, y, size, size, cell).fill("#FFFFFF");
  doc.fillColor(INK);
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (modules.get(c, r)) doc.rect(x + (c + quiet) * cell, y + (r + quiet) * cell, cell + 0.05, cell + 0.05);
  doc.fill(INK);
}

/** Traits de coupe aux quatre coins d'une carte, hors de la carte. */
function cropMarks(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number) {
  const g = 3;
  const l = 8;
  doc.lineWidth(0.3).strokeColor("#000000");
  for (const [cx, cy, dx, dy] of [
    [x, y, -1, -1],
    [x + w, y, 1, -1],
    [x, y + h, -1, 1],
    [x + w, y + h, 1, 1],
  ] as const) {
    doc
      .moveTo(cx + dx * g, cy)
      .lineTo(cx + dx * (g + l), cy)
      .stroke();
    doc
      .moveTo(cx, cy + dy * g)
      .lineTo(cx, cy + dy * (g + l))
      .stroke();
  }
}

export async function cardsPdf(s: CardSheet, format: "cr80" | "a4", locale: MessageLocale): Promise<Buffer> {
  const vertical = s.design.orientation === "vertical";
  const card = vertical ? { w: CR80.h, h: CR80.w } : CR80;
  const back = s.design.back.enabled || s.design.qrSide === "back";
  const doc = new PDFDocument({
    autoFirstPage: false,
    margin: 0,
    info: { Title: `${LABELS[locale].card} : ${s.partyName}` },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (b: Buffer) => chunks.push(b));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  if (format === "cr80") {
    for (const m of s.members) {
      doc.addPage({ size: [card.w, card.h], margin: 0 });
      await drawSide(doc, "front", 0, 0, card.w, card.h, s, m, locale);
      if (back) {
        doc.addPage({ size: [card.w, card.h], margin: 0 });
        await drawSide(doc, "back", 0, 0, card.w, card.h, s, m, locale);
      }
    }
  } else {
    const page = { w: 595.28, h: 841.89 };
    const cols = Math.floor((page.w - 40) / card.w);
    const rows = Math.floor((page.h - 40) / card.h);
    const per = cols * rows;
    const ox = (page.w - cols * card.w) / 2;
    const oy = (page.h - rows * card.h) / 2;
    for (let i = 0; i < s.members.length; i += per) {
      const batch = s.members.slice(i, i + per);
      for (const side of back ? (["front", "back"] as const) : (["front"] as const)) {
        doc.addPage({ size: "A4", margin: 0 });
        for (const [k, m] of batch.entries()) {
          const r = Math.floor(k / cols);
          // Verso : colonnes inversées, pour tomber derrière le recto une fois la feuille retournée.
          const c = side === "back" ? cols - 1 - (k % cols) : k % cols;
          const x = ox + c * card.w;
          const y = oy + r * card.h;
          await drawSide(doc, side, x, y, card.w, card.h, s, m, locale);
          cropMarks(doc, x, y, card.w, card.h);
        }
      }
    }
  }
  doc.end();
  return done;
}
