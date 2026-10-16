import type { FastifyBaseLogger } from "fastify";
import { Resend } from "resend";

/** Image jointe affichée dans le message (logo du parti), référencée en HTML par « cid:<contentId> ». */
export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  contentId: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Nom affiché comme expéditeur (le parti, ou civora) ; l'adresse reste celle de la plateforme. */
  fromName?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

/** « Nom <adresse> » ; le nom est nettoyé (guillemets, chevrons, retours à la ligne) avant d'être cité. */
export function formatFrom(defaultFrom: string, name?: string): string {
  if (!name) return defaultFrom;
  const address = /<([^>]+)>/.exec(defaultFrom)?.[1] ?? defaultFrom.trim();
  const clean = name
    .replace(/[\r\n"<>\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);
  return clean ? `"${clean}" <${address}>` : defaultFrom;
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
    const { error } = await this.client.emails.send({
      from: formatFrom(this.from, m.fromName),
      to: m.to,
      subject: m.subject,
      text: m.text,
      ...(m.html ? { html: m.html } : {}),
      ...(m.replyTo ? { replyTo: m.replyTo } : {}),
      ...(m.attachments?.length
        ? {
            attachments: m.attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              contentType: a.contentType,
              inlineContentId: a.contentId,
            })),
          }
        : {}),
    });
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
