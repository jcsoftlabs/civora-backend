import type {
  Checkout,
  CheckoutRequest,
  PaymentProvider,
  ProviderCredentials,
  VerifiedPayment,
  VerifyHint,
} from "./types.js";

/**
 * MonCash (Digicel), API « MonCash Button » documentée publiquement. À VALIDER avec la sandbox du parti :
 * les chemins et la forme des réponses suivent la documentation, mais n'ont pas encore été testés en réel.
 *
 * Identifiants du parti : clientId, clientSecret, mode (sandbox | live).
 * Notification : MonCash rappelle l'« Alert URL » ou renvoie le payeur sur la « Return URL » avec transactionId,
 * sans signature. On ne lit donc que l'identifiant, puis on relit la transaction chez MonCash.
 */
const HOSTS = {
  sandbox: "https://sandbox.moncashbutton.digicelgroup.com",
  live: "https://moncashbutton.digicelgroup.com",
} as const;

export class MonCashProvider implements PaymentProvider {
  readonly id = "moncash" as const;
  readonly currencies = ["HTG"] as const;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  private host(c: ProviderCredentials) {
    return c.mode === "live" ? HOSTS.live : HOSTS.sandbox;
  }

  private async token(c: ProviderCredentials): Promise<string> {
    if (!c.clientId || !c.clientSecret) throw new Error("identifiants MonCash du parti manquants");
    const res = await this.fetchImpl(`${this.host(c)}/Api/oauth/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: "scope=read,write&grant_type=client_credentials",
    });
    if (!res.ok) throw new Error(`MonCash : jeton refusé (${res.status})`);
    return ((await res.json()) as { access_token: string }).access_token;
  }

  private async call<T>(c: ProviderCredentials, path: string, body: object): Promise<T> {
    const res = await this.fetchImpl(`${this.host(c)}/Api/v1/${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${await this.token(c)}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`MonCash : ${path} refusé (${res.status})`);
    return (await res.json()) as T;
  }

  async createCheckout(c: ProviderCredentials, req: CheckoutRequest): Promise<Checkout> {
    // MonCash attend un montant en gourdes ; l'identifiant de commande est notre identifiant de paiement.
    const r = await this.call<{ payment_token: { token: string } }>(c, "CreatePayment", {
      amount: Number(req.amount),
      orderId: req.orderId,
    });
    return {
      redirectUrl: `${this.host(c)}/Moncash-middleware/Payment/Redirect?token=${encodeURIComponent(r.payment_token.token)}`,
    };
  }

  async verify(c: ProviderCredentials, hint: VerifyHint): Promise<VerifiedPayment> {
    type R = { payment?: { reference?: string; transaction_id?: string; cost?: number; message?: string } };
    let r: R;
    try {
      r = hint.transactionId
        ? await this.call<R>(c, "RetrieveTransactionPayment", { transactionId: hint.transactionId })
        : await this.call<R>(c, "RetrieveOrderPayment", { orderId: hint.orderId });
    } catch {
      // Pas encore payé côté MonCash, ou indisponible : la vérification périodique réessaiera.
      return { orderId: hint.orderId ?? "", providerRef: null, status: "pending", amount: null };
    }
    const p = r.payment;
    const ok = p?.message?.toLowerCase() === "successful";
    return {
      orderId: p?.reference ?? hint.orderId ?? "",
      providerRef: p?.transaction_id ?? null,
      status: ok ? "succeeded" : "pending",
      amount: p?.cost !== undefined ? Number(p.cost).toFixed(2) : null,
    };
  }

  parseNotification(_c: ProviderCredentials, rawBody: string): VerifyHint {
    const body = (rawBody ? JSON.parse(rawBody) : {}) as { transactionId?: string; orderId?: string };
    return {
      ...(body.transactionId ? { transactionId: String(body.transactionId) } : {}),
      ...(body.orderId ? { orderId: String(body.orderId) } : {}),
    };
  }
}
