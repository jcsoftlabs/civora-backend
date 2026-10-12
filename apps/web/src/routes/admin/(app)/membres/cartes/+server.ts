import { error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { env as pub } from "$env/dynamic/public";
import { currentSession } from "$lib/server/session";
import type { RequestHandler } from "./$types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Impression des cartes des membres cochés (ADH-13) : PDF de l'API, format carte PVC ou planche A4. */
export const POST: RequestHandler = async ({ request, cookies, locals, getClientAddress }) => {
  const s = await currentSession(cookies, locals.partySlug!);
  if (!s || s.me.mfaPending) error(401, { message: "unauthorized", code: "unauthorized" });
  const f = await request.formData();
  const memberIds = f
    .getAll("ids")
    .map(String)
    .filter((id) => UUID.test(id))
    .slice(0, 500);
  const format = f.get("format") === "a4" ? "a4" : "cr80";
  if (!memberIds.length) error(400, { message: "invalid_request", code: "invalid_request" });
  const base = env.API_INTERNAL_URL || pub.PUBLIC_API_URL || "http://localhost:4000";
  const res = await fetch(`${base}/members/cards/print`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${s.token}`,
      "content-type": "application/json",
      "accept-language": locals.locale,
      ...(env.WEB_SERVER_SECRET
        ? { "x-civora-web": env.WEB_SERVER_SECRET, "x-civora-client-ip": getClientAddress() }
        : {}),
    },
    body: JSON.stringify({ memberIds, format }),
  });
  if (!res.ok)
    error(res.status === 403 ? 403 : res.status === 402 ? 402 : 400, {
      message: "cards_print_failed",
      code: "cards_print_failed",
    });
  return new Response(res.body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="cartes-${format}.pdf"`,
      "cache-control": "no-store",
    },
  });
};
