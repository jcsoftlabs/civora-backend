import { error, fail } from "@sveltejs/kit";
import { PERMISSION_GROUPS } from "@civora/shared";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";

export interface Organ {
  id: string;
  name: string;
  kind: string;
  parentOrganId: string | null;
  zoneCode: string | null;
  zoneName: string | null;
  zoneLevel: string | null;
  postCount: number;
  memberCount: number;
  holders: Array<{ memberId: string; firstName: string; lastName: string; postTitle: string }>;
  holderCount: number;
  vacantPosts: number;
}
export interface Post {
  id: string;
  title: string;
  permissions: string[];
  scopeCode: string | null;
  filledBy: string;
  holders: Array<{ id: string; memberId: string; firstName: string; lastName: string; startsAt: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ url, cookies, locals, getClientAddress }) => {
  const s = (await currentSession(cookies, locals.partySlug!))!;
  const ip = getClientAddress();
  let organs: Organ[];
  try {
    organs = (await api<{ organs: Organ[] }>("/organs", { token: s.token, ip })).organs;
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 403) error(403, { message: "forbidden", code: "forbidden" });
    throw e;
  }
  const selected = url.searchParams.get("o");
  let panel: { organ: Organ; posts: Post[] } | null = null;
  if (selected && UUID.test(selected)) {
    const organ = organs.find((o) => o.id === selected);
    if (organ) {
      const posts = (await api<{ posts: Post[] }>(`/organs/${organ.id}/posts`, { token: s.token, ip })).posts;
      panel = { organ, posts };
    }
  }
  return {
    organs,
    panel,
    creating: url.searchParams.has("nouveau"),
    // Droits que la personne peut donner : ceux qu'elle détient (l'API vérifie la zone, anti-élévation).
    groups: Object.entries(PERMISSION_GROUPS)
      .map(([group, perms]) => ({ group, perms: perms.filter((p) => s.me.permissions.includes(p)) }))
      .filter((g) => g.perms.length),
  };
};

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Appel d'une action du panneau ; une erreur de l'API revient au formulaire avec son code. */
async function act(
  event: RequestEvent,
  done: string,
  call: (f: FormData, token: string, ip: string) => Promise<unknown>,
) {
  const s = await currentSession(event.cookies, event.locals.partySlug!);
  if (!s || s.me.mfaPending) return fail(401, { code: "unauthorized" });
  const f = await event.request.formData();
  try {
    const res = await call(f, s.token, event.getClientAddress());
    return { ok: true, done, ...(res && typeof res === "object" ? { result: res } : {}) };
  } catch (e) {
    if (e instanceof ApiFailure)
      return fail(e.status === 429 ? 429 : 400, {
        code: e.status === 403 && e.code === "forbidden" ? "forbidden" : e.code,
      });
    throw e;
  }
}

const id = (f: FormData, k = "id") => {
  const v = text(f, k);
  if (!UUID.test(v)) throw new ApiFailure(400, "invalid_request");
  return v;
};

export const actions: Actions = {
  create: (event) =>
    act(event, "created", (f, token, ip) =>
      api<{ id: string }>("/organs", {
        body: {
          name: text(f, "name"),
          kind: text(f, "kind"),
          ...(text(f, "zoneCode") ? { zoneCode: text(f, "zoneCode") } : {}),
          ...(text(f, "parentOrganId") ? { parentOrganId: id(f, "parentOrganId") } : {}),
        },
        token,
        ip,
      }),
    ),
  update: (event) =>
    act(event, "saved", (f, token, ip) =>
      api(`/organs/${id(f)}`, {
        method: "PATCH",
        body: {
          name: text(f, "name"),
          kind: text(f, "kind"),
          ...(text(f, "zoneCode") ? { zoneCode: text(f, "zoneCode") } : {}),
        },
        token,
        ip,
      }),
    ),
  addPost: (event) =>
    act(event, "postCreated", (f, token, ip) =>
      api(`/organs/${id(f)}/posts`, {
        body: { title: text(f, "title"), permissions: f.getAll("permissions").map(String) },
        token,
        ip,
      }),
    ),
  assign: (event) =>
    act(event, "assigned", (f, token, ip) =>
      api(`/posts/${id(f, "postId")}/holders`, {
        body: { memberId: id(f, "memberId"), replaceCurrent: text(f, "replaceCurrent") !== "false" },
        token,
        ip,
      }),
    ),
  endHolder: (event) =>
    act(event, "ended", (f, token, ip) =>
      api(`/posts/${id(f, "postId")}/holders/${id(f, "holderId")}`, { method: "DELETE", token, ip }),
    ),
};
