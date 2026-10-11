import { api } from "$lib/server/api";
import { CONSOLE_COOKIE } from "$lib/server/console-session";
import type { PageServerLoad } from "./$types";

export interface OrgRow {
  id: string;
  slug: string;
  name: string;
  kind: "party" | "association" | "ngo" | "union";
  tier: "essentiel" | "mouvement" | "national";
  status: string;
  createdAt: string;
  activatedAt: string | null;
  subscription: { status: string; tier: string; billingCycle: string; periodEnd: string | null } | null;
  members: number;
  activeUsers30: number;
  storageBytes: number;
  lastActivity: string | null;
}

/** Organisations de la plateforme avec leurs totaux (SOC-10). Filtres côté page : nom, statut, type, formule. */
export const load: PageServerLoad = async ({ cookies, getClientAddress, url }) => {
  const { organizations } = await api<{ organizations: OrgRow[] }>("/console/organizations", {
    consoleToken: cookies.get(CONSOLE_COOKIE)!,
    ip: getClientAddress(),
  });
  return {
    organizations,
    filters: {
      q: url.searchParams.get("q") ?? "",
      statut: url.searchParams.get("statut") ?? "",
      type: url.searchParams.get("type") ?? "",
      formule: url.searchParams.get("formule") ?? "",
    },
  };
};
