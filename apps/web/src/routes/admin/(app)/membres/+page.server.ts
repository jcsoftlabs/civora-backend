import { error, fail } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";

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
export interface MemberDetail {
  id: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  isDiaspora: boolean;
  residenceCountry: string | null;
  applicationState: "pending" | "approved" | "rejected";
  applicationScore: number | null;
  createdAt: string;
  joinedAt: string | null;
  category: string | null;
  tags: string[];
  statusId: string | null;
  statusLabel: { fr: string; ht?: string } | null;
  referent: { number: string; firstName: string; lastName: string } | null;
  location: Array<{ code: string; level: string; name: string; nameHt: string | null }>;
  identities: Array<{ id: string; kind: "nin" | "nif" | "passport" | "ssn" }>;
}
export interface DuesStatement {
  subscriptions: Array<{
    planId: string;
    name: { fr: string; ht?: string };
    amount: string;
    currency: string;
    periodicity: string;
    startsOn: string;
  }>;
  upToDate: boolean;
  outstanding: Record<string, string>;
  obligations: Array<{
    id: string;
    planName: { fr: string; ht?: string };
    periodStart: string;
    dueDate: string;
    amount: string;
    currency: string;
    paidAt: string | null;
    state: "paid" | "upcoming" | "due" | "late";
  }>;
}
export interface FilterRule {
  field: "zone" | "status" | "tag" | "place" | "dues" | "joined" | "category" | "organ";
  operator: string;
  value: string | string[];
  label?: string;
}
export interface FilterExpr {
  combinator: "and" | "or";
  rules: FilterRule[];
}
export interface Segment {
  id: string;
  name: string;
  filter: FilterExpr;
  createdByMemberId: string | null;
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
  // Filtre composé (règles ET / OU) en JSON dans `f` ; l'API le valide et y ajoute la portée de la personne.
  const f = url.searchParams.get("f");
  if (f && f.length <= 4000) params.set("filter", f);
  // Par défaut, les membres dont l'adhésion est validée.
  if (!url.searchParams.has("state")) params.set("state", "approved");
  if (params.get("state") === "all") params.delete("state");
  const ip = getClientAddress();
  try {
    const [list, statuses, segments, organs] = await Promise.all([
      api<ListResponse>(`/members?${params}`, { token: s.token, ip }),
      api<{ statuses: Array<{ id: string; label: { fr: string; ht?: string } }> }>("/member-statuses", {
        token: s.token,
        ip,
      }),
      api<{ segments: Segment[] }>("/member-segments", { token: s.token, ip }).then((r) => r.segments),
      s.me.permissions.includes("organs.manage")
        ? api<{ organs: Array<{ id: string; name: string }> }>("/organs", { token: s.token, ip }).then((r) =>
            r.organs.map(({ id, name }) => ({ id, name })),
          )
        : [],
    ]);
    return {
      list,
      segments,
      organs,
      statuses: statuses.statuses,
      state: params.get("state") ?? "all",
      sheet: await sheet(url.searchParams.get("m"), s.token, s.me.permissions, ip),
    };
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 403) error(403, { message: "forbidden", code: "forbidden" });
    if (e instanceof ApiFailure && e.status === 400) {
      return {
        list: { items: [], total: 0, counts: { pending: 0, approved: 0, rejected: 0 }, page: 1, limit: 25, year: 0 },
        statuses: [],
        segments: [] as Segment[],
        organs: [] as Array<{ id: string; name: string }>,
        state: params.get("state") ?? "all",
        sheet: null,
      };
    }
    throw e;
  }
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fiche ouverte dans le panneau latéral (?m=<id>) : profil, et relevé de cotisations si le poste le permet. */
async function sheet(id: string | null, token: string, permissions: string[], ip: string) {
  if (!id || !UUID.test(id)) return null;
  try {
    const canDues = permissions.includes("dues.manage") || permissions.includes("payments.read");
    const [member, dues, plans] = await Promise.all([
      api<MemberDetail>(`/members/${id}`, { token, ip }),
      canDues ? api<DuesStatement>(`/members/${id}/dues`, { token, ip }).catch(() => null) : null,
      // Formules actives proposées à l'attribution (dues.manage).
      permissions.includes("dues.manage")
        ? api<{
            plans: Array<{
              id: string;
              name: { fr: string; ht?: string };
              amount: string;
              currency: string;
              active: boolean;
            }>;
          }>("/dues/plans", { token, ip }).then((r) => r.plans.filter((p) => p.active))
        : [],
    ]);
    return { member, dues, plans };
  } catch (e) {
    // Membre introuvable ou hors de la zone : pas de panneau, la liste reste affichée.
    if (e instanceof ApiFailure && (e.status === 404 || e.status === 403)) return null;
    throw e;
  }
}

/** Appel d'une action du panneau ; une erreur de l'API revient au formulaire avec son code. */
async function act(
  event: RequestEvent,
  method: "POST" | "PATCH" | "DELETE",
  path: (id: string, f: FormData) => string,
  body: (f: FormData) => object | null,
  done: "saved" | "approved" | "rejected" | "subscribed" | "unsubscribed",
) {
  const s = await currentSession(event.cookies, event.locals.partySlug!);
  if (!s || s.me.mfaPending) return fail(401, { code: "forbidden" });
  const f = await event.request.formData();
  const id = String(f.get("id") ?? "");
  if (!UUID.test(id)) return fail(400, { code: "invalid_request" });
  try {
    const payload = body(f);
    await api(path(id, f), {
      method,
      ...(payload ? { body: payload } : {}),
      token: s.token,
      ip: event.getClientAddress(),
    });
    return { ok: true, done };
  } catch (e) {
    if (e instanceof ApiFailure)
      return fail(e.status === 429 ? 429 : 400, { code: e.status === 403 ? "forbidden" : e.code });
    throw e;
  }
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Identifiants cochés, envoyés par le formulaire de la barre d'actions groupées. */
const selection = (f: FormData) => [...new Set(f.getAll("ids").map(String))].filter((id) => UUID.test(id));

async function bulk(
  event: RequestEvent,
  run: (f: FormData, ids: string[], token: string, ip: string) => Promise<object>,
) {
  const s = await currentSession(event.cookies, event.locals.partySlug!);
  if (!s || s.me.mfaPending) return fail(401, { code: "unauthorized" });
  const f = await event.request.formData();
  const ids = selection(f);
  if (!ids.length) return fail(400, { code: "invalid_request" });
  try {
    return { bulk: await run(f, ids, s.token, event.getClientAddress()) };
  } catch (e) {
    if (e instanceof ApiFailure)
      return fail(e.status === 429 ? 429 : 400, { code: e.status === 403 ? "forbidden" : e.code });
    throw e;
  }
}

export const actions: Actions = {
  /** Enregistre le filtre en cours sous un nom, partagé dans le parti. */
  saveSegment: async (event) => {
    const s = await currentSession(event.cookies, event.locals.partySlug!);
    if (!s || s.me.mfaPending) return fail(401, { code: "unauthorized" });
    const f = await event.request.formData();
    let filter: unknown;
    try {
      filter = JSON.parse(text(f, "filter"));
    } catch {
      return fail(400, { code: "invalid_request" });
    }
    try {
      const r = await api<{ id: string }>("/member-segments", {
        body: { name: text(f, "name"), filter },
        token: s.token,
        ip: event.getClientAddress(),
      });
      return { ok: true, segment: r.id };
    } catch (e) {
      if (e instanceof ApiFailure) return fail(400, { code: e.code, segmentError: true });
      throw e;
    }
  },
  deleteSegment: async (event) => {
    const s = await currentSession(event.cookies, event.locals.partySlug!);
    if (!s || s.me.mfaPending) return fail(401, { code: "unauthorized" });
    const id = text(await event.request.formData(), "id");
    if (!UUID.test(id)) return fail(400, { code: "invalid_request" });
    try {
      await api(`/member-segments/${id}`, { method: "DELETE", token: s.token, ip: event.getClientAddress() });
      return { ok: true, segmentDeleted: true };
    } catch (e) {
      if (e instanceof ApiFailure) return fail(400, { code: e.code });
      throw e;
    }
  },
  /** Statut, catégorie et étiquettes (members.write dans la zone du membre). */
  update: (event) =>
    act(
      event,
      "PATCH",
      (id) => `/members/${id}`,
      (f) => ({
        statusId: text(f, "statusId") || null,
        category: text(f, "category") || null,
        tags: [
          ...new Set(
            text(f, "tags")
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          ),
        ].slice(0, 20),
      }),
      "saved",
    ),
  /** FIN-03 : attribution d'une formule à ce membre (dues.manage dans sa zone) ; échéances dès aujourd'hui. */
  subscribe: (event) =>
    act(
      event,
      "POST",
      (id) => `/members/${id}/dues-subscriptions`,
      (f) => ({ planId: text(f, "planId") }),
      "subscribed",
    ),
  /** Fin de la formule : les échéances futures non réglées disparaissent, l'historique reste. */
  unsubscribe: (event) =>
    act(
      event,
      "DELETE",
      (id, f) => `/members/${id}/dues-subscriptions/${encodeURIComponent(text(f, "planId"))}`,
      () => null,
      "unsubscribed",
    ),
  /** ADH-06 : validation, avec la note facultative. */
  approve: (event) =>
    act(
      event,
      "POST",
      (id) => `/applications/${id}/approve`,
      (f) => (text(f, "score") ? { score: Number(text(f, "score")) } : {}),
      "approved",
    ),
  /** ADH-06 : rejet ; le motif reste au journal du parti, il n'est jamais envoyé au candidat. */
  reject: (event) =>
    act(
      event,
      "POST",
      (id) => `/applications/${id}/reject`,
      (f) => (text(f, "reason") ? { reason: text(f, "reason") } : {}),
      "rejected",
    ),

  /** Ajout ou retrait d'une étiquette sur la sélection (tout ou rien, dans la zone de la personne). */
  bulkTags: (event) =>
    bulk(event, async (f, ids, token, ip) => {
      const tag = text(f, "tag").slice(0, 40);
      if (!tag) throw new ApiFailure(400, "invalid_request");
      const kind = text(f, "mode") === "remove" ? "removeTags" : "addTags";
      const r = await api<{ updated: number }>("/members/bulk", {
        body: { ids, op: { kind, tags: [tag] } },
        token,
        ip,
      });
      return { kind: "tags", n: r.updated };
    }),
  bulkStatus: (event) =>
    bulk(event, async (f, ids, token, ip) => {
      const r = await api<{ updated: number }>("/members/bulk", {
        body: { ids, op: { kind: "setStatus", statusId: text(f, "statusId") || null } },
        token,
        ip,
      });
      return { kind: "status", n: r.updated };
    }),
  /** ADH-06 : validation groupée ; chaque demande suit le même parcours qu'une validation seule. */
  bulkApprove: (event) =>
    bulk(event, async (_f, ids, token, ip) => {
      const r = await api<{ approved: number; skipped: number }>("/applications/approve-many", {
        body: { ids: ids.slice(0, 100) },
        token,
        ip,
      });
      return { kind: "approve", n: r.approved, skipped: r.skipped };
    }),
};
