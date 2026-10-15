import type { Cookies } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { ApiFailure, api } from "./api";

/** Session de la console (SOC-10) : cookie propre à console.civora.space, limité aux chemins /console. */
export const CONSOLE_COOKIE = "civora_console";

export interface Staff {
  staffId: string;
  email: string;
  name: string;
  role: "owner" | "support";
  mfa: "none" | "required" | "setup_required";
}

export function setConsoleSession(cookies: Cookies, token: string, expiresAt: string | Date) {
  cookies.set(CONSOLE_COOKIE, token, {
    path: "/console",
    httpOnly: true,
    sameSite: "strict",
    secure: !dev,
    expires: new Date(expiresAt),
  });
}

export const clearConsoleSession = (cookies: Cookies) => cookies.delete(CONSOLE_COOKIE, { path: "/console" });

/** Personne connectée à la console, ou null (session absente, expirée ou révoquée). */
export async function currentStaff(cookies: Cookies, ip: string): Promise<{ token: string; staff: Staff } | null> {
  const token = cookies.get(CONSOLE_COOKIE);
  if (!token) return null;
  try {
    return { token, staff: await api<Staff>("/console/auth/me", { consoleToken: token, ip }) };
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 401) {
      clearConsoleSession(cookies);
      return null;
    }
    throw e;
  }
}
