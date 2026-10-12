import { error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { env as pub } from "$env/dynamic/public";
import { currentSession } from "$lib/server/session";
import type { RequestHandler } from "./$types";

/** Rapport d'un import (ADH-07) : lignes à reprendre, en CSV pour Excel, dans la langue de la personne. */
export const GET: RequestHandler = async ({ url, cookies, locals, getClientAddress }) => {
  const s = await currentSession(cookies, locals.partySlug!);
  if (!s || s.me.mfaPending) error(401, { message: "unauthorized", code: "unauthorized" });
  const id = url.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) error(400, { message: "invalid_request", code: "invalid_request" });
  const base = env.API_INTERNAL_URL || pub.PUBLIC_API_URL || "http://localhost:4000";
  const res = await fetch(`${base}/member-imports/${id}/report.csv`, {
    headers: {
      authorization: `Bearer ${s.token}`,
      "accept-language": locals.locale,
      ...(env.WEB_SERVER_SECRET
        ? { "x-civora-web": env.WEB_SERVER_SECRET, "x-civora-client-ip": getClientAddress() }
        : {}),
    },
  });
  if (!res.ok) error(res.status === 404 ? 404 : 400, { message: "report_failed", code: "report_failed" });
  return new Response(res.body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="rapport-import.csv"`,
      "cache-control": "no-store",
    },
  });
};
