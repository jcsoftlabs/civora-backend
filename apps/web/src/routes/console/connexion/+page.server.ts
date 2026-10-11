import { fail, redirect } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { clearConsoleSession, currentStaff, setConsoleSession } from "$lib/server/console-session";
import type { Actions, PageServerLoad } from "./$types";

/**
 * Connexion à la console (SOC-10) : adresse e-mail, code reçu, puis double authentification. Au premier
 * passage, le secret de l'application d'authentification est créé et montré en QR code.
 */
export const load: PageServerLoad = async ({ cookies, getClientAddress }) => {
  const s = await currentStaff(cookies, getClientAddress());
  if (!s) return { step: "email" as const };
  if (s.staff.mfa === "none") redirect(303, "/console");
  if (s.staff.mfa === "required") return { step: "mfa" as const };
  const setup = await api<{ secret: string; uri: string }>("/console/auth/mfa/setup", {
    method: "POST",
    consoleToken: s.token,
    ip: getClientAddress(),
  });
  return { step: "setup" as const, setup };
};

const failure = (e: unknown, keep: Record<string, string> = {}) => {
  if (e instanceof ApiFailure)
    return fail(e.status === 429 ? 429 : 400, { ...keep, code: e.status === 429 ? "rate_limited" : e.code });
  throw e;
};

export const actions: Actions = {
  request: async ({ request, getClientAddress }) => {
    const email = String((await request.formData()).get("email") ?? "")
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, { email, code: "invalid_request" });
    try {
      const r = await api<{ challengeId: string }>("/console/auth/code", { body: { email }, ip: getClientAddress() });
      return { sent: true, email, challengeId: r.challengeId };
    } catch (e) {
      return failure(e, { email });
    }
  },
  verify: async ({ request, cookies, getClientAddress }) => {
    const f = await request.formData();
    const challengeId = String(f.get("challengeId") ?? "");
    const email = String(f.get("email") ?? "");
    const code = String(f.get("code") ?? "").replace(/\s/g, "");
    try {
      const s = await api<{ token: string; expiresAt: string }>("/console/auth/verify", {
        body: { challengeId, code },
        ip: getClientAddress(),
      });
      setConsoleSession(cookies, s.token, s.expiresAt);
    } catch (e) {
      return failure(e, { sent: "1", email, challengeId });
    }
    redirect(303, "/console/connexion");
  },
  mfa: async ({ request, cookies, getClientAddress }) => {
    const code = String((await request.formData()).get("code") ?? "").replace(/\s/g, "");
    const s = await currentStaff(cookies, getClientAddress());
    if (!s) redirect(303, "/console/connexion");
    try {
      await api("/console/auth/mfa/verify", { body: { code }, consoleToken: s.token, ip: getClientAddress() });
    } catch (e) {
      return failure(e);
    }
    redirect(303, "/console");
  },
  restart: async ({ cookies }) => {
    clearConsoleSession(cookies);
    redirect(303, "/console/connexion");
  },
};
