import { error, fail } from "@sveltejs/kit";
import { hasFeature } from "@civora/shared";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import type { Actions, PageServerLoad } from "./$types";

type I18n = { fr: string; ht?: string };
export interface Signatory {
  name: string;
  role: I18n;
  signatureFileId: string | null;
  signatureUrl: string | null;
}
export interface Template {
  title: I18n | null;
  mention: I18n | null;
  footer: I18n | null;
  accentColor: string | null;
  showLogo: boolean;
  signatories: Signatory[];
}

/** FOR-04 : modèle de certificat du parti (formule National). Hors formule, l'écran dit ce qu'il apporte. */
export const load: PageServerLoad = async ({ cookies, locals, getClientAddress }) => {
  const s = (await currentSession(cookies, locals.partySlug!))!;
  if (!s.me.permissions.includes("training.manage")) error(403, { message: "forbidden", code: "forbidden" });
  if (!s.me.tier || !hasFeature(s.me.tier, "training.certificates")) return { template: null, locked: true };
  const template = await api<Template>("/certificate-template", { token: s.token, ip: getClientAddress() });
  return { template, locked: false };
};

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const i18n = (f: FormData, k: string): I18n | null => {
  const fr = text(f, `${k}Fr`);
  const ht = text(f, `${k}Ht`);
  return fr ? { fr, ...(ht ? { ht } : {}) } : null;
};

export const actions: Actions = {
  save: async ({ request, cookies, locals, getClientAddress }) => {
    const s = await currentSession(cookies, locals.partySlug!);
    if (!s || s.me.mfaPending) return fail(401, { code: "unauthorized" });
    const f = await request.formData();
    let signatories: unknown = [];
    try {
      signatories = JSON.parse(text(f, "signatories") || "[]");
    } catch {
      return fail(400, { code: "invalid_request" });
    }
    const color = text(f, "accentColor");
    try {
      await api("/certificate-template", {
        method: "PUT",
        body: {
          title: i18n(f, "title"),
          mention: i18n(f, "mention"),
          footer: i18n(f, "footer"),
          accentColor: f.get("partyColor") === "on" || !/^#[0-9a-fA-F]{6}$/.test(color) ? null : color,
          showLogo: f.get("showLogo") === "on",
          signatories,
        },
        token: s.token,
        ip: getClientAddress(),
      });
      return { ok: true };
    } catch (e) {
      if (e instanceof ApiFailure) return fail(400, { code: e.code });
      throw e;
    }
  },
};
