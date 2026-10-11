import { redirect } from "@sveltejs/kit";
import { api } from "$lib/server/api";
import { SESSION_COOKIE } from "$lib/server/session";
import type { RequestHandler } from "./$types";

/** Déconnexion : la session est révoquée côté API, puis le cookie est effacé. Formulaire POST (CSRF vérifié). */
export const POST: RequestHandler = async ({ cookies, getClientAddress }) => {
  const token = cookies.get(SESSION_COOKIE);
  if (token) await api("/auth/logout", { method: "POST", token, ip: getClientAddress() }).catch(() => undefined);
  cookies.delete(SESSION_COOKIE, { path: "/" });
  redirect(303, "/admin/connexion");
};
