import { error, json } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import { UPLOAD_RULES } from "$lib/server/upload";
import type { RequestHandler } from "./$types";

/**
 * Envoi direct d'un gros fichier (vidéo, audio) : le serveur web demande l'URL signée à l'API et la donne au
 * navigateur, qui dépose le fichier sans passer par Vercel (corps de requête limité à quelques Mo).
 */
export const POST: RequestHandler = async ({ request, url, cookies, locals, getClientAddress }) => {
  if (request.headers.get("origin") !== url.origin) error(403, { message: "forbidden", code: "forbidden" });
  const s = await currentSession(cookies, locals.partySlug!);
  if (!s || s.me.mfaPending) error(401, { message: "unauthorized", code: "unauthorized" });
  const b = (await request.json().catch(() => ({}))) as {
    purpose?: string;
    name?: string;
    mimeType?: string;
    sizeBytes?: number;
  };
  if (b.purpose !== "training_media" && b.purpose !== "publication_media" && b.purpose !== "signature")
    return json({ code: "invalid_request" }, { status: 400 });
  const rule = UPLOAD_RULES[b.purpose];
  if (!b.mimeType || !(rule.types as readonly string[]).includes(b.mimeType))
    return json({ code: "file_type_not_allowed" }, { status: 400 });
  if (!b.sizeBytes || b.sizeBytes > rule.max(b.mimeType)) return json({ code: "file_too_large" }, { status: 413 });
  try {
    return json(
      await api("/files/uploads", {
        body: {
          purpose: b.purpose,
          name: String(b.name ?? "fichier").slice(0, 120),
          mimeType: b.mimeType,
          sizeBytes: b.sizeBytes,
        },
        token: s.token,
        ip: getClientAddress(),
      }),
    );
  } catch (e) {
    if (e instanceof ApiFailure) return json({ code: e.code }, { status: e.status });
    throw e;
  }
};
