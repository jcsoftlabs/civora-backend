import { redirect } from "@sveltejs/kit";
import { currentSession } from "$lib/server/session";
import type { LayoutServerLoad } from "./$types";

/** Espace de gestion : session du parti visité, 2FA validée. Sans poste, un message remplace les modules. */
export const load: LayoutServerLoad = async ({ cookies, locals }) => {
  const s = await currentSession(cookies, locals.partySlug!);
  if (!s) redirect(303, "/admin/connexion");
  if (s.me.mfaPending) redirect(303, "/admin/securite");
  return { me: s.me };
};
