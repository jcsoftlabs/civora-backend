/**
 * Services utilisés par les tâches de fond (apps/worker), construits comme dans l'API : le worker ne
 * réimplémente aucune règle métier.
 */
import type { FastifyBaseLogger } from "fastify";
// Extensions de types de requête (auth, tenant) : nécessaires aux services, sans code exécuté.
import type {} from "./plugins/auth.js";
import type {} from "./plugins/tenant.js";
import type { Config } from "./config.js";
import { EnvCredentialStore, type CredentialStore } from "./lib/payments/credentials.js";
import { buildPaymentProviders } from "./lib/payments/registry.js";
import type { PaymentProvider, ProviderId } from "./lib/payments/types.js";
import { DuesService } from "./modules/dues/service.js";
import { OnlinePayments } from "./modules/money/online.js";
import { PushService } from "./modules/communication/push.js";
import { buildPushSender } from "./lib/messaging/push-registry.js";
import type { PushSender } from "./lib/messaging/push.js";

export { loadConfig } from "./config.js";
export { DuesService } from "./modules/dues/service.js";
export { OnlinePayments } from "./modules/money/online.js";
export { FakeProvider } from "./lib/payments/fake.js";
export { MemoryCredentialStore } from "./lib/payments/credentials.js";
export { LogPushSender } from "./lib/messaging/push.js";

export interface JobServices {
  online: OnlinePayments;
  dues: DuesService;
  push: PushService;
}

export function createJobServices(
  config: Config,
  log: FastifyBaseLogger,
  overrides: {
    providers?: Partial<Record<ProviderId, PaymentProvider>>;
    credentials?: CredentialStore;
    push?: PushSender;
  } = {},
): JobServices {
  return {
    online: new OnlinePayments({
      providers: overrides.providers ?? buildPaymentProviders(config.NODE_ENV),
      credentials: overrides.credentials ?? new EnvCredentialStore(),
      publicUrl: config.API_PUBLIC_URL,
      log,
    }),
    dues: new DuesService(),
    push: new PushService(overrides.push ?? buildPushSender(config, log)),
  };
}
