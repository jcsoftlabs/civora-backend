import { error } from "@sveltejs/kit";
import type { OrganizationKind } from "@civora/shared";
import { ApiFailure, api } from "$lib/server/api";
import type { LayoutServerLoad } from "./$types";

export interface PartyProfile {
  name: string;
  slug: string;
  kind: OrganizationKind;
  brandColor: string;
  brandColorSecondary: string | null;
  logoUrl: string | null;
}

/** Back-office : uniquement sur l'adresse d'un parti, jamais mis en cache, jamais indexé. */
export const load: LayoutServerLoad = async ({ locals, setHeaders, getClientAddress }) => {
  if (!locals.partySlug) error(404, { message: "not_found", code: "not_found" });
  setHeaders({ "cache-control": "private, no-store", "x-robots-tag": "noindex" });
  try {
    const party = await api<PartyProfile>(`/parties/${locals.partySlug}/public`, { ip: getClientAddress() });
    return { party };
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 404) error(404, { message: "not_found", code: "not_found" });
    throw e;
  }
};
