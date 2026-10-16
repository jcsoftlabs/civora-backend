// Textes envoyés aux personnes (e-mail, SMS) : jamais en dur dans le code d'envoi. fr et ht ; créole à faire relire.
// Chaque e-mail est décrit par son contenu (titre, paragraphes, code, détails, bouton) ; la mise en page est dans mail.ts.
import type { MailBody } from "./mail.js";

export type MessageLocale = "fr" | "ht";

export function messageLocale(locale: string | null | undefined): MessageLocale {
  return locale === "ht" ? "ht" : "fr";
}

export type OtpPurposeKey = "login" | "signup" | "party_signup";

interface OtpMessage {
  subject: Record<OtpPurposeKey, (party: string) => string>;
  body: Record<OtpPurposeKey, (party: string, code: string) => MailBody>;
  sms: (party: string, code: string) => string;
}

export const OTP_MESSAGES: Record<MessageLocale, OtpMessage> = {
  fr: {
    subject: {
      login: (party) => `Votre code de connexion ${party}`,
      signup: (party) => `Votre code d'adhésion à ${party}`,
      party_signup: (party) => `Créez l'espace ${party} sur civora`,
    },
    body: {
      login: (party, code) => ({
        preheader: `Votre code : ${code}. Il expire dans 10 minutes.`,
        heading: "Votre code de connexion",
        paragraphs: [`Saisissez ce code pour vous connecter à l'espace ${party}.`],
        code: { label: "Votre code", value: code, hint: "Il expire dans 10 minutes." },
        note:
          "Ne communiquez ce code à personne, même à un responsable du parti. " +
          "Si vous n'avez pas demandé ce code, ignorez ce message.",
      }),
      signup: (party, code) => ({
        preheader: `Votre code : ${code}. Il expire dans 10 minutes.`,
        heading: "Confirmez votre adhésion",
        paragraphs: [`Saisissez ce code pour confirmer votre adhésion à ${party}.`],
        code: { label: "Votre code", value: code, hint: "Il expire dans 10 minutes." },
        note: "Ne le communiquez à personne. Si vous n'avez pas demandé à adhérer, ignorez ce message.",
      }),
      party_signup: (party, code) => ({
        preheader: `Votre code : ${code}. Il expire dans 10 minutes.`,
        heading: "Confirmez la création de votre espace",
        paragraphs: [`Saisissez ce code pour confirmer la création de l'espace ${party} sur civora.`],
        code: { label: "Votre code", value: code, hint: "Il expire dans 10 minutes." },
        note:
          "Sans confirmation sous 24 heures, l'adresse choisie est libérée. " +
          "Si vous n'avez rien demandé, ignorez ce message.",
      }),
    },
    sms: (party, code) => `${party} : votre code est ${code}. Il expire dans 10 minutes. Ne le donnez à personne.`,
  },
  ht: {
    subject: {
      login: (party) => `Kòd koneksyon ${party} ou`,
      signup: (party) => `Kòd pou w vin manm ${party}`,
      party_signup: (party) => `Kreye espas ${party} sou civora`,
    },
    body: {
      login: (party, code) => ({
        preheader: `Kòd ou : ${code}. L ap ekspire nan 10 minit.`,
        heading: "Kòd koneksyon ou",
        paragraphs: [`Antre kòd sa a pou w konekte nan espas ${party}.`],
        code: { label: "Kòd ou", value: code, hint: "L ap ekspire nan 10 minit." },
        note:
          "Pa bay pèsonn kòd sa a, menm yon responsab pati a. " +
          "Si se pa ou ki mande kòd sa a, pa okipe mesaj la.",
      }),
      signup: (party, code) => ({
        preheader: `Kòd ou : ${code}. L ap ekspire nan 10 minit.`,
        heading: "Konfime adezyon ou",
        paragraphs: [`Antre kòd sa a pou w konfime ou vle vin manm ${party}.`],
        code: { label: "Kòd ou", value: code, hint: "L ap ekspire nan 10 minit." },
        note: "Pa bay pèsonn li. Si se pa ou ki mande sa, pa okipe mesaj la.",
      }),
      party_signup: (party, code) => ({
        preheader: `Kòd ou : ${code}. L ap ekspire nan 10 minit.`,
        heading: "Konfime kreyasyon espas ou",
        paragraphs: [`Antre kòd sa a pou w konfime kreyasyon espas ${party} sou civora.`],
        code: { label: "Kòd ou", value: code, hint: "L ap ekspire nan 10 minit." },
        note:
          "Si w pa konfime nan 24 èdtan, adrès ou chwazi a ap lib ankò. " +
          "Si se pa ou ki mande sa, pa okipe mesaj la.",
      }),
    },
    sms: (party, code) => `${party} : kòd ou se ${code}. L ap ekspire nan 10 minit. Pa bay pèsonn li.`,
  },
};

interface ApplicationMessage {
  approvedSubject: (party: string) => string;
  approved: (party: string, number: string) => MailBody;
  rejectedSubject: (party: string) => string;
  rejected: (party: string) => MailBody;
}

/** Décision sur une adhésion (ADH-06). Le motif d'un rejet n'est jamais envoyé : il reste interne au parti. */
export const APPLICATION_MESSAGES: Record<MessageLocale, ApplicationMessage> = {
  fr: {
    approvedSubject: (party) => `Votre adhésion à ${party} est validée`,
    approved: (party, number) => ({
      preheader: `Bienvenue. Votre numéro de membre : ${number}.`,
      heading: `Bienvenue dans ${party}`,
      paragraphs: [`Votre adhésion à ${party} est validée.`],
      facts: [{ label: "Numéro de membre", value: number }],
      after: ["Ouvrez l'application pour retrouver votre carte de membre et les prochains rassemblements."],
    }),
    rejectedSubject: (party) => `Votre demande d'adhésion à ${party}`,
    rejected: (party) => ({
      preheader: `Réponse à votre demande d'adhésion à ${party}.`,
      heading: "Votre demande d'adhésion",
      paragraphs: [
        `Votre demande d'adhésion à ${party} n'a pas été retenue.`,
        "Pour en savoir plus, contactez le responsable de votre section.",
      ],
    }),
  },
  ht: {
    approvedSubject: (party) => `Yo valide adezyon ou nan ${party}`,
    approved: (party, number) => ({
      preheader: `Byenvini. Nimewo manm ou : ${number}.`,
      heading: `Byenvini nan ${party}`,
      paragraphs: [`Yo valide adezyon ou nan ${party}.`],
      facts: [{ label: "Nimewo manm", value: number }],
      after: ["Louvri aplikasyon an pou w jwenn kat manm ou ak pwochen rasanbleman yo."],
    }),
    rejectedSubject: (party) => `Demann adezyon ou nan ${party}`,
    rejected: (party) => ({
      preheader: `Repons pou demann adezyon ou nan ${party}.`,
      heading: "Demann adezyon ou",
      paragraphs: [
        `Yo pa aksepte demann adezyon ou nan ${party}.`,
        "Pou plis enfòmasyon, kontakte responsab seksyon ou.",
      ],
    }),
  },
};

interface ReceiptMessage {
  subject: (party: string, number: string) => string;
  body: (p: { number: string; amount: string; method: string; periods: string; recordedBy: string }) => MailBody;
  methods: Record<string, string>;
}

/** Reçu de paiement (FIN-10). */
export const RECEIPT_MESSAGES: Record<MessageLocale, ReceiptMessage> = {
  fr: {
    subject: (party, number) => `${party} : reçu de paiement n° ${number}`,
    body: (p) => ({
      preheader: `Paiement de ${p.amount} enregistré. Reçu n° ${p.number}.`,
      heading: `Reçu n° ${p.number}`,
      paragraphs: ["Merci. Votre paiement a bien été enregistré."],
      total: { label: "Montant", value: p.amount },
      facts: [
        { label: "Mode de paiement", value: p.method },
        { label: "Cotisations réglées", value: p.periods },
        ...(p.recordedBy ? [{ label: "Enregistré par", value: p.recordedBy }] : []),
      ],
      after: ["Ce reçu est aussi disponible dans l'application. Conservez-le."],
    }),
    methods: { cash: "espèces", moncash: "MonCash", natcash: "NatCash", kashpaw: "KashPaw", stripe: "carte" },
  },
  ht: {
    subject: (party, number) => `${party} : resi peman nimewo ${number}`,
    body: (p) => ({
      preheader: `Yo anrejistre peman ${p.amount} ou. Resi nimewo ${p.number}.`,
      heading: `Resi nimewo ${p.number}`,
      paragraphs: ["Mèsi. Yo anrejistre peman ou."],
      total: { label: "Kantite", value: p.amount },
      facts: [
        { label: "Fason ou peye", value: p.method },
        { label: "Kotizasyon ou peye", value: p.periods },
        ...(p.recordedBy ? [{ label: "Moun ki anrejistre l", value: p.recordedBy }] : []),
      ],
      after: ["Resi sa a disponib tou nan aplikasyon an. Kenbe l."],
    }),
    methods: { cash: "lajan kach", moncash: "MonCash", natcash: "NatCash", kashpaw: "KashPaw", stripe: "kat" },
  },
};

/** ADH-09 : invitation d'un membre importé, par e-mail ou par un lien WhatsApp envoyé par un responsable. */
interface InviteMessage {
  subject: (party: string) => string;
  body: (v: { party: string; firstName: string; number: string; email: string; link: string }) => MailBody;
  whatsapp: (v: { party: string; firstName: string; number: string; link: string }) => string;
}

export const INVITE_MESSAGES: Record<MessageLocale, InviteMessage> = {
  fr: {
    subject: (party) => `${party} : votre espace de membre`,
    body: ({ party, firstName, number, email, link }) => ({
      preheader: `${party} vous a inscrit. Votre numéro de membre : ${number}.`,
      heading: "Votre espace de membre vous attend",
      paragraphs: [`Bonjour ${firstName},`, `${party} vous a inscrit dans son espace de membres sur civora.`],
      facts: [
        { label: "Numéro de membre", value: number },
        { label: "Adresse de connexion", value: email },
      ],
      action: { label: "Ouvrir mon espace", url: link },
      after: [
        "Votre carte de membre, les votes, les formations et les rassemblements sont dans l'application civora. " +
          "Connectez-vous avec cette adresse e-mail : aucun mot de passe, un code vous sera envoyé.",
      ],
      note: `Si vous ne connaissez pas ${party}, ignorez ce message.`,
    }),
    whatsapp: ({ party, firstName, number, link }) =>
      `Bonjour ${firstName}, ${party} vous a inscrit dans son espace de membres sur civora (membre n° ${number}). ` +
      `Ouvrez l'application civora et connectez-vous avec votre adresse e-mail pour retrouver votre carte : ${link}`,
  },
  ht: {
    subject: (party) => `${party} : espas manm ou`,
    body: ({ party, firstName, number, email, link }) => ({
      preheader: `${party} enskri w. Nimewo manm ou : ${number}.`,
      heading: "Espas manm ou ap tann ou",
      paragraphs: [`Bonjou ${firstName},`, `${party} enskri w nan espas manm li sou civora.`],
      facts: [
        { label: "Nimewo manm", value: number },
        { label: "Adrès pou konekte", value: email },
      ],
      action: { label: "Louvri espas mwen", url: link },
      after: [
        "Kat manm ou, vòt yo, fòmasyon yo ak rasanbleman yo nan aplikasyon civora a. " +
          "Konekte ak adrès imel sa a : pa gen modpas, y ap voye yon kòd ba ou.",
      ],
      note: `Si ou pa konnen ${party}, pa okipe mesaj la.`,
    }),
    whatsapp: ({ party, firstName, number, link }) =>
      `Bonjou ${firstName}, ${party} enskri w nan espas manm li sou civora (manm nimewo ${number}). ` +
      `Louvri aplikasyon civora a epi konekte ak adrès imel ou pou w jwenn kat ou : ${link}`,
  },
};
