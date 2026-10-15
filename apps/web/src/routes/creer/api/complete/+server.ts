import { json } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { env } from "$env/dynamic/public";
import { ApiFailure, api } from "$lib/server/api";
import { HANDOFF_COOKIE, handoffDomain } from "$lib/server/session";
import { sameOrigin } from "../../guard";
import type { RequestHandler } from "./$types";

/**
 * Confirmation : l'espace s'ouvre et la session du fondateur passe en cookie de relais httpOnly (dix minutes,
 * domaine racine). À la première visite de <slug>.civora.space, le serveur vérifie que la session est bien celle
 * de ce parti et la range dans le cookie propre à cette adresse (voir lib/server/session.ts).
 */
export const POST: RequestHandler = async ({ request, url, cookies, getClientAddress }) => {
  sameOrigin(request, url);
  try {
    const res = await api<{ slug: string; token: string; expiresAt: string; mfa: string }>("/parties/signup/complete", {
      body: await request.json(),
      ip: getClientAddress(),
    });
    const root = env.PUBLIC_ROOT_DOMAIN || "localhost";
    cookies.set(HANDOFF_COOKIE, res.token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: !dev,
      maxAge: 600,
      ...handoffDomain(),
    });
    const openUrl = dev
      ? `http://${res.slug}.localhost:${url.port || "5173"}/admin`
      : `https://${res.slug}.${root}/admin`;
    return json({ slug: res.slug, mfa: res.mfa, openUrl });
  } catch (e) {
    if (e instanceof ApiFailure) return json({ code: e.code }, { status: e.status });
    throw e;
  }
};
