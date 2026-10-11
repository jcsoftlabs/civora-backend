import { env } from "$env/dynamic/private";
import { env as pub } from "$env/dynamic/public";

/** Appel de l'API depuis le serveur SvelteKit (jamais depuis le navigateur : pas de CORS, jeton en cookie httpOnly). */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly requiredTier?: string,
  ) {
    super(code);
  }
}

const base = () => env.API_INTERNAL_URL || pub.PUBLIC_API_URL || "http://localhost:4000";

/**
 * `ip` : adresse de la personne (event.getClientAddress()). Transmise avec le secret partagé WEB_SERVER_SECRET,
 * elle sert à l'API pour la limitation du débit et le journal ; sans elle, tout le site partagerait une adresse.
 */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; token?: string; ip?: string } = {},
): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      ...(init.ip && env.WEB_SERVER_SECRET
        ? { "x-civora-web": env.WEB_SERVER_SECRET, "x-civora-client-ip": init.ip }
        : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as { code?: string; requiredTier?: string };
  if (!res.ok) throw new ApiFailure(res.status, json.code ?? "generic", json.requiredTier);
  return json as T;
}
