import { error, fail } from "@sveltejs/kit";
import { isOrganizationKind, type OrganizationKind } from "@civora/shared";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import { uploadFile } from "$lib/server/upload";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";

export interface Settings {
  name: string;
  slug: string;
  kind: OrganizationKind;
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

export interface Engagement {
  referralEnabled: boolean;
  /** Adhésion par parrainage : le parrainage ne peut pas être désactivé. */
  referralForced: boolean;
  /** Points compris dans la formule (Mouvement, National). */
  points: boolean;
  scale: Record<"referral" | "training" | "vote" | "dues" | "attendance", number>;
}
const POINT_ACTIONS = ["referral", "training", "vote", "dues", "attendance"] as const;

/** SOC-01, SOC-03, ADH-03, ADH-04, ENG-01, GAM-01 : réglages du parti (settings.party), journalisés par l'API. */
export const load: PageServerLoad = async ({ cookies, locals, getClientAddress }) => {
  const s = (await currentSession(cookies, locals.partySlug!))!;
  const ip = getClientAddress();
  try {
    const [settings, engagement] = await Promise.all([
      api<Settings>("/party/settings", { token: s.token, ip }),
      api<Engagement>("/party/engagement", { token: s.token, ip }),
    ]);
    return { settings, engagement };
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 403) error(403, { message: "forbidden", code: "forbidden" });
    throw e;
  }
};

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const HEX = /^#[0-9a-f]{6}$/i;

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
  /** Type d'organisation (SOC-11) : change le vocabulaire des écrans ; refusé pendant un cycle électoral. */
  kind: (event) =>
    act(event, "kind", (f, token, ip) => {
      const kind = text(f, "kind");
      if (!isOrganizationKind(kind)) throw new ApiFailure(400, "invalid_request");
      return branding({ kind }, token, ip);
    }),
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
      if (!(file instanceof File)) throw new ApiFailure(400, "invalid_request");
      const fileId = await uploadFile(file, "party_logo", { token, ip });
      await branding({ logoFileId: fileId }, token, ip);
    }),

  removeLogo: (event) => act(event, "logoRemoved", (_f, token, ip) => branding({ logoFileId: null }, token, ip)),

  languages: (event) =>
    act(event, "languages", (f, token, ip) =>
      branding({ languages: [...new Set(f.getAll("languages").map(String))] }, token, ip),
    ),

  /** ENG-01, GAM-01 : parrainage des membres et barème des points. */
  engagement: (event) =>
    act(event, "engagement", (f, token, ip) => {
      const scale = Object.fromEntries(
        POINT_ACTIONS.flatMap((a) => {
          const v = text(f, `scale_${a}`);
          return /^\d{1,4}$/.test(v) ? [[a, Number(v)]] : [];
        }),
      );
      return api("/party/engagement", {
        method: "PUT",
        body: { referralEnabled: f.get("referral") === "on", ...(Object.keys(scale).length ? { scale } : {}) },
        token,
        ip,
      });
    }),

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
