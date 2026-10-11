// Textes envoyés aux personnes (e-mail, SMS) : jamais en dur dans le code d'envoi. fr et ht ; créole à faire relire.
export type MessageLocale = "fr" | "ht";

interface OtpMessage {
  subject: (party: string) => string;
  signupSubject: (party: string) => string;
  signupText: (party: string, code: string) => string;
  text: (party: string, code: string) => string;
  sms: (party: string, code: string) => string;
}

export const OTP_MESSAGES: Record<MessageLocale, OtpMessage> = {
  fr: {
    subject: (party) => `Votre code de connexion ${party}`,
    signupSubject: (party) => `Votre code d'adhésion à ${party}`,
    signupText: (party, code) =>
      `Pour confirmer votre adhésion à ${party}, saisissez ce code : ${code}\n\nIl expire dans 10 minutes. ` +
      `Ne le communiquez à personne.\n\nSi vous n'avez pas demandé à adhérer, ignorez ce message.`,
    text: (party, code) =>
      `Votre code de connexion à ${party} : ${code}\n\nIl expire dans 10 minutes. Ne le communiquez à personne, ` +
      `même à un responsable du parti.\n\nSi vous n'avez pas demandé ce code, ignorez ce message.`,
    sms: (party, code) => `${party} : votre code est ${code}. Il expire dans 10 minutes. Ne le donnez à personne.`,
  },
  ht: {
    subject: (party) => `Kòd koneksyon ${party} ou`,
    signupSubject: (party) => `Kòd pou w vin manm ${party}`,
    signupText: (party, code) =>
      `Pou w konfime ou vle vin manm ${party}, antre kòd sa a : ${code}\n\nLi ap ekspire nan 10 minit. ` +
      `Pa bay pèsonn li.\n\nSi se pa ou ki mande sa, pa okipe mesaj la.`,
    text: (party, code) =>
      `Kòd koneksyon ou pou ${party} : ${code}\n\nLi ap ekspire nan 10 minit. Pa bay pèsonn li, ` +
      `menm yon responsab pati a.\n\nSi se pa ou ki mande kòd sa a, pa okipe mesaj la.`,
    sms: (party, code) => `${party} : kòd ou se ${code}. L ap ekspire nan 10 minit. Pa bay pèsonn li.`,
  },
};

export function messageLocale(locale: string | null | undefined): MessageLocale {
  return locale === "ht" ? "ht" : "fr";
}

interface ApplicationMessage {
  approvedSubject: (party: string) => string;
  approvedText: (party: string, number: string) => string;
  rejectedSubject: (party: string) => string;
  rejectedText: (party: string) => string;
}

/** Décision sur une adhésion (ADH-06). Le motif d'un rejet n'est jamais envoyé : il reste interne au parti. */
export const APPLICATION_MESSAGES: Record<MessageLocale, ApplicationMessage> = {
  fr: {
    approvedSubject: (party) => `Votre adhésion à ${party} est validée`,
    approvedText: (party, number) =>
      `Bienvenue. Votre adhésion à ${party} est validée.\n\nVotre numéro de membre : ${number}\n\n` +
      `Ouvrez l'application pour retrouver votre carte et les prochains rassemblements.`,
    rejectedSubject: (party) => `Votre demande d'adhésion à ${party}`,
    rejectedText: (party) =>
      `Votre demande d'adhésion à ${party} n'a pas été retenue.\n\n` +
      `Pour en savoir plus, contactez le responsable de votre section.`,
  },
  ht: {
    approvedSubject: (party) => `Yo valide adezyon ou nan ${party}`,
    approvedText: (party, number) =>
      `Byenvini. Yo valide adezyon ou nan ${party}.\n\nNimewo manm ou : ${number}\n\n` +
      `Louvri aplikasyon an pou w jwenn kat ou ak pwochen rasanbleman yo.`,
    rejectedSubject: (party) => `Demann adezyon ou nan ${party}`,
    rejectedText: (party) =>
      `Yo pa aksepte demann adezyon ou nan ${party}.\n\n` + `Pou plis enfòmasyon, kontakte responsab seksyon ou.`,
  },
};

interface ReceiptMessage {
  subject: (party: string, number: string) => string;
  text: (p: {
    party: string;
    number: string;
    amount: string;
    method: string;
    periods: string;
    recordedBy: string;
  }) => string;
  methods: Record<string, string>;
}

/** Reçu de paiement (FIN-10). */
export const RECEIPT_MESSAGES: Record<MessageLocale, ReceiptMessage> = {
  fr: {
    subject: (party, number) => `${party} : reçu de paiement n° ${number}`,
    text: (p) =>
      `Merci. Votre paiement a bien été enregistré.\n\nReçu n° ${p.number}\nMontant : ${p.amount}\nMode : ${p.method}\n` +
      `Cotisations réglées : ${p.periods}\nEnregistré par : ${p.recordedBy}\n\n` +
      `Ce reçu est aussi disponible dans l'application. Conservez-le.\n${p.party}`,
    methods: { cash: "espèces", moncash: "MonCash", natcash: "NatCash", kashpaw: "KashPaw", stripe: "carte" },
  },
  ht: {
    subject: (party, number) => `${party} : resi peman nimewo ${number}`,
    text: (p) =>
      `Mèsi. Yo anrejistre peman ou.\n\nResi nimewo ${p.number}\nKantite : ${p.amount}\nFason ou peye : ${p.method}\n` +
      `Kotizasyon ou peye : ${p.periods}\nMoun ki anrejistre l : ${p.recordedBy}\n\n` +
      `Resi sa a disponib tou nan aplikasyon an. Kenbe l.\n${p.party}`,
    methods: { cash: "lajan kach", moncash: "MonCash", natcash: "NatCash", kashpaw: "KashPaw", stripe: "kat" },
  },
};
