import { error, fail } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";

export interface ManagedEvent {
  id: string;
  kind: "rassemblement" | "reunion" | "congres" | "formation";
  title: { fr: string; ht?: string };
  description: { fr: string; ht?: string } | null;
  startsAt: string;
  endsAt: string;
  address: string | null;
  capacity: number | null;
  zoneCode: string | null;
  zoneName: string | null;
  organId: string | null;
  organName: string | null;
  registered: number;
}
export interface Registrant {
  memberId: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  registeredAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ENG-03 : événements de la zone de la personne, création, modification, inscrits. */
export const load: PageServerLoad = async ({ url, cookies, locals, getClientAddress }) => {
  const s = (await currentSession(cookies, locals.partySlug!))!;
  if (!s.me.permissions.includes("events.manage")) error(403, { message: "forbidden", code: "forbidden" });
  const call = <T>(path: string) => api<T>(path, { token: s.token, ip: getClientAddress() });
  const period = url.searchParams.get("periode") === "passes" ? "past" : "upcoming";
  const [list, organs] = await Promise.all([
    call<{ events: ManagedEvent[] }>(`/events/manage?period=${period}`).then((r) => r.events),
    s.me.permissions.includes("organs.manage")
      ? call<{ organs: Array<{ id: string; name: string; zoneCode: string | null }> }>("/organs").then((r) =>
          r.organs.map(({ id, name, zoneCode }) => ({ id, name, zoneCode })),
        )
      : [],
  ]);
  const open = url.searchParams.get("e");
  let panel: { event: ManagedEvent; registrants: Registrant[] } | null = null;
  if (open && UUID.test(open)) {
    const event =
      list.find((e) => e.id === open) ??
      (
        await call<{ events: ManagedEvent[] }>(`/events/manage?period=${period === "past" ? "upcoming" : "past"}`)
      ).events.find((e) => e.id === open);
    if (event) {
      const registrants = (await call<{ registrations: Registrant[] }>(`/events/${event.id}/registrations`))
        .registrations;
      panel = { event, registrants };
    }
  }
  return { period, events: list, organs, panel, creating: url.searchParams.has("nouveau") };
};

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const i18n = (f: FormData, k: string) => {
  const fr = text(f, `${k}Fr`);
  const ht = text(f, `${k}Ht`);
  return fr ? { fr, ...(ht ? { ht } : {}) } : null;
};
/** Date locale saisie (datetime-local) et décalage du navigateur, en instant ISO. */
const instant = (f: FormData, k: string) => {
  const v = text(f, k);
  return v ? new Date(`${v}:00${text(f, "tz") || "-04:00"}`).toISOString() : undefined;
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

export const actions: Actions = {
  create: (event) =>
    act(event, async (f, token, ip) => {
      const capacity = text(f, "capacity");
      const description = i18n(f, "description");
      const r = await api<{ id: string }>("/events", {
        body: {
          kind: text(f, "kind"),
          title: i18n(f, "title"),
          ...(description ? { description } : {}),
          startsAt: instant(f, "startsAt"),
          endsAt: instant(f, "endsAt"),
          ...(text(f, "zoneCode") ? { zoneCode: text(f, "zoneCode") } : {}),
          ...(text(f, "organId") ? { organId: text(f, "organId") } : {}),
          ...(text(f, "address") ? { address: text(f, "address") } : {}),
          ...(capacity ? { capacity: Number(capacity) } : {}),
        },
        token,
        ip,
      });
      return { done: "created", id: r.id };
    }),
  update: (event) =>
    act(event, async (f, token, ip) => {
      const capacity = text(f, "capacity");
      await api(`/events/${encodeURIComponent(text(f, "id"))}`, {
        method: "PATCH",
        body: {
          title: i18n(f, "title"),
          description: i18n(f, "description"),
          startsAt: instant(f, "startsAt"),
          endsAt: instant(f, "endsAt"),
          address: text(f, "address") || null,
          capacity: capacity ? Number(capacity) : null,
        },
        token,
        ip,
      });
      return { done: "saved" };
    }),
};
