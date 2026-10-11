import { error } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import type { PageServerLoad } from "./$types";

interface Verification {
  valid: boolean;
  party?: string;
  member?: { number: string; name: string; photoUrl: string | null };
  duesUpToDate?: boolean;
  checkedAt?: string;
}

/** ADH-11 : page ouverte par le scan du QR de la carte, sur l'adresse du parti. Jamais mise en cache. */
export const load: PageServerLoad = async ({ params, locals, setHeaders, getClientAddress }) => {
  if (!locals.partySlug) error(404, { message: "not_found", code: "not_found" });
  setHeaders({ "cache-control": "no-store", "x-robots-tag": "noindex" });
  try {
    const result = await api<Verification>(`/parties/${locals.partySlug}/cards/${encodeURIComponent(params.token)}`, {
      ip: getClientAddress(),
    });
    return { result };
  } catch (e) {
    if (e instanceof ApiFailure) return { result: { valid: false } as Verification };
    throw e;
  }
};
