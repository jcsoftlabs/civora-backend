import type { FastifyBaseLogger } from "fastify";

/**
 * Adaptateur SMS. Le SMS est payant : chaque parti décide s'il l'active (parties.otp_channels, COM-03)
 * et avec quel fournisseur. Ajouter un fournisseur = une classe qui implémente SmsSender, déclarée dans createSmsSender.
 * Chaque envoi est compté pour la facturation à l'usage (usage_snapshots.sms_sent, SOC-08).
 */
export interface SmsSender {
  readonly provider: string;
  /** `to` au format E.164 (+509...). */
  send(to: string, text: string): Promise<void>;
}

/** Développement et tests : n'envoie rien, garde les messages en mémoire. Refusé en production. */
export class LogSmsSender implements SmsSender {
  readonly provider = "log";
  readonly sent: Array<{ to: string; text: string }> = [];

  constructor(private readonly log?: FastifyBaseLogger) {
    if (process.env.NODE_ENV === "production") throw new Error("LogSmsSender interdit en production");
  }

  async send(to: string, text: string): Promise<void> {
    this.sent.push({ to, text });
    this.log?.warn({ devSms: { to: "[masqué]", text } }, "SMS de développement (non envoyé)");
  }
}

/** Aucun fournisseur configuré : le canal SMS reste indisponible tant qu'un parti ne l'a pas mis en place. */
export class DisabledSmsSender implements SmsSender {
  readonly provider = "none";
  async send(): Promise<void> {
    throw new Error("aucun fournisseur SMS configuré");
  }
}

/** Fournisseurs disponibles. Les identifiants viennent du gestionnaire de secrets, jamais du code. */
export function createSmsSender(provider: string, log?: FastifyBaseLogger): SmsSender {
  switch (provider) {
    case "none":
      return new DisabledSmsSender();
    case "":
    case "log":
      return new LogSmsSender(log);
    default:
      // À brancher quand un parti choisit son fournisseur (Twilio, passerelle Digicel ou Natcom, agrégateur local).
      throw new Error(`Fournisseur SMS non pris en charge : ${provider}`);
  }
}
