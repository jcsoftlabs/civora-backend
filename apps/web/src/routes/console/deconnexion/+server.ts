import { redirect } from "@sveltejs/kit";
import { api } from "$lib/server/api";
import { CONSOLE_COOKIE, clearConsoleSession } from "$lib/server/console-session";
import type { RequestHandler } from "./$types";

/** Fin de la session de console : révoquée côté API, cookie effacé. */
export const POST: RequestHandler = async ({ cookies, getClientAddress }) => {
  const token = cookies.get(CONSOLE_COOKIE);
  if (token)
    await api("/console/auth/logout", { method: "POST", consoleToken: token, ip: getClientAddress() }).catch(() => {});
  clearConsoleSession(cookies);
  redirect(303, "/console/connexion");
};
