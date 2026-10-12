import { error, fail } from "@sveltejs/kit";
import { hasFeature, type CardDesign } from "@civora/shared";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import { uploadFile } from "$lib/server/upload";
import type { Actions, PageServerLoad } from "./$types";

export interface CardTemplate {
  design: CardDesign & { fields: Record<string, boolean> };
  party: { name: string; brandColor: string; brandColorSecondary: string | null; logoUrl: string | null };
  assets: { backgroundUrl: string | null; signatureUrl: string | null };
}

/** ADH-13 : éditeur de la carte de membre (settings.party, formules avec la carte). */
export const load: PageServerLoad = async ({ cookies, locals, getClientAddress }) => {
  const s = (await currentSession(cookies, locals.partySlug!))!;
  if (!s.me.permissions.includes("settings.party")) error(403, { message: "forbidden", code: "forbidden" });
  if (!s.me.tier || !hasFeature(s.me.tier, "members.card")) return { template: null, locked: true };
  const template = await api<CardTemplate>("/party/card-template", { token: s.token, ip: getClientAddress() });
  return { template, locked: false };
};

async function session(event: Parameters<Actions[string]>[0]) {
  const s = await currentSession(event.cookies, event.locals.partySlug!);
  if (!s || s.me.mfaPending) return null;
  return s;
}

export const actions: Actions = {
  save: async (event) => {
    const s = await session(event);
    if (!s) return fail(401, { code: "unauthorized" });
    const f = await event.request.formData();
    try {
      const design = JSON.parse(String(f.get("design") ?? "{}"));
      await api("/party/card-template", {
        method: "PUT",
        body: { design },
        token: s.token,
        ip: event.getClientAddress(),
      });
      return { ok: true, done: "saved" };
    } catch (e) {
      if (e instanceof ApiFailure) return fail(400, { code: e.code });
      if (e instanceof SyntaxError) return fail(400, { code: "invalid_request" });
      throw e;
    }
  },
  /** Image du fond ou signature du verso : envoyée par le serveur web, puis citée dans le modèle. */
  upload: async (event) => {
    const s = await session(event);
    if (!s) return fail(401, { code: "unauthorized" });
    const f = await event.request.formData();
    const file = f.get("file");
    const purpose = String(f.get("purpose"));
    if (!(file instanceof File) || (purpose !== "card_background" && purpose !== "signature"))
      return fail(400, { code: "invalid_request" });
    try {
      const ip = event.getClientAddress();
      const fileId = await uploadFile(file, purpose, { token: s.token, ip });
      const { url } = await api<{ url: string }>(`/files/${fileId}/url`, { token: s.token, ip });
      return { ok: true, uploaded: { purpose, fileId, url } };
    } catch (e) {
      if (e instanceof ApiFailure) return fail(400, { code: e.code });
      throw e;
    }
  },
};
