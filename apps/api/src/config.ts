import { z } from "zod";

/** Configuration lue une seule fois au démarrage ; l'API refuse de démarrer si une valeur manque. */
const schema = z.object({
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
