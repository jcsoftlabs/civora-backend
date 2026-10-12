import { error, fail, redirect } from "@sveltejs/kit";
import { hasFeature } from "@civora/shared";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import { uploadFile } from "$lib/server/upload";
import type { Actions, PageServerLoad } from "./$types";

export type ImportState = "mapping" | "preview" | "queued" | "running" | "done" | "failed";
export interface ImportSummary {
  rows: number;
  valid: number;
  blocked: number;
  duplicates: number;
  duplicatesInFile: number;
  errors: Record<string, number>;
  warnings: Record<string, number>;
  unknownZones: Array<{ key: string; label: string; count: number; example: number }>;
  quota: { limit: number; current: number; after: number } | null;
}
export interface ImportView {
  id: string;
  state: ImportState;
  source: "file" | "sheet";
  kind: "members" | "dues";
  settings: { mapping: Record<string, number>; zoneFixes: Record<string, string>; defaultStatusId: string | null };
  report: {
    headers?: string[];
    rows?: number;
    summary?: ImportSummary & { totals?: Record<string, string> };
    result?: Record<string, number>;
  } | null;
  inviteRequestedAt: string | null;
  table: { headers: string[]; sample: string[][]; rows: number } | null;
  progress?: { total: number; done: number };
}
export interface ImportRow {
  line: number;
  name: string;
  phone: string | null;
  email: string | null;
  hasIdentity: boolean;
  zone: string;
  issues: string[];
  duplicate: { reason: string; member: { id: string; name: string; number: string } | null } | null;
  decision: "create" | "merge" | "skip";
  payment: { amount: string; currency: string; paidAt: string; periods: string[]; number: string | null } | null;
  result: string | null;
}

const TABS = ["duplicates", "errors", "warnings"] as const;

/** ADH-07 à ADH-09 : assistant d'import du fichier de membres (members.import). */
export const load: PageServerLoad = async ({ cookies, locals, url, getClientAddress }) => {
  const s = (await currentSession(cookies, locals.partySlug!))!;
  const canMembers = s.me.permissions.includes("members.import");
  // ADH-10 : l'historique des cotisations relève du trésorier (payments.recordCash), formules Mouvement et National.
  const canDues = s.me.permissions.includes("payments.recordCash");
  if (!canMembers && !canDues) error(403, { message: "forbidden", code: "forbidden" });
  const duesInPlan = !!s.me.tier && hasFeature(s.me.tier, "dues.history");
  const auth = { token: s.token, ip: getClientAddress() };
  const id = url.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    const kind = url.searchParams.get("kind") === "dues" || !canMembers ? "dues" : "members";
    const { imports } = await api<{
      imports: Array<{
        id: string;
        state: ImportState;
        source: string;
        kind: "members" | "dues";
        name: string | null;
        createdAt: string;
      }>;
    }>("/member-imports", auth);
    return {
      view: null,
      imports,
      rows: null,
      tab: null,
      statuses: [],
      links: null,
      kind,
      canMembers,
      canDues,
      duesLocked: kind === "dues" && !duesInPlan,
    };
  }
  const view = await api<ImportView>(`/member-imports/${id}`, auth).catch((e) => {
    if (e instanceof ApiFailure && e.status === 404) error(404, { message: "not_found", code: "not_found" });
    throw e;
  });
  const tab = TABS.find((t) => t === url.searchParams.get("tab")) ?? "duplicates";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const rows =
    view.state === "preview"
      ? await api<{ total: number; rows: ImportRow[] }>(`/member-imports/${id}/rows?kind=${tab}&page=${page}`, auth)
      : null;
  const { statuses } =
    view.kind === "members" && (view.state === "mapping" || view.state === "preview")
      ? await api<{ statuses: Array<{ id: string; label: { fr: string; ht?: string } }> }>("/member-statuses", auth)
      : { statuses: [] };
  const lang = url.searchParams.get("lang") === "ht" ? "ht" : "fr";
  const links =
    view.state === "done" && view.kind === "members"
      ? await api<{ total: number; links: Array<{ name: string; number: string; phone: string; url: string }> }>(
          `/member-imports/${id}/whatsapp?lang=${lang}&page=${page}`,
          auth,
        )
      : null;
  return {
    view,
    imports: [],
    rows,
    tab,
    page,
    statuses,
    links,
    lang,
    kind: view.kind,
    canMembers,
    canDues,
    duesLocked: false,
  };
};

async function session(event: Parameters<Actions[string]>[0]) {
  const s = await currentSession(event.cookies, event.locals.partySlug!);
  if (!s || s.me.mfaPending) return null;
  return { token: s.token, ip: event.getClientAddress() };
}

/** Type d'un fichier d'après son extension : un CSV arrive souvent sans type, ou en « ms-excel ». */
function typed(file: File): File {
  const ext = file.name.toLowerCase().split(".").pop();
  const type =
    ext === "csv"
      ? "text/csv"
      : ext === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : file.type;
  return type === file.type ? file : new File([file], file.name, { type });
}

const failure = (e: unknown) => {
  if (e instanceof ApiFailure) return fail(e.status === 413 ? 413 : 400, { code: e.code });
  throw e;
};

export const actions: Actions = {
  /** Étape 1 : fichier déposé ou lien Google Sheets. */
  start: async (event) => {
    const auth = await session(event);
    if (!auth) return fail(401, { code: "unauthorized" });
    const f = await event.request.formData();
    const file = f.get("file");
    const sheetUrl = String(f.get("sheetUrl") ?? "").trim();
    const kind = f.get("kind") === "dues" ? "dues" : "members";
    let id: string;
    try {
      if (file instanceof File && file.size > 0) {
        if (/\.xls$/i.test(file.name)) return fail(400, { code: "import_xls_unsupported" });
        const fileId = await uploadFile(typed(file), "member_import", auth);
        ({ id } = await api<{ id: string }>("/member-imports", { body: { fileId, kind }, ...auth }));
      } else if (sheetUrl) {
        ({ id } = await api<{ id: string }>("/member-imports", { body: { sheetUrl, kind }, ...auth }));
      } else return fail(400, { code: "import_source_required" });
    } catch (e) {
      return failure(e);
    }
    redirect(303, `?id=${id}`);
  },

  /** Étape 2 : colonnes, statut par défaut et zones corrigées, puis aperçu. */
  settings: async (event) => {
    const auth = await session(event);
    if (!auth) return fail(401, { code: "unauthorized" });
    const f = await event.request.formData();
    const id = String(f.get("id"));
    const mapping: Record<string, number> = {};
    const zoneFixes: Record<string, string> = {};
    for (const [k, v] of f.entries()) {
      if (k.startsWith("map:") && v !== "") mapping[k.slice(4)] = Number(v);
      if (k.startsWith("fix:") && v !== "") zoneFixes[k.slice(4)] = String(v);
    }
    // Les corrections déjà enregistrées restent, sauf si on en choisit une autre.
    const kept = JSON.parse(String(f.get("keptFixes") ?? "{}")) as Record<string, string>;
    try {
      await api(`/member-imports/${id}/settings`, {
        method: "PUT",
        body: {
          mapping,
          zoneFixes: { ...kept, ...zoneFixes },
          defaultStatusId: String(f.get("defaultStatusId") ?? "") || null,
        },
        ...auth,
      });
    } catch (e) {
      return failure(e);
    }
    redirect(303, `?id=${id}`);
  },

  /** Étape 3 : fusionner ou rejeter un doublon, ou tous. */
  decide: async (event) => {
    const auth = await session(event);
    if (!auth) return fail(401, { code: "unauthorized" });
    const f = await event.request.formData();
    const id = String(f.get("id"));
    const line = Number(f.get("line"));
    try {
      await api(`/member-imports/${id}/decisions`, {
        body: { decision: String(f.get("decision")), ...(line ? { lines: [line] } : {}) },
        ...auth,
      });
      return { ok: true };
    } catch (e) {
      return failure(e);
    }
  },

  run: async (event) => {
    const auth = await session(event);
    if (!auth) return fail(401, { code: "unauthorized" });
    const id = String((await event.request.formData()).get("id"));
    try {
      await api(`/member-imports/${id}/run`, { method: "POST", body: {}, ...auth });
    } catch (e) {
      return failure(e);
    }
    redirect(303, `?id=${id}`);
  },

  invite: async (event) => {
    const auth = await session(event);
    if (!auth) return fail(401, { code: "unauthorized" });
    const id = String((await event.request.formData()).get("id"));
    try {
      const r = await api<{ queued: number }>(`/member-imports/${id}/invitations`, { body: {}, ...auth });
      return { ok: true, invited: r.queued };
    } catch (e) {
      return failure(e);
    }
  },
};
