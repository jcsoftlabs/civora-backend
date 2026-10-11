/**
 * Fournisseurs de paiement mobile en HTG (FIN-01). Chaque parti a ses propres comptes marchands (FIN-12) :
 * l'adaptateur reçoit toujours les identifiants DU PARTI, jamais ceux de la plateforme.
 *
 * Principe de sécurité : une notification du fournisseur n'est qu'un signal. L'état d'un paiement n'est
 * jamais pris dans la notification ; il est toujours relu auprès du fournisseur (verify) avec les
 * identifiants du parti, puis le montant et la commande sont comparés à ceux attendus.
 */
export type ProviderId = "moncash" | "natcash" | "kashpaw" | "fake";

export interface ProviderCredentials {
  [key: string]: string;
}

export interface CheckoutRequest {
  /** Identifiant de commande transmis au fournisseur : l'identifiant du paiement civora. */
  orderId: string;
  amount: string;
  currency: string;
  returnUrl: string;
}

export interface Checkout {
  redirectUrl: string;
  providerRef?: string;
}

/** Indice tiré d'une notification ou d'un retour navigateur : ce qu'il faut relire chez le fournisseur. */
export interface VerifyHint {
  orderId?: string;
  transactionId?: string;
}

export interface VerifiedPayment {
  orderId: string;
  providerRef: string | null;
  status: "succeeded" | "failed" | "pending";
  /** Montant réellement encaissé selon le fournisseur, chaîne décimale. */
  amount: string | null;
}

export interface PaymentProvider {
  readonly id: ProviderId;
  readonly currencies: readonly string[];
  createCheckout(credentials: ProviderCredentials, req: CheckoutRequest): Promise<Checkout>;
  verify(credentials: ProviderCredentials, hint: VerifyHint): Promise<VerifiedPayment>;
  /** Lit une notification entrante ; lève une erreur si le fournisseur la signe et que la signature est fausse. */
  parseNotification(
    credentials: ProviderCredentials,
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): VerifyHint;
}

export class ProviderUnavailable extends Error {}
