import { error } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import type { PageServerLoad } from "./$types";

export type Phase = "draft" | "preparation" | "open" | "counting" | "closed" | "published";
export interface ElectionSummary {
  id: string;
  title: { fr: string; ht?: string };
  kind: "post" | "question";
  method: "simple_majority" | "two_rounds" | "list" | "yes_no";
  phase: Phase;
  round: number;
  opensAt: string;
  closesAt: string;
  zoneName: string | null;
  registered: number;
  voted: number;
}

/** VOT-01 : scrutins de la portée de la personne (votes.manage). Hors formule : option verrouillée. */
export const load: PageServerLoad = async ({ cookies, locals, getClientAddress }) => {
  const s = (await currentSession(cookies, locals.partySlug!))!;
  if (!s.me.permissions.includes("votes.manage")) error(403, { message: "forbidden", code: "forbidden" });
  try {
    const r = await api<{ elections: ElectionSummary[] }>("/votes/admin", { token: s.token, ip: getClientAddress() });
    return { elections: r.elections, locked: null as string | null };
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 402) return { elections: [], locked: e.requiredTier ?? "essentiel" };
    throw e;
  }
};
