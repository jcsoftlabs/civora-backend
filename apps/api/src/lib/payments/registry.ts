import { FakeProvider } from "./fake.js";
import { MonCashProvider } from "./moncash.js";
import { PendingProvider } from "./pending.js";
import type { PaymentProvider, ProviderId } from "./types.js";

/** Fournisseurs disponibles. Le faux fournisseur n'existe jamais en production. */
export function buildPaymentProviders(nodeEnv: string): Partial<Record<ProviderId, PaymentProvider>> {
  return {
    moncash: new MonCashProvider(),
    natcash: new PendingProvider("natcash"),
    kashpaw: new PendingProvider("kashpaw"),
    ...(nodeEnv === "production" ? {} : { fake: new FakeProvider() }),
  };
}
