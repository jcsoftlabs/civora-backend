import { fail, redirect } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession, setSession } from "$lib/server/session";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ cookies, locals }) => {
  const s = await currentSession(cookies, locals.partySlug!);
  if (s) redirect(303, s.me.mfaPending ? "/admin/securite" : "/admin");
  return {};
};

const failure = (e: unknown, keep: Record<string, string>) => {
  if (e instanceof ApiFailure)
    return fail(e.status === 429 ? 429 : 400, { ...keep, code: e.status === 429 ? "rate_limited" : e.code });
  throw e;
};

export const actions: Actions = {
  /** Étape 1 : un code est envoyé si l'adresse correspond à un membre (réponse identique sinon). */
  request: async ({ request, locals, getClientAddress }) => {
    const email = String((await request.formData()).get("email") ?? "")
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return fail(400, { email, code: "invalid_request" });
    }
    try {
      const res = await api<{ challengeId: string }>("/auth/otp/request", {
        body: { partySlug: locals.partySlug, channel: "email", destination: email },
        ip: getClientAddress(),
      });
      return { email, challengeId: res.challengeId };
    } catch (e) {
      return failure(e, { email });
    }
  },
  /** Étape 2 : le code ouvre la session ; un titulaire de poste passe ensuite par la 2FA. */
  verify: async ({ request, locals, cookies, getClientAddress }) => {
    const f = await request.formData();
    const email = String(f.get("email") ?? "");
    const challengeId = String(f.get("challengeId") ?? "");
    const code = String(f.get("code") ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) return fail(400, { email, challengeId, code: "otp_invalid" });
    let next: string;
    try {
      const res = await api<{ token: string; expiresAt: string; mfa: string }>("/auth/otp/verify", {
        body: { partySlug: locals.partySlug, challengeId, code },
        ip: getClientAddress(),
      });
      setSession(cookies, res.token, res.expiresAt);
      next = res.mfa === "none" ? "/admin" : "/admin/securite";
    } catch (e) {
      return failure(e, { email, challengeId });
    }
    redirect(303, next);
  },
};
