import { error, fail } from "@sveltejs/kit";
import { fromPartyLocal } from "$lib/datetime";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import type { Phase } from "../+page.server";

type I18n = { fr: string; ht?: string };
export interface Candidate {
  id: string;
  memberId: string | null;
  label: I18n;
  statement: I18n | null;
  status: "pending" | "accepted" | "rejected" | "withdrawn";
  decisionReason: string | null;
  runoff: boolean;
  position: number;
  memberNumber: string | null;
}
export interface Contest {
  id: string;
  kind: "missing" | "ineligible";
  reason: string;
  status: "pending" | "accepted" | "rejected";
  decisionNote: string | null;
  createdAt: string;
  concernedName: string;
  authorName: string;
}
export interface RoundResult {
  round: number;
  registered: number;
  turnout: number;
  valid: boolean;
  createdAt: string;
  tally: { counts: Record<string, number>; ballots: number; blank: number; validVotes: number; turnoutPercent: number };
  outcome: { winners: string[]; runoff?: string[]; reason: string };
}
export interface ElectionDetail {
  id: string;
  title: I18n;
  description: I18n | null;
  kind: "post" | "question";
  method: "simple_majority" | "two_rounds" | "list" | "yes_no";
  seats: number;
  round: number;
  state: string;
  phase: Phase;
  opensAt: string;
  closesAt: string;
  candidaciesCloseAt: string | null;
  contestationsCloseAt: string | null;
  quorumPercent: number | null;
  validityThresholdPercent: number | null;
  allowBlank: boolean;
  rollFrozenAt: string | null;
  certifiedAt: string | null;
  zoneName: string | null;
  post: { title: string; organ: string } | null;
  registered: number;
  voted: number;
  candidates: Candidate[];
  contests: Contest[];
  results: RoundResult[];
}
export interface Voter {
  memberNumber: string;
  firstName: string;
  lastName: string;
  zone: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABS = ["deroule", "candidats", "liste", "resultats"] as const;

/** Fiche d'un scrutin : déroulé, candidats, liste électorale et contestations, résultats et procès-verbal. */
export const load: PageServerLoad = async ({ params, url, cookies, locals, getClientAddress }) => {
  const s = (await currentSession(cookies, locals.partySlug!))!;
  if (!s.me.permissions.includes("votes.manage")) error(403, { message: "forbidden", code: "forbidden" });
  if (!UUID.test(params.id)) error(404, { message: "not_found", code: "not_found" });
  const call = <T>(path: string) => api<T>(path, { token: s.token, ip: getClientAddress() });
  let election: ElectionDetail;
  try {
    election = await call<ElectionDetail>(`/votes/admin/${params.id}`);
  } catch (e) {
    if (e instanceof ApiFailure && (e.status === 404 || e.status === 403))
      error(e.status, { message: e.code, code: e.code });
    throw e;
  }
  const tab = (TABS as readonly string[]).includes(url.searchParams.get("onglet") ?? "")
    ? (url.searchParams.get("onglet") as (typeof TABS)[number])
    : "deroule";
  const voters =
    tab === "liste" && election.phase !== "draft"
      ? (await call<{ voters: Voter[] }>(`/votes/${params.id}/roll`)).voters
      : [];
  const journal =
    tab === "resultats" && election.results.length
      ? await call<{ fingerprint: string; hashes: string[] }>(`/votes/${params.id}/journal`)
      : null;
  return {
    election,
    tab,
    voters,
    fingerprint: journal?.fingerprint ?? null,
    canCertify: s.me.permissions.includes("votes.certify"),
    canSearchMembers: s.me.permissions.includes("members.read"),
  };
};

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function act(event: RequestEvent, call: (f: FormData, token: string, ip: string) => Promise<object | void>) {
  const s = await currentSession(event.cookies, event.locals.partySlug!);
  if (!s || s.me.mfaPending) return fail(401, { code: "unauthorized" });
  const f = await event.request.formData();
  try {
    return { ok: true, ...((await call(f, s.token, event.getClientAddress())) ?? {}) };
  } catch (e) {
    if (e instanceof ApiFailure) return fail(e.status === 429 ? 429 : 400, { code: e.code });
    throw e;
  }
}
const path = (event: RequestEvent, rest = "") => `/votes/admin/${encodeURIComponent(event.params.id)}${rest}`;
const sub = (f: FormData, k: string) => encodeURIComponent(text(f, k));

export const actions: Actions = {
  freeze: (event) =>
    act(event, async (_f, token, ip) => {
      const r = await api<{ registered: number }>(path(event, "/roll"), { method: "POST", token, ip });
      return { done: "frozen", registered: r.registered };
    }),
  addCandidate: (event) =>
    act(event, async (f, token, ip) => {
      const fr = text(f, "labelFr");
      const ht = text(f, "labelHt");
      const st = text(f, "statement");
      await api(path(event, "/candidates"), {
        body: {
          label: { fr, ...(ht ? { ht } : {}) },
          ...(text(f, "memberId") ? { memberId: text(f, "memberId") } : {}),
          ...(st ? { statement: { fr: st } } : {}),
        },
        token,
        ip,
      });
      return { done: "candidate" };
    }),
  decideCandidate: (event) =>
    act(event, async (f, token, ip) => {
      await api(path(event, `/candidates/${sub(f, "candidateId")}`), {
        method: "PATCH",
        body: {
          status: text(f, "status") === "accepted" ? "accepted" : "rejected",
          ...(text(f, "reason") ? { reason: text(f, "reason") } : {}),
        },
        token,
        ip,
      });
    }),
  removeCandidate: (event) =>
    act(event, async (f, token, ip) => {
      await api(path(event, `/candidates/${sub(f, "candidateId")}`), { method: "DELETE", token, ip });
    }),
  decideContest: (event) =>
    act(event, async (f, token, ip) => {
      await api(path(event, `/contests/${sub(f, "contestId")}`), {
        method: "PATCH",
        body: {
          status: text(f, "status") === "accepted" ? "accepted" : "rejected",
          ...(text(f, "note") ? { note: text(f, "note") } : {}),
        },
        token,
        ip,
      });
    }),
  count: (event) =>
    act(event, async (_f, token, ip) => {
      await api(path(event, "/count"), { method: "POST", token, ip });
      return { done: "counted" };
    }),
  runoff: (event) =>
    act(event, async (f, token, ip) => {
      await api(path(event, "/runoff"), {
        body: { opensAt: fromPartyLocal(text(f, "opensAt")), closesAt: fromPartyLocal(text(f, "closesAt")) },
        token,
        ip,
      });
      return { done: "runoff" };
    }),
  certify: (event) =>
    act(event, async (_f, token, ip) => {
      await api(path(event, "/certify"), { method: "POST", token, ip });
      return { done: "certified" };
    }),
};
