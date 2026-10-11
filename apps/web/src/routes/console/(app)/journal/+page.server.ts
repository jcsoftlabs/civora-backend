import { api } from "$lib/server/api";
import { CONSOLE_COOKIE } from "$lib/server/console-session";
import type { PageServerLoad } from "./$types";

export interface ConsoleEntry {
  id: string;
  action: string;
  targetPartyId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  staff: string | null;
}

/** Journal de la console (SOC-10), cent entrées par page, des plus récentes aux plus anciennes. */
export const load: PageServerLoad = async ({ cookies, getClientAddress, url }) => {
  const before = url.searchParams.get("avant");
  const valid = before && !Number.isNaN(Date.parse(before)) ? before : null;
  const consoleToken = cookies.get(CONSOLE_COOKIE)!;
  const ip = getClientAddress();
  const [{ entries }, { organizations }] = await Promise.all([
    api<{ entries: ConsoleEntry[] }>(`/console/audit${valid ? `?before=${encodeURIComponent(valid)}` : ""}`, {
      consoleToken,
      ip,
    }),
    api<{ organizations: Array<{ id: string; name: string }> }>("/console/organizations", { consoleToken, ip }),
  ]);
  return { entries, names: Object.fromEntries(organizations.map((o) => [o.id, o.name])) };
};
