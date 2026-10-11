import { createSign } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";

/** Notification push (COM-02). Le texte est déjà dans la langue du destinataire. */
export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushResult {
  sent: number;
  failed: number;
  /** Jetons que FCM déclare invalides (application désinstallée) : à supprimer. */
  invalidTokens: string[];
}

export interface PushSender {
  send(tokens: string[], message: PushMessage): Promise<PushResult>;
}

/** Développement et tests : n'envoie rien, garde les envois en mémoire. Jetons « invalid- » simulés invalides. */
export class LogPushSender implements PushSender {
  readonly sent: Array<{ tokens: string[]; message: PushMessage }> = [];
  constructor(private readonly log?: FastifyBaseLogger) {
    if (process.env.NODE_ENV === "production") throw new Error("LogPushSender interdit en production");
  }
  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    this.sent.push({ tokens, message });
    this.log?.warn({ devPush: { count: tokens.length, title: message.title } }, "push de développement (non envoyé)");
    const invalidTokens = tokens.filter((t) => t.startsWith("invalid-"));
    return { sent: tokens.length - invalidTokens.length, failed: invalidTokens.length, invalidTokens };
  }
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

/**
 * Firebase Cloud Messaging, API HTTP v1. Compte de service du projet Firebase (FCM_SERVICE_ACCOUNT, JSON) ;
 * jeton OAuth signé localement (RS256), renouvelé avant expiration.
 */
export class FcmPushSender implements PushSender {
  private token: { value: string; expires: number } | null = null;

  constructor(
    private readonly account: ServiceAccount,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  static fromEnv(raw: string): FcmPushSender {
    return new FcmPushSender(JSON.parse(raw) as ServiceAccount);
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
      iss: this.account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })}`;
    const signature = createSign("RSA-SHA256").update(unsigned).sign(this.account.private_key).toString("base64url");
    const res = await this.fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${signature}`,
      }),
    });
    if (!res.ok) throw new Error(`FCM : jeton refusé (${res.status})`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, expires: Date.now() + j.expires_in * 1000 };
    return j.access_token;
  }

  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    const auth = await this.accessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`;
    const result: PushResult = { sent: 0, failed: 0, invalidTokens: [] };
    // FCM v1 : un message par appareil ; envoi par lots de 20 en parallèle.
    for (let i = 0; i < tokens.length; i += 20) {
      await Promise.all(
        tokens.slice(i, i + 20).map(async (token) => {
          const res = await this.fetchImpl(url, {
            method: "POST",
            headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
            body: JSON.stringify({
              message: {
                token,
                notification: { title: message.title, body: message.body },
                ...(message.data ? { data: message.data } : {}),
              },
            }),
          });
          if (res.ok) return void result.sent++;
          result.failed++;
          // 404 UNREGISTERED ou 400 INVALID_ARGUMENT sur le jeton : appareil à oublier.
          if (res.status === 404 || res.status === 400) result.invalidTokens.push(token);
        }),
      );
    }
    return result;
  }
}
