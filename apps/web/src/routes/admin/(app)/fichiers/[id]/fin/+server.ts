import { error, json } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import type { RequestHandler } from "./$types";

/** Fin de l'envoi direct : l'API vérifie l'objet déposé (type, taille) avant de le déclarer prêt. */
export const POST: RequestHandler = async ({ params, request, url, cookies, locals, getClientAddress }) => {
  if (request.headers.get("origin") !== url.origin) error(403, { message: "forbidden", code: "forbidden" });
  const s = await currentSession(cookies, locals.partySlug!);
  if (!s || s.me.mfaPending) error(401, { message: "unauthorized", code: "unauthorized" });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return json({ code: "invalid_request" }, { status: 400 });
  try {
    return json(
      await api(`/files/${params.id}/complete`, { method: "POST", body: {}, token: s.token, ip: getClientAddress() }),
    );
  } catch (e) {
    if (e instanceof ApiFailure) return json({ code: e.code }, { status: e.status });
    throw e;
  }
};
