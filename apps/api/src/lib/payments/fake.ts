import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  Checkout,
  CheckoutRequest,
  PaymentProvider,
  ProviderCredentials,
  VerifiedPayment,
  VerifyHint,
} from "./types.js";

/**
 * Faux fournisseur pour le développement et les tests, en attendant les accès sandbox MonCash, NatCash,
 * KashPaw. Il se comporte comme un vrai : lien de paiement, notification signée (HMAC), relecture de l'état.
 * Refusé en production.
 */
export class FakeProvider implements PaymentProvider {
  readonly id = "fake" as const;
  readonly currencies = ["HTG"] as const;
  /** État côté « fournisseur » : orderId -> paiement. Les tests le pilotent comme le ferait le payeur. */
  readonly ledger = new Map<string, { amount: string; status: VerifiedPayment["status"]; transactionId: string }>();

  constructor() {
    if (process.env.NODE_ENV === "production") throw new Error("FakeProvider interdit en production");
  }

  async createCheckout(_c: ProviderCredentials, req: CheckoutRequest): Promise<Checkout> {
    const transactionId = `fake-${req.orderId.slice(0, 8)}`;
    this.ledger.set(req.orderId, { amount: req.amount, status: "pending", transactionId });
    return { redirectUrl: `https://fake-pay.invalid/pay?order=${req.orderId}`, providerRef: transactionId };
  }

  /** Ce que ferait le payeur sur son téléphone. `amount` permet de simuler un montant falsifié. */
  complete(orderId: string, status: "succeeded" | "failed", amount?: string) {
    const p = this.ledger.get(orderId);
    if (!p) throw new Error("commande inconnue du faux fournisseur");
    this.ledger.set(orderId, { ...p, status, amount: amount ?? p.amount });
  }

  async verify(_c: ProviderCredentials, hint: VerifyHint): Promise<VerifiedPayment> {
    const orderId =
      hint.orderId ?? [...this.ledger.entries()].find(([, v]) => v.transactionId === hint.transactionId)?.[0] ?? "";
    const p = this.ledger.get(orderId);
    if (!p) return { orderId, providerRef: null, status: "failed", amount: null };
    return { orderId, providerRef: p.transactionId, status: p.status, amount: p.amount };
  }

  static sign(secret: string, body: string) {
    return createHmac("sha256", secret).update(body).digest("hex");
  }

  parseNotification(
    c: ProviderCredentials,
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): VerifyHint {
    const given = Buffer.from(String(headers["x-fake-signature"] ?? ""), "utf8");
    const expected = Buffer.from(FakeProvider.sign(c.webhookSecret ?? "", rawBody), "utf8");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error("signature invalide");
    const body = JSON.parse(rawBody) as { orderId?: string; transactionId?: string };
    return {
      ...(body.orderId ? { orderId: body.orderId } : {}),
      ...(body.transactionId ? { transactionId: body.transactionId } : {}),
    };
  }
}
