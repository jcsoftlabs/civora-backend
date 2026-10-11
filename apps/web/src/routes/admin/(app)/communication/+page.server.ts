import { error, fail } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import { uploadFile } from "$lib/server/upload";
import { audienceFrom, type StoredAudience } from "./audience";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";

export interface Publication {
  id: string;
  kind: "announcement" | "news" | "editorial" | "podcast" | "album";
  title: { fr: string; ht?: string };
  body: { fr: string; ht?: string } | null;
  audience: StoredAudience | null;
  publishedAt: string | null;
  createdAt: string;
}
export interface Campaign {
  id: string;
  channel: string;
  content: { title: { fr: string; ht?: string }; body: { fr: string; ht?: string } };
  audience: StoredAudience | null;
  status: "scheduled" | "sending" | "sent" | "cancelled" | "failed";
  scheduledAt: string | null;
  sentAt: string | null;
  sentCount: number | null;
  failedCount: number | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** COM-01 et COM-02 : publications du parti et notifications push ciblées. */
export const load: PageServerLoad = async ({ url, cookies, locals, getClientAddress }) => {
  const s = (await currentSession(cookies, locals.partySlug!))!;
  const can = (p: string) => s.me.permissions.includes(p);
  if (!can("publications.manage") && !can("outreach.send")) error(403, { message: "forbidden", code: "forbidden" });
  const call = <T>(path: string) => api<T>(path, { token: s.token, ip: getClientAddress() });

  const view =
    url.searchParams.get("vue") === "notifications" || !can("publications.manage") ? "notifications" : "publications";
  const tab =
    (["draft", "scheduled", "published"] as const).find((x) => x === url.searchParams.get("etat")) ?? "published";
  const [publications, campaigns, statuses, organs] = await Promise.all([
    view === "publications"
      ? call<{ publications: Publication[] }>(`/publications?status=${tab}`).then((r) => r.publications)
      : [],
    view === "notifications" && can("outreach.send")
      ? call<{ campaigns: Campaign[] }>("/outreach").then((r) => r.campaigns.filter((c) => c.channel === "push"))
      : [],
    call<{ statuses: Array<{ id: string; label: { fr: string; ht?: string } }> }>("/member-statuses").then(
      (r) => r.statuses,
    ),
    can("organs.manage")
      ? call<{ organs: Array<{ id: string; name: string }> }>("/organs").then((r) =>
          r.organs.map(({ id, name }) => ({ id, name })),
        )
      : [],
  ]);
  // Publication ouverte dans le panneau (?pub=<id> ou ?pub=nouvelle), cherchée dans tous les états.
  const pubId = url.searchParams.get("pub");
  let editing: Publication | null = null;
  if (pubId && UUID.test(pubId)) {
    editing =
      publications.find((p) => p.id === pubId) ??
      (await call<{ publications: Publication[] }>("/publications")).publications.find((p) => p.id === pubId) ??
      null;
  }
  // Noms des zones de la publication ouverte (l'audience enregistrée ne garde que les codes).
  const zoneNames: Record<string, string> = {};
  for (const code of editing?.audience?.zoneCodes ?? []) {
    const z = await call<{ zone: { name: string } }>(`/zones/${encodeURIComponent(code)}`).catch(() => null);
    if (z) zoneNames[code] = z.zone.name;
  }
  return {
    zoneNames,
    view,
    tab,
    publications,
    campaigns,
    statuses,
    organs,
    editing,
    composing: pubId === "nouvelle" ? "publication" : url.searchParams.has("notifier") ? "push" : null,
  };
};

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const i18n = (f: FormData, k: string) => {
  const fr = text(f, `${k}Fr`);
  const ht = text(f, `${k}Ht`);
  return fr ? { fr, ...(ht ? { ht } : {}) } : undefined;
};

async function act(event: RequestEvent, call: (f: FormData, token: string, ip: string) => Promise<object | void>) {
  const s = await currentSession(event.cookies, event.locals.partySlug!);
  if (!s || s.me.mfaPending) return fail(401, { code: "unauthorized" });
  const f = await event.request.formData();
  try {
    return { ok: true, ...((await call(f, s.token, event.getClientAddress())) ?? {}) };
  } catch (e) {
    if (e instanceof ApiFailure) return fail(e.status === 429 ? 429 : 400, { code: e.code });
    throw e;
  }
}

/** Date locale saisie (datetime-local, heure d'Haïti) en instant ISO. */
const when = (v: string, offset: string) => (v ? new Date(`${v}:00${offset}`).toISOString() : undefined);

export const actions: Actions = {
  /** Enregistre la publication (création ou mise à jour), puis la publie ou la programme si demandé. */
  savePublication: (event) =>
    act(event, async (f, token, ip) => {
      const media: string[] = [];
      for (const file of f.getAll("media")) {
        if (file instanceof File && file.size > 0)
          media.push(await uploadFile(file, "publication_media", { token, ip }));
      }
      const body = {
        kind: text(f, "kind"),
        title: i18n(f, "title"),
        ...(i18n(f, "body") ? { body: i18n(f, "body") } : {}),
        audience: audienceFrom(f),
        ...(media.length ? { mediaFileIds: media } : {}),
      };
      let id = text(f, "id");
      if (id) {
        await api(`/publications/${encodeURIComponent(id)}`, { method: "PATCH", body, token, ip });
      } else {
        id = (await api<{ id: string }>("/publications", { body, token, ip })).id;
      }
      const intent = text(f, "intent");
      if (intent === "publish" || intent === "schedule") {
        const at = intent === "schedule" ? when(text(f, "at"), text(f, "tz") || "-04:00") : undefined;
        await api(`/publications/${id}/publish`, { body: at ? { at } : {}, token, ip });
        return { done: intent === "publish" ? "published" : "scheduled", id };
      }
      return { done: "saved", id };
    }),
  unpublish: (event) =>
    act(event, async (f, token, ip) => {
      await api(`/publications/${encodeURIComponent(text(f, "id"))}/unpublish`, { body: {}, token, ip });
      return { done: "unpublished" };
    }),
  /** COM-02 : notification immédiate ou programmée, envoyée par le worker. */
  push: (event) =>
    act(event, async (f, token, ip) => {
      const at = text(f, "when") === "later" ? when(text(f, "at"), text(f, "tz") || "-04:00") : undefined;
      await api("/outreach/push", {
        body: {
          title: i18n(f, "title"),
          body: i18n(f, "body"),
          audience: audienceFrom(f),
          ...(at ? { scheduledAt: at } : {}),
        },
        token,
        ip,
      });
      return { done: at ? "pushLater" : "pushNow" };
    }),
  cancelPush: (event) =>
    act(event, async (f, token, ip) => {
      await api(`/outreach/${encodeURIComponent(text(f, "id"))}/cancel`, { body: {}, token, ip });
      return { done: "pushCancelled" };
    }),
};
