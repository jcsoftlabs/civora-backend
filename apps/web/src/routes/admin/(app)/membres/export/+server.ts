import { error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { env as pub } from "$env/dynamic/public";
import { currentSession } from "$lib/server/session";
import type { RequestHandler } from "./$types";

/**
 * ADH-12 : export de la liste filtrée, en CSV, Excel ou PDF. Formulaire POST (origine vérifiée par SvelteKit) ;
 * l'API applique la portée territoriale et journalise l'export. Le fichier est relayé tel quel.
 */
export const POST: RequestHandler = async ({ request, cookies, locals, getClientAddress }) => {
  const s = await currentSession(cookies, locals.partySlug!);
  if (!s || s.me.mfaPending) error(401, { message: "unauthorized", code: "unauthorized" });
  const f = await request.formData();
  const format = String(f.get("format"));
  if (!["csv", "xlsx", "pdf"].includes(format)) error(400, { message: "invalid_request", code: "invalid_request" });
  const filters: Record<string, unknown> = {};
  const state = String(f.get("state") ?? "");
  if (["pending", "approved", "rejected"].includes(state)) filters.state = state;
  const statusId = String(f.get("statusId") ?? "");
  if (statusId) filters.statusId = statusId;
  const diaspora = String(f.get("diaspora") ?? "");
  if (diaspora === "true" || diaspora === "false") filters.diaspora = diaspora === "true";

  const base = env.API_INTERNAL_URL || pub.PUBLIC_API_URL || "http://localhost:4000";
  const res = await fetch(`${base}/members/export`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${s.token}`,
      ...(env.WEB_SERVER_SECRET
        ? { "x-civora-web": env.WEB_SERVER_SECRET, "x-civora-client-ip": getClientAddress() }
        : {}),
    },
    body: JSON.stringify({ format, lang: locals.locale, filters }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: string };
    error(res.status, { message: body.code ?? "generic", code: body.code ?? "generic" });
  }
  return new Response(res.body, {
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/octet-stream",
      "content-disposition": res.headers.get("content-disposition") ?? "attachment",
      "cache-control": "no-store",
    },
  });
};
