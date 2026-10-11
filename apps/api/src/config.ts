import { z } from "zod";

/** Configuration lue une seule fois au démarrage ; l'API refuse de démarrer si une valeur manque. */
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().positive().default(4000),
    API_HOST: z.string().default("0.0.0.0"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    // SEC-08 : liste blanche explicite, jamais « * ».
    API_ALLOWED_ORIGINS: z
      .string()
      .default("")
      .transform((s) =>
        s
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean),
      )
      .refine((list) => list.every((o) => o !== "*" && /^https?:\/\/[^/]+$/.test(o)), {
        message:
          "API_ALLOWED_ORIGINS : origines complètes (schéma et hôte, sans chemin), séparées par des virgules, jamais *",
      }),
    /** Protège les empreintes des codes de connexion. 32 caractères au moins ; obligatoire en production. */
    AUTH_SECRET: z.string().min(32).optional(),
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM: z.string().default("civora <notifications@civora.app>"),
    /** Boîte qui reçoit les demandes de démonstration du site commercial (SOC-12). */
    SALES_EMAIL: z.string().email().optional(),
    /** Fournisseur SMS de la plateforme : « none » en production tant qu'aucun n'est choisi, « log » en local. */
    SMS_PROVIDER: z.string().default("log"),
    /** Cloudflare R2 (stockage des fichiers). Absent en local : dossier .storage, même parcours d'URL signées. */
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    /** Compte de service Firebase (JSON) pour les notifications push ; absent en local : envois écrits au journal. */
    FCM_SERVICE_ACCOUNT: z.string().optional(),
    /** Adresse publique des espaces des partis ({slug} remplacé) : lien du QR de la carte de membre (ADH-11). */
    WEB_PARTY_ORIGIN: z.string().default("https://{slug}.civora.app"),
    /** Proxys de l'hébergeur devant l'API (Railway : 1). 0 en local : l'adresse de la connexion. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).optional(),
    /** Secret partagé avec le serveur web pour transmettre l'adresse IP de la personne (32 caractères au moins). */
    WEB_SERVER_SECRET: z.string().min(32).optional(),
    /** Adresse publique de l'API : liens de retour et de notification donnés aux fournisseurs de paiement. */
    API_PUBLIC_URL: z.string().url().default("http://localhost:4000"),
  })
  .transform((c) => ({ ...c, TRUST_PROXY_HOPS: c.TRUST_PROXY_HOPS ?? (c.NODE_ENV === "production" ? 1 : 0) }))
  .superRefine((c, ctx) => {
    if (c.NODE_ENV !== "production") return;
    if (!c.WEB_SERVER_SECRET)
      ctx.addIssue({ code: "custom", path: ["WEB_SERVER_SECRET"], message: "obligatoire en production" });
    if (!c.AUTH_SECRET) ctx.addIssue({ code: "custom", path: ["AUTH_SECRET"], message: "obligatoire en production" });
    if (!c.RESEND_API_KEY)
      ctx.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "obligatoire en production" });
    if (!c.R2_ACCOUNT_ID || !c.R2_ACCESS_KEY_ID || !c.R2_SECRET_ACCESS_KEY || !c.R2_BUCKET) {
      ctx.addIssue({ code: "custom", path: ["R2_BUCKET"], message: "stockage R2 obligatoire en production" });
    }
    if (c.SMS_PROVIDER === "log")
      ctx.addIssue({ code: "custom", path: ["SMS_PROVIDER"], message: "« log » interdit en production" });
  });

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join("\n");
    throw new Error(`Configuration invalide :\n${issues}`);
  }
  return parsed.data;
}
