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
import { configureBrands } from "./lib/messaging/brand.js";
import { configureMail } from "./lib/messaging/mail.js";
import { LogEmailSender, ResendEmailSender, type EmailSender } from "./lib/messaging/email.js";
import { LazyKeyProvider } from "./lib/lazy-key-provider.js";
import { PartyKeys } from "./lib/party-keys.js";
import { buildStorage } from "./lib/storage/registry.js";
import type { ObjectStorage } from "./lib/storage/types.js";
import { IdentityService } from "./modules/members/identity.js";
import { MemberImportService } from "./modules/members/import/service.js";

export { loadConfig } from "./config.js";
export { DuesService } from "./modules/dues/service.js";
export { OnlinePayments } from "./modules/money/online.js";
export { FakeProvider } from "./lib/payments/fake.js";
export { MemoryCredentialStore } from "./lib/payments/credentials.js";
export { LogPushSender } from "./lib/messaging/push.js";
export { MemberImportService } from "./modules/members/import/service.js";

export interface JobServices {
  online: OnlinePayments;
  dues: DuesService;
  push: PushService;
  imports: MemberImportService;
}

export function createJobServices(
  config: Config,
  log: FastifyBaseLogger,
  overrides: {
    providers?: Partial<Record<ProviderId, PaymentProvider>>;
    credentials?: CredentialStore;
    push?: PushSender;
    email?: EmailSender;
    storage?: ObjectStorage;
    keys?: PartyKeys;
  } = {},
): JobServices {
  const keys = overrides.keys ?? new PartyKeys(new LazyKeyProvider());
  const dues = new DuesService();
  const storage = overrides.storage ?? buildStorage(config);
  configureBrands(storage);
  configureMail({ siteUrl: config.PUBLIC_SITE_URL });
  return {
    online: new OnlinePayments({
      providers: overrides.providers ?? buildPaymentProviders(config.NODE_ENV),
      credentials: overrides.credentials ?? new EnvCredentialStore(),
      publicUrl: config.API_PUBLIC_URL,
      log,
    }),
    dues,
    push: new PushService(overrides.push ?? buildPushSender(config, log)),
    imports: new MemberImportService({
      storage,
      keys,
      identity: new IdentityService(keys),
      dues,
      email:
        overrides.email ??
        (config.RESEND_API_KEY
          ? new ResendEmailSender(config.RESEND_API_KEY, config.RESEND_FROM)
          : new LogEmailSender(log)),
      partyOrigin: config.WEB_PARTY_ORIGIN,
    }),
  };
}
