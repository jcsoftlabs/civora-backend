import { error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { env as pub } from "$env/dynamic/public";
import { currentSession } from "$lib/server/session";
import type { RequestHandler } from "./$types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Procès-verbal de dépouillement (VOT-09), PDF de l'API, dans la langue de l'interface. */
export const GET: RequestHandler = async ({ params, cookies, locals, getClientAddress }) => {
  const s = await currentSession(cookies, locals.partySlug!);
  if (!s || s.me.mfaPending) error(401, { message: "unauthorized", code: "unauthorized" });
  if (!UUID.test(params.id)) error(404, { message: "not_found", code: "not_found" });
  const base = env.API_INTERNAL_URL || pub.PUBLIC_API_URL || "http://localhost:4000";
  const res = await fetch(`${base}/votes/admin/${params.id}/minutes`, {
    headers: {
      authorization: `Bearer ${s.token}`,
      "accept-language": locals.locale,
      ...(env.WEB_SERVER_SECRET
        ? { "x-civora-web": env.WEB_SERVER_SECRET, "x-civora-client-ip": getClientAddress() }
        : {}),
    },
  });
  if (!res.ok)
    error(res.status === 404 ? 404 : res.status === 409 ? 409 : 403, { message: "forbidden", code: "forbidden" });
  return new Response(res.body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="proces-verbal.pdf"',
      "cache-control": "no-store",
    },
  });
};
