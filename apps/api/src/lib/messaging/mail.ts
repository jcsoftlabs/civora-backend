// Mise en page des e-mails : une seule charpente pour tous les envois, aux couleurs du parti qui écrit, ou de civora
// pour les messages de la plateforme. HTML en tableaux et styles en ligne (les messageries ignorent les feuilles de
// style), version texte construite à partir du même contenu. Tout texte reçu est échappé.
import type { EmailAttachment, EmailMessage } from "./email.js";
import type { MessageLocale } from "./templates.js";

export interface Brand {
  kind: "platform" | "party";
  name: string;
  /** Couleur principale, « #RRGGBB ». */
  color: string;
  /** Logo du parti, joint au message et affiché dans l'en-tête (cid). */
  logo?: { content: Buffer; contentType: string } | null;
}

export interface MailBody {
  /** Aperçu affiché par la messagerie à côté de l'objet. */
  preheader: string;
  heading: string;
  paragraphs: string[];
  /** Code à usage unique, présenté comme un billet. */
  code?: { label: string; value: string; hint?: string };
  facts?: { label: string; value: string }[];
  /** Montant mis en avant (reçu). */
  total?: { label: string; value: string };
  action?: { label: string; url: string };
  /** Paragraphes placés après le bouton. */
  after?: string[];
  /** Mise en garde, en petit sous un filet. */
  note?: string;
  signature?: string;
}

const INK = "#1C1B19";
const INK_2 = "#6B6862";
const PAPER = "#F3F0EA";
const LINE = "#E4DFD6";
const PETROL = "#0F6E66";
const FONT = "Figtree, 'Helvetica Neue', Helvetica, Arial, sans-serif";

export const PLATFORM_BRAND: Brand = { kind: "platform", name: "civora", color: PETROL };

const CHROME: Record<
  MessageLocale,
  { sentBy: (p: string) => string; platform: string; automatic: string; fallback: string }
> = {
  fr: {
    sentBy: (p) => `Message envoyé par ${p} avec civora.`,
    platform: "civora, la plateforme des partis et des associations d'Haïti. Un produit de CODESHELL LLC.",
    automatic: "Ce message est automatique : les réponses ne sont pas lues.",
    fallback: "Si le bouton ne s'ouvre pas, copiez ce lien dans votre navigateur :",
  },
  ht: {
    sentBy: (p) => `${p} voye mesaj sa a avèk civora.`,
    platform: "civora, platfòm pati ak asosyasyon Ayiti yo. Yon pwodwi CODESHELL LLC.",
    automatic: "Mesaj sa a otomatik : nou pa li repons yo.",
    fallback: "Si bouton an pa louvri, kopye lyen sa a nan navigatè w :",
  },
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/** Texte affiché : échappé, espace insécable avant les deux-points (jamais seuls en début de ligne). */
const txt = (s: string) => esc(s).replace(/ ([:;?])/g, "&nbsp;$1");

/** Seuls les liens web sont rendus cliquables. */
const safeUrl = (u: string) => (/^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : null);

const validColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : PETROL);

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

/** Texte posé sur la couleur du parti : blanc ou encre, le plus lisible des deux. */
export const onColor = (c: string) => (contrast(c, "#FFFFFF") >= 4.5 ? "#FFFFFF" : INK);
/** Couleur du parti utilisée comme texte sur blanc, sauf si elle est trop claire pour être lue. */
const inkOf = (c: string) => (contrast(c, "#FFFFFF") >= 4.5 ? c : INK);

const LOGO_CID = "logo";

function header(brand: Brand, siteUrl: string) {
  const name = `<span style="font-family:${FONT};font-size:17px;font-weight:600;color:${INK};letter-spacing:-0.01em;vertical-align:middle;">${esc(brand.name)}</span>`;
  if (brand.kind === "party") {
    if (brand.logo)
      return `<img src="cid:${LOGO_CID}" alt="${esc(brand.name)}" height="44" style="display:block;height:44px;width:auto;max-width:220px;border:0;">`;
    // Sans logo : l'initiale du parti sur sa couleur, puis son nom.
    const color = validColor(brand.color);
    const initial = esc((brand.name.trim()[0] ?? "").toUpperCase());
    return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td width="32" height="32" align="center" valign="middle" style="width:32px;height:32px;border-radius:9px;background:${color};font-family:${FONT};font-size:16px;font-weight:600;color:${onColor(color)};">${initial}</td>
      <td style="padding-left:10px;">${name}</td>
    </tr></table>`;
  }
  return `<img src="${esc(siteUrl)}/email/civora-mark.png" alt="" width="30" height="30" style="display:inline-block;width:30px;height:30px;border:0;vertical-align:middle;margin-right:8px;">${name}`;
}

function codeBlock(code: NonNullable<MailBody["code"]>, color: string) {
  // Le billet : bord pointillé à la couleur du parti, code en grand, lisible et facile à recopier.
  return `
<tr><td style="padding:8px 0 24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px dashed ${color};border-radius:14px;">
    <tr><td align="center" style="padding:20px 16px 18px;font-family:${FONT};">
      <div style="font-size:13px;color:${INK_2};margin-bottom:6px;">${txt(code.label)}</div>
      <div style="font-size:36px;line-height:1.1;font-weight:600;letter-spacing:0.18em;color:${INK};font-variant-numeric:tabular-nums;">${esc(code.value)}</div>
      ${code.hint ? `<div style="font-size:13px;color:${INK_2};margin-top:8px;">${txt(code.hint)}</div>` : ""}
    </td></tr>
  </table>
</td></tr>`;
}

function factsBlock(facts: NonNullable<MailBody["facts"]>, total: MailBody["total"], color: string) {
  const rows = facts
    .map(
      (f) => `
    <tr>
      <td width="44%" style="padding:10px 0;border-top:1px dashed ${LINE};font-family:${FONT};font-size:14px;color:${INK_2};vertical-align:top;">${txt(f.label)}</td>
      <td align="right" style="padding:10px 0 10px 16px;border-top:1px dashed ${LINE};font-family:${FONT};font-size:14px;color:${INK};font-weight:500;vertical-align:top;">${txt(f.value)}</td>
    </tr>`,
    )
    .join("");
  const head = total
    ? `
    <tr><td colspan="2" style="padding:0 0 14px;font-family:${FONT};">
      <div style="font-size:13px;color:${INK_2};">${txt(total.label)}</div>
      <div style="font-size:30px;line-height:1.15;font-weight:600;color:${inkOf(color)};font-variant-numeric:tabular-nums;letter-spacing:-0.01em;">${txt(total.value)}</div>
    </td></tr>`
    : "";
  return `
<tr><td style="padding:4px 0 20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${head}${rows}
    <tr><td colspan="2" style="border-top:1px dashed ${LINE};font-size:0;line-height:0;">&nbsp;</td></tr>
  </table>
</td></tr>`;
}

function actionBlock(action: NonNullable<MailBody["action"]>, color: string, fallback: string) {
  const url = safeUrl(action.url);
  if (!url) return "";
  return `
<tr><td style="padding:8px 0 24px;">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="border-radius:10px;background:${color};">
      <a href="${esc(url)}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:16px;font-weight:600;color:${onColor(color)};text-decoration:none;border-radius:10px;">${txt(action.label)}</a>
    </td>
  </tr></table>
  <div style="font-family:${FONT};font-size:12px;line-height:1.5;color:${INK_2};margin-top:14px;">${txt(fallback)}<br><a href="${esc(url)}" style="color:${INK_2};word-break:break-all;">${esc(url)}</a></div>
</td></tr>`;
}

const para = (p: string) =>
  `<tr><td style="padding:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK};">${txt(p).replace(/\n/g, "<br>")}</td></tr>`;

export function renderMail(body: MailBody, brand: Brand, locale: MessageLocale, siteUrl: string) {
  const color = validColor(brand.color);
  const c = CHROME[locale];
  const footer =
    brand.kind === "party"
      ? `${txt(c.sentBy(brand.name))}<br>${txt(c.automatic)}`
      : `${txt(c.platform)}<br>${txt(c.automatic)}`;
  const html = `<!doctype html>
<html lang="${locale === "ht" ? "ht" : "fr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(body.heading)}</title>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${PAPER};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAPER};">${esc(body.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
    <tr><td style="padding:0 4px 20px;">${header(brand, siteUrl)}</td></tr>
    <tr><td style="background:#FFFFFF;border:1px solid ${LINE};border-top:4px solid ${color};border-radius:16px;padding:32px 32px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:0 0 18px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:600;color:${INK};letter-spacing:-0.02em;">${txt(body.heading)}</td></tr>
        ${body.paragraphs.map(para).join("")}
        ${body.code ? codeBlock(body.code, color) : ""}
        ${body.facts || body.total ? factsBlock(body.facts ?? [], body.total, color) : ""}
        ${body.action ? actionBlock(body.action, color, c.fallback) : ""}
        ${(body.after ?? []).map(para).join("")}
        ${body.signature ? para(body.signature) : ""}
        ${body.note ? `<tr><td style="padding:16px 0 20px;border-top:1px solid ${LINE};font-family:${FONT};font-size:13px;line-height:1.55;color:${INK_2};">${txt(body.note)}</td></tr>` : ""}
      </table>
    </td></tr>
    <tr><td align="center" style="padding:22px 12px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${INK_2};">${footer}<br><a href="${esc(siteUrl)}" style="color:${INK_2};text-decoration:underline;">${esc(siteUrl.replace(/^https?:\/\//, ""))}</a></td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  const lines: string[] = [body.heading, ""];
  for (const p of body.paragraphs) lines.push(p, "");
  if (body.code) {
    lines.push(`${body.code.label} : ${body.code.value}`);
    if (body.code.hint) lines.push(body.code.hint);
    lines.push("");
  }
  if (body.total) lines.push(`${body.total.label} : ${body.total.value}`);
  for (const f of body.facts ?? []) lines.push(`${f.label} : ${f.value}`);
  if (body.total || body.facts?.length) lines.push("");
  if (body.action && safeUrl(body.action.url)) lines.push(`${body.action.label} : ${body.action.url}`, "");
  for (const p of body.after ?? []) lines.push(p, "");
  if (body.signature) lines.push(body.signature, "");
  if (body.note) lines.push(body.note, "");
  lines.push("--", brand.kind === "party" ? c.sentBy(brand.name) : c.platform, c.automatic);
  return { html, text: lines.join("\n") };
}

/** Adresse publique du site commercial : images de l'en-tête et lien du pied de page. */
let siteUrl = "https://www.civora.space";
export function configureMail(opts: { siteUrl: string }) {
  siteUrl = opts.siteUrl.replace(/\/$/, "");
}

/** Message prêt à l'envoi : objet, HTML, texte, nom d'expéditeur et logo joint. */
export function composeMail(p: {
  to: string;
  subject: string;
  body: MailBody;
  brand: Brand;
  locale: MessageLocale;
  replyTo?: string;
}): EmailMessage {
  const { html, text } = renderMail(p.body, p.brand, p.locale, siteUrl);
  const attachments: EmailAttachment[] =
    p.brand.kind === "party" && p.brand.logo
      ? [
          {
            filename: `logo.${p.brand.logo.contentType === "image/png" ? "png" : p.brand.logo.contentType === "image/gif" ? "gif" : "jpg"}`,
            content: p.brand.logo.content,
            contentType: p.brand.logo.contentType,
            contentId: LOGO_CID,
          },
        ]
      : [];
  return {
    to: p.to,
    subject: p.subject,
    text,
    html,
    fromName: p.brand.name,
    ...(attachments.length ? { attachments } : {}),
    ...(p.replyTo ? { replyTo: p.replyTo } : {}),
  };
}
