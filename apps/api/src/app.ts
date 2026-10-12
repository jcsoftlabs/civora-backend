import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import type { VerifyClientCallbackAsync } from "ws";
import type { Config } from "./config.js";
import { randomBytes } from "node:crypto";
import type { KeyProvider } from "./lib/crypto.js";
import { EntitlementsCache, fetchEntitlements } from "./lib/entitlements.js";
import { LazyKeyProvider } from "./lib/lazy-key-provider.js";
import { LogEmailSender, ResendEmailSender, type EmailSender } from "./lib/messaging/email.js";
import { createSmsSender } from "./lib/messaging/sms.js";
import { PartyKeys } from "./lib/party-keys.js";
import auditRoutes from "./modules/audit/routes.js";
import authRoutes from "./modules/auth/routes.js";
import territoryRoutes from "./modules/territory/routes.js";
import organRoutes from "./modules/organs/routes.js";
import biRoutes from "./modules/bi/stats.js";
import engagementRoutes from "./modules/engagement/routes.js";
import { CardTemplateService } from "./modules/members/card-template.js";
import cardTemplateRoutes from "./modules/members/card-template-routes.js";
import trainingRoutes from "./modules/training/routes.js";
import voteRoutes from "./modules/votes/routes.js";
import partyRoutes from "./modules/parties/routes.js";
import { PartiesService } from "./modules/parties/service.js";
import fileRoutes from "./modules/files/routes.js";
import { FilesService } from "./modules/files/service.js";
import { buildStorage } from "./lib/storage/registry.js";
import type { ObjectStorage } from "./lib/storage/types.js";
import communicationRoutes from "./modules/communication/routes.js";
import duesRoutes from "./modules/dues/routes.js";
import { ConsoleAuth } from "./modules/console/auth.js";
import consoleRoutes from "./modules/console/routes.js";
import { ConsoleService } from "./modules/console/service.js";
import marketingRoutes from "./modules/marketing/routes.js";
import moneyRoutes from "./modules/money/routes.js";
import { PaymentsService } from "./modules/money/service.js";
import { OnlinePayments, type LocalProvider } from "./modules/money/online.js";
import { EnvCredentialStore, type CredentialStore } from "./lib/payments/credentials.js";
import { buildPaymentProviders } from "./lib/payments/registry.js";
import { buildPushSender } from "./lib/messaging/push-registry.js";
import type { PushSender } from "./lib/messaging/push.js";
import type { PaymentProvider } from "./lib/payments/types.js";
import { DuesService } from "./modules/dues/service.js";
import { ApplicationsService } from "./modules/members/applications.js";
import { MemberCardService } from "./modules/members/card.js";
import { IdentityService } from "./modules/members/identity.js";
import memberImportRoutes from "./modules/members/import/routes.js";
import { MemberImportService } from "./modules/members/import/service.js";
import memberRoutes from "./modules/members/routes.js";
import { MembersService } from "./modules/members/service.js";
import { AuthService } from "./modules/auth/service.js";
import auth from "./plugins/auth.js";
import { loggerOptions } from "./lib/logger.js";
import { isAllowedOrigin } from "./lib/origins.js";
import clientIp from "./plugins/client-ip.js";
import errors from "./plugins/errors.js";
import tenant from "./plugins/tenant.js";

/** Construit l'application sans l'écouter : utilisé par server.ts et par les tests (app.inject). */
export interface AppDeps {
  entitlements?: EntitlementsCache;
  /** Clé maîtresse (secrets de double authentification de la console) ; par défaut, celle de l'environnement. */
  masterKeys?: KeyProvider;
  auth?: AuthService;
  /** Partagées par l'authentification (2FA) et les pièces d'identité. */
  keys?: PartyKeys;
  email?: EmailSender;
  paymentProviders?: Partial<Record<LocalProvider, PaymentProvider>>;
  push?: PushSender;
  storage?: ObjectStorage;
  credentials?: CredentialStore;
}

export async function buildApp(config: Config, deps: AppDeps = {}) {
  const app = Fastify({
    logger: loggerOptions(config.LOG_LEVEL),
    genReqId: () => randomUUID(),
    // Nombre de proxys de l'hébergeur devant l'API : seule l'adresse qu'ils ajoutent est retenue.
    trustProxy: (_address: string, hop: number) => hop < config.TRUST_PROXY_HOPS,
    bodyLimit: 1024 * 1024, // 1 Mo ; les fichiers passent par des URL R2 signées
  });

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.id);
  });

  // API JSON uniquement : pas de contenu HTML servi, CSP la plus stricte.
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: "same-site" },
  });

  // SEC-08 : REST. Une origine absente (appel serveur à serveur, app mobile) n'obtient pas d'en-têtes CORS.
  await app.register(cors, {
    delegator: (req, cb) => {
      const origin = req.headers.origin;
      // Exception étroite, développement seulement : le stockage local (qui tient lieu de R2) reçoit les envois
      // directs du navigateur depuis l'adresse d'un parti (<slug>.localhost). En production, le navigateur
      // envoie à R2, dont les règles CORS sont réglées sur le compartiment ; la liste blanche de l'API reste exacte.
      const devStorage =
        config.NODE_ENV !== "production" &&
        req.url?.startsWith("/storage/local/") === true &&
        typeof origin === "string" &&
        /^http:\/\/[a-z0-9-]+\.localhost(:\d+)?$/.test(origin);
      cb(null, {
        origin: devStorage || isAllowedOrigin(origin, config.API_ALLOWED_ORIGINS),
        credentials: !devStorage,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        maxAge: 600,
      });
    },
  });

  await app.register(clientIp, { webSecret: config.WEB_SERVER_SECRET });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute", keyGenerator: (req) => req.clientIp }); // SEC-09

  // SEC-08 : temps réel. La poignée de main est refusée si l'origine du navigateur n'est pas dans la liste.
  // L'app mobile n'envoie pas d'en-tête Origin : elle est contrôlée par son jeton (voir realtime/, P2).
  await app.register(websocket, {
    options: {
      maxPayload: 64 * 1024,
      verifyClient: ((info, next) => {
        const origin = info.origin || info.req.headers.origin;
        next(origin === undefined || isAllowedOrigin(origin, config.API_ALLOWED_ORIGINS), 403);
      }) satisfies VerifyClientCallbackAsync,
    },
  });

  await app.register(errors);
  await app.register(tenant, { entitlements: deps.entitlements ?? new EntitlementsCache(fetchEntitlements) });

  const keys = deps.keys ?? new PartyKeys(new LazyKeyProvider());
  const emailSender = config.RESEND_API_KEY
    ? new ResendEmailSender(config.RESEND_API_KEY, config.RESEND_FROM)
    : new LogEmailSender(app.log);
  const authService =
    deps.auth ??
    new AuthService({
      // Hors production, un secret aléatoire par processus suffit (les codes en cours expirent au redémarrage).
      secret: config.AUTH_SECRET ? Buffer.from(config.AUTH_SECRET) : randomBytes(32),
      email: emailSender,
      sms: createSmsSender(config.SMS_PROVIDER, app.log),
      keys,
    });
  await app.register(auth, { auth: authService });
  await app.register(authRoutes);
  await app.register(auditRoutes);
  await app.register(territoryRoutes);
  await app.register(organRoutes);
  const filesService = new FilesService(deps.storage ?? buildStorage(config));
  const dues = new DuesService();
  await app.register(memberRoutes, {
    members: new MembersService(authService, new IdentityService(keys), dues),
    applications: new ApplicationsService(deps.email ?? emailSender, dues),
    cards: new MemberCardService(keys, authService, filesService.storage, config.WEB_PARTY_ORIGIN),
  });
  await app.register(memberImportRoutes, {
    imports: new MemberImportService({
      storage: filesService.storage,
      keys,
      identity: new IdentityService(keys),
      dues,
      email: deps.email ?? emailSender,
      partyOrigin: config.WEB_PARTY_ORIGIN,
    }),
  });
  await app.register(duesRoutes, { dues });
  await app.register(fileRoutes, { files: filesService });
  const partiesService = new PartiesService(authService, filesService);
  await app.register(partyRoutes, { parties: partiesService });
  await app.register(biRoutes);
  await app.register(trainingRoutes, { files: filesService });
  await app.register(voteRoutes);
  const cardTemplates = new CardTemplateService(keys, filesService.storage, config.WEB_PARTY_ORIGIN);
  await app.register(cardTemplateRoutes, { templates: cardTemplates });
  await app.register(engagementRoutes, {
    partyOrigin: (slug) => config.WEB_PARTY_ORIGIN.replace("{slug}", slug),
  });
  await app.register(communicationRoutes, { push: deps.push ?? buildPushSender(config, app.log), files: filesService });
  const providers = deps.paymentProviders ?? buildPaymentProviders(config.NODE_ENV);
  await app.register(moneyRoutes, {
    payments: new PaymentsService(deps.email ?? emailSender),
    online: new OnlinePayments({
      providers,
      credentials: deps.credentials ?? new EnvCredentialStore(),
      publicUrl: config.API_PUBLIC_URL,
      log: app.log,
    }),
  });

  await app.register(marketingRoutes, {
    email: deps.email ?? emailSender,
    ...(config.SALES_EMAIL
      ? { to: config.SALES_EMAIL }
      : config.NODE_ENV !== "production"
        ? { to: "ventes@civora.test" }
        : {}),
  });

  // Console de l'éditeur (SOC-10) : comptes du personnel, totaux de la plateforme, gestion des organisations.
  await app.register(consoleRoutes, {
    auth: new ConsoleAuth({
      secret: config.AUTH_SECRET ? Buffer.from(config.AUTH_SECRET) : randomBytes(32),
      email: deps.email ?? emailSender,
      keys: deps.masterKeys ?? new LazyKeyProvider(),
    }),
    service: new ConsoleService({
      email: deps.email ?? emailSender,
      entitlements: app.entitlements,
      partyOrigin: (slug) => config.WEB_PARTY_ORIGIN.replace("{slug}", slug),
    }),
    parties: partiesService,
    ...(config.WEB_SERVER_SECRET ? { webSecret: config.WEB_SERVER_SECRET } : {}),
    production: config.NODE_ENV === "production",
  });

  app.get("/health", async () => ({ ok: true }));

  // Les modules sont enregistrés ici au fur et à mesure (voir apps/api/CLAUDE.md).

  return app;
}
