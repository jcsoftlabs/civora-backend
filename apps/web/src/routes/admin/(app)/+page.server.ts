import { redirect } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import type { PageServerLoad } from "./$types";

export interface ZoneStats {
  code: string;
  name: string;
  nameHt: string | null;
  level: string;
  members: { approved: number; pending: number; newLast30Days: number; diaspora: number };
  dues: { upToDate: number; late: number; collectedLast30Days: Record<string, string> };
  engagement: { eventRegistrationsLast30Days: number };
}
interface Stats {
  zone: ZoneStats | null;
  children: ZoneStats[];
  trend: Array<{ month: string; newMembers: number; collected: Record<string, string> }>;
}

/** Premier module ouvert à la personne, quand le tableau de bord ne l'est pas. */
const FALLBACK: Array<[string, string[]]> = [
  ["/admin/membres", ["members.read"]],
  ["/admin/cotisations", ["payments.read", "dues.manage", "payments.recordCash"]],
  ["/admin/evenements", ["events.manage"]],
  ["/admin/communication", ["publications.manage", "outreach.send"]],
  ["/admin/organes", ["organs.manage"]],
  ["/admin/reglages", ["settings.party"]],
];

/** PIL-01 : accueil du back-office, indicateurs de la zone de la personne et de ses sous-zones. */
export const load: PageServerLoad = async ({ url, cookies, locals, getClientAddress }) => {
  const s = (await currentSession(cookies, locals.partySlug!))!;
  const can = (p: string) => s.me.permissions.includes(p);
  if (!can("bi.read")) {
    const next = FALLBACK.find(([, perms]) => perms.some(can));
    if (next) redirect(307, next[0]);
    return { stats: null, ancestors: [] };
  }
  const zone = url.searchParams.get("zone");
  const code = zone && /^[A-Z0-9-]{2,20}$/.test(zone) ? zone : null;
  const ip = getClientAddress();
  try {
    const stats = await api<Stats>(`/stats/zones${code ? `?parent=${code}` : ""}`, { token: s.token, ip });
    // Fil d'Ariane de la zone affichée (zones publiques du référentiel).
    const detail = stats.zone
      ? await api<{ ancestors: Array<{ code: string; name: string; level: string }> }>(`/zones/${stats.zone.code}`, {
          ip,
        }).catch(() => ({ ancestors: [] }))
      : { ancestors: [] };
    return { stats, ancestors: detail.ancestors };
  } catch (e) {
    // Zone hors de la portée de la personne : retour à sa zone.
    if (e instanceof ApiFailure && (e.status === 403 || e.status === 404) && code) redirect(303, "/admin");
    throw e;
  }
};
