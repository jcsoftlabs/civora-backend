import { error, fail } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { CONSOLE_COOKIE } from "$lib/server/console-session";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";

export interface OrgDetail {
  id: string;
  slug: string;
  name: string;
  kind: "party" | "association" | "ngo" | "union";
  tier: "essentiel" | "mouvement" | "national";
  status: string;
  createdAt: string;
  activatedAt: string | null;
  electionsModuleUntil: string | null;
  address: string;
  founder: { name: string; email: string | null } | null;
  totals: {
    members: number;
    newMembers30: number;
    pendingApplications: number;
    activeUsers30: number;
    storageBytes: number;
    lastActivity: string | null;
    collected30: Array<{ currency: string; total: string; payments: number }>;
    subscription: { status: string; tier: string; billingCycle: string; periodEnd: string | null } | null;
  } | null;
  history: Array<{
    id: string;
    action: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
    staff: string | null;
  }>;
}

const UUID = /^[0-9a-f-]{36}$/i;

/** Fiche d'une organisation (SOC-10) : totaux, abonnement, fondateur, historique de la console. */
export const load: PageServerLoad = async ({ params, cookies, getClientAddress }) => {
  if (!UUID.test(params.id)) error(404, { message: "not_found", code: "not_found" });
  try {
    return {
      org: await api<OrgDetail>(`/console/organizations/${params.id}`, {
        consoleToken: cookies.get(CONSOLE_COOKIE)!,
        ip: getClientAddress(),
      }),
    };
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 404) error(404, { message: "not_found", code: "not_found" });
    throw e;
  }
};

/** Action de la console sur l'organisation : appel de l'API, message de réussite ou code d'erreur. */
async function act(event: RequestEvent, done: string, path: string, body?: (f: FormData) => object) {
  const f = await event.request.formData();
  try {
    await api(`/console/organizations/${event.params.id}/${path}`, {
      method: "POST",
      body: body ? body(f) : {},
      consoleToken: event.cookies.get(CONSOLE_COOKIE)!,
      ip: event.getClientAddress(),
    });
    return { ok: true, done };
  } catch (e) {
    if (e instanceof ApiFailure) return fail(e.status === 403 ? 403 : 400, { code: e.code });
    throw e;
  }
}
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export const actions: Actions = {
  activate: (e) => act(e, "activate", "activate"),
  invite: (e) => act(e, "invite", "invite"),
  suspend: (e) => act(e, "suspend", "suspension", (f) => ({ suspended: true, reason: text(f, "reason") || undefined })),
  reactivate: (e) => act(e, "reactivate", "suspension", () => ({ suspended: false })),
  tier: (e) => act(e, "tier", "tier", (f) => ({ tier: text(f, "tier") })),
  trial: (e) => act(e, "trial", "trial", (f) => ({ days: Number(text(f, "days")) })),
  elections: (e) => act(e, "elections", "elections", (f) => ({ months: Number(text(f, "months")) })),
};
