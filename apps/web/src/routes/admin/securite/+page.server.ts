import { fail, redirect } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import type { Actions, PageServerLoad } from "./$types";

/**
 * Double authentification (SEC-04) : activation à la première connexion d'un titulaire de poste, puis code
 * à chaque connexion. Recharger la page redonne le même QR tant que l'activation n'est pas confirmée.
 */
export const load: PageServerLoad = async ({ cookies, locals, getClientAddress }) => {
  const s = await currentSession(cookies, locals.partySlug!);
  if (!s) redirect(303, "/admin/connexion");
  if (!s.me.mfaPending) redirect(303, "/admin");
  if (s.me.mfa === "required") return { mode: "verify" as const, otpauthUri: null, secret: null };
  const { otpauthUri } = await api<{ otpauthUri: string }>("/auth/mfa/setup", {
    method: "POST",
    token: s.token,
    ip: getClientAddress(),
  });
  const secret = new URL(otpauthUri).searchParams.get("secret") ?? "";
  return { mode: "setup" as const, otpauthUri, secret: secret.replace(/(.{4})/g, "$1 ").trim() };
};

export const actions: Actions = {
  default: async ({ request, cookies, locals, getClientAddress }) => {
    const s = await currentSession(cookies, locals.partySlug!);
    if (!s) redirect(303, "/admin/connexion");
    const code = String((await request.formData()).get("code") ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) return fail(400, { code: "mfa_invalid" });
    try {
      await api("/auth/mfa/verify", { body: { code }, token: s.token, ip: getClientAddress() });
    } catch (e) {
      if (e instanceof ApiFailure) return fail(400, { code: e.status === 429 ? "rate_limited" : e.code });
      throw e;
    }
    redirect(303, "/admin");
  },
};
