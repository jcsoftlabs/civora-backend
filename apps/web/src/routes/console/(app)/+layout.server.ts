import { redirect } from "@sveltejs/kit";
import { currentStaff } from "$lib/server/console-session";
import type { LayoutServerLoad } from "./$types";

/** Console (SOC-10) : session complète exigée (code et double authentification), jamais mise en cache. */
export const load: LayoutServerLoad = async ({ cookies, getClientAddress, setHeaders }) => {
  setHeaders({ "cache-control": "private, no-store", "x-robots-tag": "noindex" });
  const s = await currentStaff(cookies, getClientAddress());
  if (!s || s.staff.mfa !== "none") redirect(303, "/console/connexion");
  return { staff: s.staff };
};
