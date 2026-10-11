import { json } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { env } from "$env/dynamic/public";
import { ApiFailure, api } from "$lib/server/api";
import { sameOrigin } from "../../guard";
import type { RequestHandler } from "./$types";

/**
 * Confirmation : l'espace s'ouvre et la session du fondateur est posée en cookie httpOnly, valable pour les
 * sous-domaines des partis (<slug>.civora.app). Le serveur vérifie à chaque requête que la session appartient
 * bien au parti de l'adresse visitée.
 */
export const POST: RequestHandler = async ({ request, url, cookies }) => {
  sameOrigin(request, url);
  try {
    const res = await api<{ slug: string; token: string; expiresAt: string; mfa: string }>("/parties/signup/complete", {
      body: await request.json(),
    });
    const root = env.PUBLIC_ROOT_DOMAIN || "localhost";
    cookies.set("civora_session", res.token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: !dev,
      expires: new Date(res.expiresAt),
      ...(dev ? {} : { domain: `.${root}` }),
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
