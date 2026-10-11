import { api } from "$lib/server/api";
import { CONSOLE_COOKIE } from "$lib/server/console-session";
import type { PageServerLoad } from "./$types";

export interface Overview {
  organizations: {
    total: number;
    byStatus: Record<string, number>;
    byKind: Record<string, number>;
    byTier: Record<string, number>;
    bySubscription: Record<string, number>;
    new30: number;
  };
  people: {
    accounts: number;
    members: number;
    newMembers30: number;
    activeUsers30: number;
    pendingApplications: number;
  };
  revenue: { mrrUsd: number; trialMrrUsd: number; payingOrganizations: number };
  collected30: Record<string, { total: number; payments: number }>;
  storageBytes: number;
  signupsByWeek: Array<{ week: string; signups: number }>;
  trialsEndingSoon: Array<{ id: string; name: string; slug: string; endsAt: string }>;
  nearMemberQuota: Array<{ id: string; name: string; members: number; quota: number }>;
  health: { database: "ok"; databaseMs: number; failedJobs24h: number | null; queuedJobs: number | null };
}

/** Vue d'ensemble de la plateforme (SOC-10) : totaux seulement. */
export const load: PageServerLoad = async ({ cookies, getClientAddress }) => ({
  overview: await api<Overview>("/console/overview", {
    consoleToken: cookies.get(CONSOLE_COOKIE)!,
    ip: getClientAddress(),
  }),
});
