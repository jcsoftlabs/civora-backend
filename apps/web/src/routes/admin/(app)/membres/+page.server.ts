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
    return {
      list,
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
    const [member, dues] = await Promise.all([
      api<MemberDetail>(`/members/${id}`, { token, ip }),
      canDues ? api<DuesStatement>(`/members/${id}/dues`, { token, ip }).catch(() => null) : null,
    ]);
    return { member, dues };
  } catch (e) {
    // Membre introuvable ou hors de la zone : pas de panneau, la liste reste affichée.
    if (e instanceof ApiFailure && (e.status === 404 || e.status === 403)) return null;
    throw e;
  }
}

/** Appel d'une action du panneau ; une erreur de l'API revient au formulaire avec son code. */
async function act(
  event: RequestEvent,
  method: "POST" | "PATCH",
  path: (id: string) => string,
  body: (f: FormData) => object,
  done: "saved" | "approved" | "rejected",
) {
  const s = await currentSession(event.cookies, event.locals.partySlug!);
  if (!s || s.me.mfaPending) return fail(401, { code: "forbidden" });
  const f = await event.request.formData();
  const id = String(f.get("id") ?? "");
  if (!UUID.test(id)) return fail(400, { code: "invalid_request" });
  try {
    await api(path(id), { method, body: body(f), token: s.token, ip: event.getClientAddress() });
    return { ok: true, done };
  } catch (e) {
    if (e instanceof ApiFailure)
      return fail(e.status === 429 ? 429 : 400, { code: e.status === 403 ? "forbidden" : e.code });
    throw e;
  }
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export const actions: Actions = {
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
};
