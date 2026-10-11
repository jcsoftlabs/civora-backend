import { createHash, createHmac } from "node:crypto";

/**
 * Signature AWS SigV4 pour l'API S3 (Cloudflare R2 la parle). Implémentation locale, sans SDK.
 * Vérifiée sur l'exemple officiel d'URL présignée d'AWS (test/sigv4.test.ts).
 */
export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string; // « auto » pour R2
}

const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const hmac = (key: Buffer | string, s: string) => createHmac("sha256", key).update(s).digest();

/** Encodage RFC 3986 exigé par SigV4 (les « / » du chemin sont conservés). */
export function uriEncode(s: string, keepSlash = false): string {
  return encodeURIComponent(s)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%2F/g, keepSlash ? "/" : "%2F");
}

function signingKey(c: S3Credentials, date: string) {
  return hmac(hmac(hmac(hmac(`AWS4${c.secretAccessKey}`, date), c.region), "s3"), "aws4_request");
}

function canonicalQuery(q: Record<string, string>) {
  return Object.keys(q)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(q[k]!)}`)
    .join("&");
}

export interface PresignInput {
  method: "GET" | "PUT" | "HEAD" | "DELETE";
  host: string;
  path: string; // /bucket/cle, non encodé
  expiresSeconds: number;
  /** En-têtes signés en plus de host (ex. content-type pour un PUT) : le client doit les envoyer à l'identique. */
  headers?: Record<string, string>;
  /** Paramètres supplémentaires (ex. response-content-disposition). */
  query?: Record<string, string>;
  now?: Date;
}

/** URL présignée : l'autorisation est dans la chaîne de requête, valable `expiresSeconds`. */
export function presignUrl(c: S3Credentials, i: PresignInput): string {
  const now = i.now ?? new Date();
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${c.region}/s3/aws4_request`;
  const headers: Record<string, string> = {
    host: i.host,
    ...Object.fromEntries(Object.entries(i.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v.trim()])),
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const query: Record<string, string> = {
    ...(i.query ?? {}),
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${c.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(i.expiresSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonical = [
    i.method,
    uriEncode(i.path, true),
    canonicalQuery(query),
    Object.keys(headers)
      .sort()
      .map((k) => `${k}:${headers[k]}\n`)
      .join(""),
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const signature = createHmac("sha256", signingKey(c, date)).update(toSign).digest("hex");
  return `https://${i.host}${uriEncode(i.path, true)}?${canonicalQuery(query)}&X-Amz-Signature=${signature}`;
}
