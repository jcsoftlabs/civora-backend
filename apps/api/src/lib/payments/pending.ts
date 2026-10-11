import { ProviderUnavailable, type PaymentProvider, type ProviderId } from "./types.js";

/**
 * NatCash (Natcom) et KashPaw : pas de documentation d'API publique à ce jour. L'adaptateur s'écrit sur le
 * modèle de MonCash dès que le parti obtient l'accès développeur ; d'ici là, le canal reste indisponible.
 */
export class PendingProvider implements PaymentProvider {
  readonly currencies = ["HTG"] as const;
  constructor(readonly id: ProviderId) {}
  async createCheckout(): Promise<never> {
    throw new ProviderUnavailable(this.id);
  }
  async verify(): Promise<never> {
    throw new ProviderUnavailable(this.id);
  }
  parseNotification(): never {
    throw new ProviderUnavailable(this.id);
  }
}
