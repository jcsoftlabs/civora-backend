import { error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { env as pub } from "$env/dynamic/public";
import { currentSession } from "$lib/server/session";
import type { RequestHandler } from "./$types";

/** Exemplaire du certificat au modèle enregistré, au nom d'un membre fictif (PDF de l'API, FOR-04). */
export const GET: RequestHandler = async ({ cookies, locals, getClientAddress, request }) => {
  const s = await currentSession(cookies, locals.partySlug!);
  if (!s || s.me.mfaPending) error(401, { message: "unauthorized", code: "unauthorized" });
  const base = env.API_INTERNAL_URL || pub.PUBLIC_API_URL || "http://localhost:4000";
  const res = await fetch(`${base}/certificate-template/sample`, {
    headers: {
      authorization: `Bearer ${s.token}`,
      "accept-language": request.headers.get("accept-language") ?? "fr",
      ...(env.WEB_SERVER_SECRET
        ? { "x-civora-web": env.WEB_SERVER_SECRET, "x-civora-client-ip": getClientAddress() }
        : {}),
    },
  });
  if (!res.ok) error(res.status === 404 ? 404 : 403, { message: "forbidden", code: "forbidden" });
  return new Response(res.body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="certificat-exemple.pdf"',
      "cache-control": "no-store",
    },
  });
};
