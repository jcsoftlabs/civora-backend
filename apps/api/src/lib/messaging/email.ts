import type { FastifyBaseLogger } from "fastify";
import { Resend } from "resend";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Envoi d'e-mails. Canal par défaut du code de connexion : gratuit pour le parti. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** Resend (production). */
export class ResendEmailSender implements EmailSender {
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async send(m: EmailMessage): Promise<void> {
    const { error } = await this.client.emails.send({ from: this.from, to: m.to, subject: m.subject, text: m.text });
    if (error) throw new Error(`envoi e-mail refusé : ${error.name}`);
  }
}

/**
 * Développement : écrit le message dans les journaux au lieu de l'envoyer.
 * Refusé en production (le code de connexion ne doit jamais apparaître dans les journaux).
 */
export class LogEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  constructor(private readonly log?: FastifyBaseLogger) {
    if (process.env.NODE_ENV === "production") throw new Error("LogEmailSender interdit en production");
  }

  async send(m: EmailMessage): Promise<void> {
    this.sent.push(m);
    this.log?.warn(
      { devEmail: { to: "[masqué]", subject: m.subject, text: m.text } },
      "e-mail de développement (non envoyé)",
    );
  }
}
