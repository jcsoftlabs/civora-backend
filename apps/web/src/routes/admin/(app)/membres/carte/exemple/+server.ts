import { error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { env as pub } from "$env/dynamic/public";
import { currentSession } from "$lib/server/session";
import type { RequestHandler } from "./$types";

/** Exemplaire PDF du modèle en cours d'édition (brouillon envoyé par le formulaire), au format carte ou planche. */
export const POST: RequestHandler = async ({ request, cookies, locals, getClientAddress }) => {
  const s = await currentSession(cookies, locals.partySlug!);
  if (!s || s.me.mfaPending) error(401, { message: "unauthorized", code: "unauthorized" });
  const f = await request.formData();
  const format = f.get("format") === "a4" ? "a4" : "cr80";
  let design: unknown;
  try {
    design = JSON.parse(String(f.get("design") ?? "{}"));
  } catch {
    error(400, { message: "invalid_request", code: "invalid_request" });
  }
  const base = env.API_INTERNAL_URL || pub.PUBLIC_API_URL || "http://localhost:4000";
  const res = await fetch(`${base}/party/card-template/sample`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${s.token}`,
      "content-type": "application/json",
      "accept-language": locals.locale,
      ...(env.WEB_SERVER_SECRET
        ? { "x-civora-web": env.WEB_SERVER_SECRET, "x-civora-client-ip": getClientAddress() }
        : {}),
    },
    body: JSON.stringify({ design, format }),
  });
  if (!res.ok) error(res.status === 402 ? 402 : 400, { message: "card_sample_failed", code: "card_sample_failed" });
  return new Response(res.body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="carte-exemple-${format}.pdf"`,
      "cache-control": "no-store",
    },
  });
};
