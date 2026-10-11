import { error, fail } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import type { Actions, PageServerLoad } from "./$types";
import { FAMILIES } from "./families";

export interface AuditEntry {
  seq: number;
  action: string;
  actorKind: "member" | "staff" | "system";
  actor: { firstName: string; lastName: string; number: string } | null;
  targetType: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  hash: string;
}

/** SEC-06 : lecture du journal (audit.read, poste national). */
export const load: PageServerLoad = async ({ url, cookies, locals, getClientAddress }) => {
  const s = (await currentSession(cookies, locals.partySlug!))!;
  if (!s.me.permissions.includes("audit.read")) error(403, { message: "forbidden", code: "forbidden" });
  const params = new URLSearchParams({ limit: "50" });
  const family = url.searchParams.get("domaine");
  if (family && (FAMILIES as readonly string[]).includes(family)) params.set("family", family);
  const before = url.searchParams.get("avant");
  if (before && /^\d+$/.test(before)) params.set("before", before);
  try {
    const r = await api<{ entries: AuditEntry[]; nextBefore: number | null }>(`/audit?${params}`, {
      token: s.token,
      ip: getClientAddress(),
    });
    return { ...r, family: params.get("family") };
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 403) error(403, { message: "forbidden", code: "forbidden" });
    throw e;
  }
};

export const actions: Actions = {
  /** Vérification de toute la chaîne : à la demande, elle relit chaque ligne. */
  verify: async ({ cookies, locals, getClientAddress }) => {
    const s = await currentSession(cookies, locals.partySlug!);
    if (!s || s.me.mfaPending) return fail(401, { code: "unauthorized" });
    try {
      const r = await api<{ intact: boolean; brokenAt: number | null; checked: number }>("/audit/verify", {
        token: s.token,
        ip: getClientAddress(),
      });
      return { verified: { ...r, at: new Date().toISOString() } };
    } catch (e) {
      if (e instanceof ApiFailure) return fail(400, { code: e.code });
      throw e;
    }
  },
};
