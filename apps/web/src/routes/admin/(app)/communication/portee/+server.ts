import { error, json } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import type { RequestHandler } from "./$types";

/** Portée d'une audience en cours de saisie (nombre de membres visés et joignables). Même origine exigée. */
export const POST: RequestHandler = async ({ request, url, cookies, locals, getClientAddress }) => {
  if (request.headers.get("origin") !== url.origin) error(403, { message: "forbidden", code: "forbidden" });
  const s = await currentSession(cookies, locals.partySlug!);
  if (!s || s.me.mfaPending) error(401, { message: "unauthorized", code: "unauthorized" });
  const body = (await request.json().catch(() => ({}))) as { audience?: unknown; for?: unknown };
  try {
    return json(
      await api("/audience/estimate", {
        body: { audience: body.audience ?? null, for: body.for === "publication" ? "publication" : "push" },
        token: s.token,
        ip: getClientAddress(),
      }),
    );
  } catch (e) {
    if (e instanceof ApiFailure) return json({ code: e.code }, { status: e.status });
    throw e;
  }
};
