import { error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { env as pub } from "$env/dynamic/public";
import { currentSession } from "$lib/server/session";
import type { RequestHandler } from "./$types";

/** Reçu PDF d'un paiement : relayé depuis l'API, qui vérifie la zone (payments.read) ou le membre lui-même. */
export const GET: RequestHandler = async ({ params, cookies, locals, getClientAddress }) => {
  const s = await currentSession(cookies, locals.partySlug!);
  if (!s || s.me.mfaPending) error(401, { message: "unauthorized", code: "unauthorized" });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) error(404, { message: "not_found", code: "not_found" });
  const base = env.API_INTERNAL_URL || pub.PUBLIC_API_URL || "http://localhost:4000";
  const res = await fetch(`${base}/receipts/${params.id}/pdf`, {
    headers: {
      authorization: `Bearer ${s.token}`,
      ...(env.WEB_SERVER_SECRET
        ? { "x-civora-web": env.WEB_SERVER_SECRET, "x-civora-client-ip": getClientAddress() }
        : {}),
    },
  });
  if (!res.ok) error(res.status === 403 ? 403 : 404, { message: "not_found", code: "not_found" });
  return new Response(res.body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": res.headers.get("content-disposition") ?? "attachment",
      "cache-control": "no-store",
    },
  });
};
