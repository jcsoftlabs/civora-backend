// VOT-09 : procès-verbal de dépouillement, A4. Règles du scrutin, participation, voix par candidat et par tour,
// issue, empreinte du journal des bulletins (pour vérification), état de la certification, lignes de signature.
import PDFDocument from "pdfkit";
import type { MessageLocale } from "../../lib/messaging/templates.js";
import { issuedAt } from "../money/receipt-pdf.js";

type I18n = { fr: string; ht?: string | undefined };

const LABELS = {
  fr: {
    title: "Procès-verbal de dépouillement",
    zone: "Zone",
    national: "Nationale",
    post: "Poste",
    opened: "Ouverture",
    closed: "Clôture",
    method: "Mode de scrutin",
    methods: {
      simple_majority: "Majorité simple",
      two_rounds: "Deux tours",
      list: "Scrutin de liste",
      yes_no: "Question oui ou non",
    },
    seats: "Sièges à pourvoir",
    quorum: "Quorum",
    threshold: "Seuil de validité",
    none: "Aucun",
    round: "Tour",
    registered: "Inscrits",
    ballots: "Votants",
    blank: "Bulletins blancs",
    valid: "Suffrages exprimés",
    turnout: "Participation",
    candidate: "Candidat ou option",
    votes: "Voix",
    share: "Part",
    outcome: "Issue",
    reasons: {
      elected: "Élu",
      runoff: "Second tour nécessaire",
      quorum_not_met: "Quorum non atteint : scrutin sans effet",
      threshold_not_met: "Seuil de validité non atteint",
      tie: "Égalité : à départager selon les statuts",
      rejected: "Proposition rejetée",
      no_votes: "Aucun bulletin",
    },
    approved: "Proposition adoptée",
    winners: "Élus",
    fingerprint: "Empreinte du journal des bulletins",
    fingerprintHelp:
      "Chaque votant peut retrouver l'empreinte de son code de reçu dans le journal publié. Cette empreinte résume le journal entier.",
    certified: "Résultats certifiés le",
    notCertified: "Résultats non encore certifiés",
    issued: "Édité le",
    signatures: ["Le président du bureau", "Le secrétaire", "L'assesseur"],
  },
  ht: {
    title: "Pwosè-vèbal depouyman",
    zone: "Zòn",
    national: "Nasyonal",
    post: "Pòs",
    opened: "Ouvèti",
    closed: "Fèmen",
    method: "Kalite vòt",
    methods: {
      simple_majority: "Majorite senp",
      two_rounds: "De tou",
      list: "Vòt pa lis",
      yes_no: "Kesyon wi oswa non",
    },
    seats: "Kantite plas",
    quorum: "Kowòm",
    threshold: "Sèy validite",
    none: "Okenn",
    round: "Tou",
    registered: "Enskri",
    ballots: "Votan",
    blank: "Bilten blan",
    valid: "Vòt ki konte",
    turnout: "Patisipasyon",
    candidate: "Kandida oswa opsyon",
    votes: "Vwa",
    share: "Pati",
    outcome: "Rezilta",
    reasons: {
      elected: "Eli",
      runoff: "Fò gen dezyèm tou",
      quorum_not_met: "Kowòm pa rive : vòt la pa gen efè",
      threshold_not_met: "Sèy validite pa rive",
      tie: "Egalite : pou depataje dapre lalwa entèn",
      rejected: "Pwopozisyon an rejte",
      no_votes: "Pa gen bilten",
    },
    approved: "Pwopozisyon an adopte",
    winners: "Eli",
    fingerprint: "Anprent jounal bilten yo",
    fingerprintHelp:
      "Chak votan ka jwenn anprent kòd resi li nan jounal ki pibliye a. Anprent sa a rezime tout jounal la.",
    certified: "Rezilta yo sètifye",
    notCertified: "Rezilta yo poko sètifye",
    issued: "Fèt",
    signatures: ["Prezidan biwo a", "Sekretè a", "Asesè a"],
  },
} as const;

const INK = "#1C1B19";
const INK_2 = "#6B6862";
const LINE = "#E4DFD6";

export interface MinutesView {
  partyName: string;
  title: I18n;
  kind: string;
  method: "simple_majority" | "two_rounds" | "list" | "yes_no";
  seats: number;
  quorumPercent: number | null;
  validityThresholdPercent: number | null;
  zoneName: string | null;
  post: { title: string; organ: string } | null;
  opensAt: Date;
  closesAt: Date;
  certifiedAt: Date | null;
  fingerprint: string;
  candidates: Array<{ id: string; label: unknown; position: number }>;
  results: Array<{
    round: number;
    registered: number;
    tally: unknown;
    outcome: unknown;
  }>;
}

const pick = (t: I18n, locale: MessageLocale) => (locale === "ht" && t.ht) || t.fr;
const pct = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`.replace(/\u202f/g, " ");

export function minutesPdf(m: MinutesView, locale: MessageLocale): Promise<Buffer> {
  const t = LABELS[locale];
  const label = new Map(m.candidates.map((c) => [c.id, pick(c.label as I18n, locale)]));
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: `${t.title} : ${pick(m.title, locale)}` } });
    const chunks: Buffer[] = [];
    doc.on("data", (b: Buffer) => chunks.push(b));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const left = 56;
    const width = doc.page.width - 112;

    doc.fillColor(INK_2).font("Helvetica").fontSize(10).text(m.partyName);
    doc.moveDown(0.4).fillColor(INK).font("Helvetica-Bold").fontSize(20).text(t.title);
    doc.moveDown(0.2).font("Helvetica").fontSize(14).text(pick(m.title, locale));
    doc.moveDown(0.8);

    const row = (k: string, v: string) => {
      const y = doc.y;
      doc.fillColor(INK_2).font("Helvetica").fontSize(10).text(k, left, y, { width: 170 });
      doc.fillColor(INK).text(v, left + 180, y, { width: width - 180 });
      doc.moveDown(0.25);
    };
    row(t.zone, m.zoneName ?? t.national);
    if (m.post) row(t.post, `${m.post.title} (${m.post.organ})`);
    row(t.opened, issuedAt(m.opensAt.toISOString()));
    row(t.closed, issuedAt(m.closesAt.toISOString()));
    row(t.method, t.methods[m.method]);
    if (m.method === "list") row(t.seats, String(m.seats));
    row(t.quorum, m.quorumPercent ? pct(m.quorumPercent) : t.none);
    row(t.threshold, m.validityThresholdPercent ? pct(m.validityThresholdPercent) : t.none);

    for (const r of m.results) {
      const tally = r.tally as {
        counts: Record<string, number>;
        ballots: number;
        blank: number;
        validVotes: number;
        turnoutPercent: number;
      };
      const outcome = r.outcome as { winners: string[]; reason: keyof typeof t.reasons };
      doc.moveDown(0.8);
      doc
        .fillColor(INK)
        .font("Helvetica-Bold")
        .fontSize(13)
        .text(m.results.length > 1 ? `${t.round} ${r.round}` : t.outcome, left);
      doc.moveDown(0.3);
      row(t.registered, String(r.registered));
      row(t.ballots, String(tally.ballots));
      row(t.blank, String(tally.blank));
      row(t.valid, String(tally.validVotes));
      row(t.turnout, pct(tally.turnoutPercent));

      // Tableau des voix, du plus grand nombre au plus petit.
      doc.moveDown(0.4);
      const head = doc.y;
      doc.fillColor(INK_2).font("Helvetica-Bold").fontSize(9);
      doc.text(t.candidate, left, head, { width: width - 160 });
      doc.text(t.votes, left + width - 150, head, { width: 70, align: "right" });
      doc.text(t.share, left + width - 70, head, { width: 70, align: "right" });
      doc
        .moveTo(left, doc.y + 3)
        .lineTo(left + width, doc.y + 3)
        .lineWidth(0.5)
        .stroke(LINE);
      doc.moveDown(0.5);
      const lines = Object.entries(tally.counts).sort((a, b) => b[1] - a[1]);
      for (const [id, n] of lines) {
        const y = doc.y;
        const won = outcome.winners.includes(id);
        doc
          .fillColor(INK)
          .font(won ? "Helvetica-Bold" : "Helvetica")
          .fontSize(10);
        doc.text(label.get(id) ?? "", left, y, { width: width - 160 });
        doc.text(String(n), left + width - 150, y, { width: 70, align: "right" });
        doc.text(tally.validVotes ? pct((n / tally.validVotes) * 100) : "0 %", left + width - 70, y, {
          width: 70,
          align: "right",
        });
        doc.moveDown(0.3);
      }
      doc.moveDown(0.4);
      const verdict =
        outcome.reason === "elected" && m.method === "yes_no"
          ? t.approved
          : outcome.reason === "elected"
            ? `${t.winners} : ${outcome.winners.map((w) => label.get(w) ?? "").join(", ")}`
            : t.reasons[outcome.reason];
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text(verdict, left, doc.y, { width });
    }

    doc.moveDown(1);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text(t.fingerprint, left, doc.y, { width });
    doc.font("Courier").fontSize(9).text(m.fingerprint, { width });
    doc.fillColor(INK_2).font("Helvetica").fontSize(9).text(t.fingerprintHelp, { width });
    doc.moveDown(0.6);
    doc
      .fillColor(INK)
      .font("Helvetica")
      .fontSize(10)
      .text(m.certifiedAt ? `${t.certified} ${issuedAt(m.certifiedAt.toISOString())}` : t.notCertified, { width });
    doc.text(`${t.issued} ${issuedAt(new Date().toISOString())}`, { width });

    // Signatures : trois filets en bas de page.
    if (doc.y > doc.page.height - 150) doc.addPage();
    const baseY = doc.page.height - 110;
    const slot = width / 3;
    t.signatures.forEach((s, i) => {
      const x = left + i * slot + 10;
      doc
        .moveTo(x, baseY)
        .lineTo(x + slot - 20, baseY)
        .lineWidth(0.6)
        .stroke(INK);
      doc
        .fillColor(INK_2)
        .font("Helvetica")
        .fontSize(9)
        .text(s, x, baseY + 5, { width: slot - 20, align: "center", lineBreak: false });
    });
    doc.end();
  });
}
