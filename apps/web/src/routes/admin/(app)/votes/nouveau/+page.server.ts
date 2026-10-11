import { error, fail, redirect } from "@sveltejs/kit";
import { hasFeature } from "@civora/shared";
import { fromPartyLocal } from "$lib/datetime";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import type { Actions, PageServerLoad } from "./$types";

type Rule =
  | { field: "status"; operator: "in"; value: string[] }
  | { field: "dues"; operator: "is"; value: "upToDate" }
  | { field: "joined"; operator: "before"; value: string }
  | { field: "organ"; operator: "memberOf"; value: string[] };

/** VOT-01, VOT-02, VOT-04, VOT-07 : création d'un scrutin. Deux tours, liste, candidatures en ligne : Mouvement. */
export const load: PageServerLoad = async ({ cookies, locals, getClientAddress }) => {
  const s = (await currentSession(cookies, locals.partySlug!))!;
  if (!s.me.permissions.includes("votes.manage")) error(403, { message: "forbidden", code: "forbidden" });
  const ip = getClientAddress();
  const call = <T>(path: string) => api<T>(path, { token: s.token, ip });
  const [posts, statuses, organs] = await Promise.all([
    call<{ posts: Array<{ id: string; title: string; organ: string; zoneName: string | null }> }>(
      "/votes/admin/posts",
    ).then((r) => r.posts),
    call<{ statuses: Array<{ id: string; label: { fr: string; ht?: string } }> }>("/member-statuses").then(
      (r) => r.statuses,
    ),
    s.me.permissions.includes("organs.manage")
      ? call<{ organs: Array<{ id: string; name: string }> }>("/organs")
          .then((r) => r.organs.map(({ id, name }) => ({ id, name })))
          .catch(() => [])
      : Promise.resolve([] as Array<{ id: string; name: string }>),
  ]);
  return {
    posts,
    statuses,
    organs,
    advanced: !!s.me.tier && hasFeature(s.me.tier, "votes.advanced"),
  };
};

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const i18n = (f: FormData, k: string) => {
  const fr = text(f, `${k}Fr`);
  const ht = text(f, `${k}Ht`);
  return fr ? { fr, ...(ht ? { ht } : {}) } : undefined;
};
const percent = (f: FormData, k: string) => {
  const n = Number(text(f, k));
  return text(f, k) && Number.isInteger(n) ? n : undefined;
};

/** Conditions cochées (statuts, cotisation, ancienneté, organe) en expression de filtre, reliées par ET. */
function rules(f: FormData, prefix: string) {
  const out: Rule[] = [];
  const statuses = f.getAll(`${prefix}Status`).map(String).filter(Boolean);
  if (statuses.length) out.push({ field: "status", operator: "in", value: statuses });
  if (f.get(`${prefix}Dues`) === "on") out.push({ field: "dues", operator: "is", value: "upToDate" });
  const joined = text(f, `${prefix}Joined`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(joined)) out.push({ field: "joined", operator: "before", value: joined });
  const organ = text(f, `${prefix}Organ`);
  if (organ) out.push({ field: "organ", operator: "memberOf", value: [organ] });
  return { combinator: "and" as const, rules: out };
}

export const actions: Actions = {
  default: async ({ request, cookies, locals, getClientAddress }) => {
    const s = await currentSession(cookies, locals.partySlug!);
    if (!s || s.me.mfaPending) return fail(401, { code: "unauthorized" });
    const f = await request.formData();
    const kind = text(f, "kind") === "question" ? "question" : "post";
    const method = kind === "question" ? "yes_no" : text(f, "method");
    const eligibility = rules(f, "elig");
    const body = {
      kind,
      title: i18n(f, "title"),
      ...(i18n(f, "description") ? { description: i18n(f, "description") } : {}),
      ...(text(f, "zoneCode") ? { zoneCode: text(f, "zoneCode") } : {}),
      ...(kind === "post" && text(f, "postId") ? { postId: text(f, "postId") } : {}),
      method,
      seats: method === "list" ? Number(text(f, "seats") || 2) : 1,
      opensAt: fromPartyLocal(text(f, "opensAt")),
      closesAt: fromPartyLocal(text(f, "closesAt")),
      ...(kind === "post" && fromPartyLocal(text(f, "candidaciesCloseAt"))
        ? { candidaciesCloseAt: fromPartyLocal(text(f, "candidaciesCloseAt")) }
        : {}),
      ...(fromPartyLocal(text(f, "contestationsCloseAt"))
        ? { contestationsCloseAt: fromPartyLocal(text(f, "contestationsCloseAt")) }
        : {}),
      ...(percent(f, "quorumPercent") ? { quorumPercent: percent(f, "quorumPercent") } : {}),
      ...(percent(f, "validityThresholdPercent")
        ? { validityThresholdPercent: percent(f, "validityThresholdPercent") }
        : {}),
      allowBlank: f.get("allowBlank") === "on",
      rules: rules(f, "rule"),
      ...(kind === "post" && eligibility.rules.length ? { eligibility } : {}),
    };
    let id: string;
    try {
      id = (await api<{ id: string }>("/votes/admin", { body, token: s.token, ip: getClientAddress() })).id;
    } catch (e) {
      if (e instanceof ApiFailure) return fail(400, { code: e.code });
      throw e;
    }
    redirect(303, `/admin/votes/${id}`);
  },
};
