import { error } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import type { PageServerLoad } from "./$types";

export type MonthDues = "paid" | "late" | "due" | "none";
export interface MemberRow {
  id: string;
  number: string;
  firstName: string;
  lastName: string;
  state: "pending" | "approved" | "rejected";
  status: { fr: string; ht?: string } | null;
  zoneCode: string;
  zoneName: string;
  parentName: string | null;
  isDiaspora: boolean;
  tags: string[];
  joinedAt: string | null;
  dues: MonthDues[];
}
interface ListResponse {
  items: MemberRow[];
  total: number;
  counts: { pending: number; approved: number; rejected: number };
  page: number;
  limit: number;
  year: number;
}

/** Paramètres d'URL transmis tels quels à l'API, qui les valide (la liste se partage par son adresse). */
const QUERY_KEYS = ["q", "state", "statusId", "diaspora", "sort", "page", "zoneCode", "tags"] as const;

export const load: PageServerLoad = async ({ url, cookies, locals, getClientAddress }) => {
  const s = (await currentSession(cookies, locals.partySlug!))!;
  const params = new URLSearchParams();
  for (const k of QUERY_KEYS) {
    const v = url.searchParams.get(k);
    if (v) params.set(k, v);
  }
  // Par défaut, les membres dont l'adhésion est validée.
  if (!url.searchParams.has("state")) params.set("state", "approved");
  if (params.get("state") === "all") params.delete("state");
  const ip = getClientAddress();
  try {
    const [list, statuses] = await Promise.all([
      api<ListResponse>(`/members?${params}`, { token: s.token, ip }),
      api<{ statuses: Array<{ id: string; label: { fr: string; ht?: string } }> }>("/member-statuses", {
        token: s.token,
        ip,
      }),
    ]);
    return { list, statuses: statuses.statuses, state: params.get("state") ?? "all" };
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 403) error(403, { message: "forbidden", code: "forbidden" });
    if (e instanceof ApiFailure && e.status === 400) {
      return {
        list: { items: [], total: 0, counts: { pending: 0, approved: 0, rejected: 0 }, page: 1, limit: 25, year: 0 },
        statuses: [],
        state: params.get("state") ?? "all",
      };
    }
    throw e;
  }
};
