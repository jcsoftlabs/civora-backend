// Textes envoyés aux personnes (e-mail, SMS) : jamais en dur dans le code d'envoi. fr et ht ; créole à faire relire.
export type MessageLocale = "fr" | "ht";

interface OtpMessage {
  subject: (party: string) => string;
  text: (party: string, code: string) => string;
  sms: (party: string, code: string) => string;
}

export const OTP_MESSAGES: Record<MessageLocale, OtpMessage> = {
  fr: {
    subject: (party) => `Votre code de connexion ${party}`,
    text: (party, code) =>
      `Votre code de connexion à ${party} : ${code}\n\nIl expire dans 10 minutes. Ne le communiquez à personne, ` +
      `même à un responsable du parti.\n\nSi vous n'avez pas demandé ce code, ignorez ce message.`,
    sms: (party, code) => `${party} : votre code est ${code}. Il expire dans 10 minutes. Ne le donnez à personne.`,
  },
  ht: {
    subject: (party) => `Kòd koneksyon ${party} ou`,
    text: (party, code) =>
      `Kòd koneksyon ou pou ${party} : ${code}\n\nLi ap ekspire nan 10 minit. Pa bay pèsonn li, ` +
      `menm yon responsab pati a.\n\nSi se pa ou ki mande kòd sa a, pa okipe mesaj la.`,
    sms: (party, code) => `${party} : kòd ou se ${code}. L ap ekspire nan 10 minit. Pa bay pèsonn li.`,
  },
};

export function messageLocale(locale: string | null | undefined): MessageLocale {
  return locale === "ht" ? "ht" : "fr";
}
