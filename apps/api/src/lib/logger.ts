import type { FastifyServerOptions } from "fastify";

/**
 * Journalisation sans données personnelles (SEC-08, SEC-02).
 * - En-têtes d'authentification et cookies masqués.
 * - Chaîne de requête retirée des URL journalisées : elle peut contenir un téléphone ou un identifiant.
 * - Champs sensibles masqués à toute profondeur connue des objets journalisés.
 */
const SENSITIVE_KEYS = [
  "phone",
  "phoneE164",
  "phone_e164",
  "email",
  "otp",
  "code",
  "password",
  "token",
  "nin",
  "nif",
  "passport",
  "ssn",
  "valueEncrypted",
  "twoFactorSecret",
  "firstName",
  "lastName",
  "birthDate",
];

export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  ...SENSITIVE_KEYS.flatMap((k) => [k, `*.${k}`, `*.*.${k}`]),
];

export function stripQuery(url: string): string {
  const i = url.indexOf("?");
  return i === -1 ? url : url.slice(0, i);
}

export function loggerOptions(level: string): Exclude<NonNullable<FastifyServerOptions["logger"]>, boolean> {
  return {
    level,
    redact: { paths: REDACT_PATHS, censor: "[masqué]" },
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: stripQuery(req.url), ip: req.ip }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  };
}
