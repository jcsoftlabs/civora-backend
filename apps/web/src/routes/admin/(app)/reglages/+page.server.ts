import { error, fail } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";

export interface Settings {
  name: string;
  slug: string;
  brandColor: string;
  brandColorSecondary: string | null;
  languages: string[];
  admissionMode: "libre" | "validation" | "parrainage";
  otpChannels: string[];
  logoUrl: string | null;
  tier: "essentiel" | "mouvement" | "national";
  siteLanguagesQuota: number;
  statuses: Array<{ id: string; label: { fr: string; ht?: string }; rank: number; members: number }>;
}

/** SOC-01, SOC-03, ADH-03, ADH-04 : réglages du parti (settings.party), tous journalisés par l'API. */
export const load: PageServerLoad = async ({ cookies, locals, getClientAddress }) => {
  const s = (await currentSession(cookies, locals.partySlug!))!;
  try {
    return { settings: await api<Settings>("/party/settings", { token: s.token, ip: getClientAddress() }) };
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 403) error(403, { message: "forbidden", code: "forbidden" });
    throw e;
  }
};

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const HEX = /^#[0-9a-f]{6}$/i;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const LOGO_MAX = 2 * 1024 * 1024;

async function act(
  event: RequestEvent,
  done: string | ((f: FormData) => string),
  call: (f: FormData, token: string, ip: string) => Promise<unknown>,
) {
  const s = await currentSession(event.cookies, event.locals.partySlug!);
  if (!s || s.me.mfaPending) return fail(401, { code: "unauthorized" });
  const f = await event.request.formData();
  try {
    await call(f, s.token, event.getClientAddress());
    return { ok: true, done: typeof done === "function" ? done(f) : done };
  } catch (e) {
    if (e instanceof ApiFailure)
      return fail(e.status === 429 ? 429 : 400, { code: e.code, requiredTier: e.requiredTier });
    throw e;
  }
}

const branding = (body: object, token: string, ip: string) =>
  api("/party/branding", { method: "PATCH", body, token, ip });

export const actions: Actions = {
  identity: (event) =>
    act(event, "identity", (f, token, ip) => {
      const color = text(f, "brandColor");
      const second = text(f, "brandColorSecondary");
      if (!HEX.test(color) || (second && !HEX.test(second))) throw new ApiFailure(400, "invalid_request");
      return branding({ name: text(f, "name"), brandColor: color, brandColorSecondary: second || null }, token, ip);
    }),

  /**
   * Logo : le fichier passe par le serveur web (pas d'accès direct du navigateur au stockage), puis suit le
   * parcours habituel : demande d'envoi, dépôt sur l'URL signée, vérification par l'API, rattachement au parti.
   */
  logo: (event) =>
    act(event, "logo", async (f, token, ip) => {
      const file = f.get("logo");
      if (!(file instanceof File) || file.size === 0) throw new ApiFailure(400, "invalid_request");
      if (!LOGO_TYPES.includes(file.type)) throw new ApiFailure(400, "file_type_not_allowed");
      if (file.size > LOGO_MAX) throw new ApiFailure(413, "file_too_large");
      const ticket = await api<{
        fileId: string;
        upload: { url: string; method: string; headers: Record<string, string> };
      }>("/files/uploads", {
        body: {
          purpose: "party_logo",
          name: file.name.slice(0, 120) || "logo",
          mimeType: file.type,
          sizeBytes: file.size,
        },
        token,
        ip,
      });
      const put = await fetch(ticket.upload.url, {
        method: ticket.upload.method,
        headers: ticket.upload.headers,
        body: Buffer.from(await file.arrayBuffer()),
      });
      if (!put.ok) throw new ApiFailure(502, "upload_failed");
      await api(`/files/${ticket.fileId}/complete`, { method: "POST", body: {}, token, ip });
      await branding({ logoFileId: ticket.fileId }, token, ip);
    }),

  removeLogo: (event) => act(event, "logoRemoved", (_f, token, ip) => branding({ logoFileId: null }, token, ip)),

  languages: (event) =>
    act(event, "languages", (f, token, ip) =>
      branding({ languages: [...new Set(f.getAll("languages").map(String))] }, token, ip),
    ),

  admission: (event) =>
    act(event, "admission", (f, token, ip) =>
      api("/party/admission", { method: "PUT", body: { admissionMode: text(f, "admissionMode") }, token, ip }),
    ),

  /** ADH-03 : statut nouveau (sans `id`) ou modifié. */
  status: (event) =>
    act(
      event,
      (f) => (text(f, "id") ? "status" : "statusCreated"),
      (f, token, ip) => {
        const label = { fr: text(f, "labelFr"), ...(text(f, "labelHt") ? { ht: text(f, "labelHt") } : {}) };
        const rank = Number(text(f, "rank") || "0");
        const id = text(f, "id");
        return id
          ? api(`/member-statuses/${encodeURIComponent(id)}`, { method: "PATCH", body: { label, rank }, token, ip })
          : api("/member-statuses", { body: { label, rank }, token, ip });
      },
    ),
};
