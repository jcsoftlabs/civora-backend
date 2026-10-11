import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import type { VerifyClientCallbackAsync } from "ws";
import type { Config } from "./config.js";
import { randomBytes } from "node:crypto";
import { EntitlementsCache, fetchEntitlements } from "./lib/entitlements.js";
import { LazyKeyProvider } from "./lib/lazy-key-provider.js";
import { LogEmailSender, ResendEmailSender } from "./lib/messaging/email.js";
import { createSmsSender } from "./lib/messaging/sms.js";
import { PartyKeys } from "./lib/party-keys.js";
import authRoutes from "./modules/auth/routes.js";
import { AuthService } from "./modules/auth/service.js";
import auth from "./plugins/auth.js";
import { loggerOptions } from "./lib/logger.js";
import { isAllowedOrigin } from "./lib/origins.js";
import errors from "./plugins/errors.js";
import tenant from "./plugins/tenant.js";

/** Construit l'application sans l'écouter : utilisé par server.ts et par les tests (app.inject). */
export interface AppDeps {
  entitlements?: EntitlementsCache;
  auth?: AuthService;
}

export async function buildApp(config: Config, deps: AppDeps = {}) {
  const app = Fastify({
    logger: loggerOptions(config.LOG_LEVEL),
    genReqId: () => randomUUID(),
    trustProxy: config.NODE_ENV === "production",
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
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin, config.API_ALLOWED_ORIGINS)),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    maxAge: 600,
  });

  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" }); // SEC-09

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

  const authService =
    deps.auth ??
    new AuthService({
      // Hors production, un secret aléatoire par processus suffit (les codes en cours expirent au redémarrage).
      secret: config.AUTH_SECRET ? Buffer.from(config.AUTH_SECRET) : randomBytes(32),
      email: config.RESEND_API_KEY
        ? new ResendEmailSender(config.RESEND_API_KEY, config.RESEND_FROM)
        : new LogEmailSender(app.log),
      sms: createSmsSender(config.SMS_PROVIDER, app.log),
      keys: new PartyKeys(new LazyKeyProvider()),
    });
  await app.register(auth, { auth: authService });
  await app.register(authRoutes);

  app.get("/health", async () => ({ ok: true }));

  // Les modules sont enregistrés ici au fur et à mesure (voir apps/api/CLAUDE.md).

  return app;
}
