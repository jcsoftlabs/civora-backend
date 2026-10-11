import { error, fail } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";

export interface QuizQuestion {
  id: string;
  question: { fr: string; ht?: string };
  choices: Array<{ id: string; text: { fr: string; ht?: string } }>;
  correct: string[];
}
export interface Lesson {
  id: string;
  position: number;
  kind: "video" | "audio" | "document" | "text";
  title: { fr: string; ht?: string };
  body: { fr: string; ht?: string } | null;
  mediaFileId: string | null;
  quiz: QuizQuestion[] | null;
}
export interface Course {
  id: string;
  title: { fr: string; ht?: string };
  description: { fr: string; ht?: string } | null;
  passThresholdPercent: number;
  maxAttempts: number | null;
  mandatoryForStatusIds: string[];
  publishedAt: string | null;
  lessons: Lesson[];
}
export interface ProgressRow {
  code: string;
  name: string;
  level: string;
  target: number;
  completed: number;
  started: number;
}

/** Une formation : réglages, leçons et quiz (Contenu), progression par zone (Suivi, FOR-03). */
export const load: PageServerLoad = async ({ params, url, cookies, locals, getClientAddress }) => {
  const s = (await currentSession(cookies, locals.partySlug!))!;
  if (!s.me.permissions.includes("training.manage")) error(403, { message: "forbidden", code: "forbidden" });
  const ip = getClientAddress();
  const call = <T>(path: string) => api<T>(path, { token: s.token, ip });
  const tab = url.searchParams.get("vue") === "suivi" ? "progress" : "content";
  try {
    const zone = url.searchParams.get("zone");
    const [course, statuses, progress] = await Promise.all([
      call<Course>(`/courses/${params.id}`),
      call<{ statuses: Array<{ id: string; label: { fr: string; ht?: string } }> }>("/member-statuses").then(
        (r) => r.statuses,
      ),
      tab === "progress"
        ? call<{ zone: ProgressRow | null; children: ProgressRow[]; mandatory: boolean }>(
            `/courses/${params.id}/progress${zone && /^[A-Z0-9-]{2,20}$/.test(zone) ? `?zone=${zone}` : ""}`,
          ).catch(() => null)
        : null,
    ]);
    return { course, statuses, progress, tab };
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 404) error(404, { message: "not_found", code: "not_found" });
    if (e instanceof ApiFailure && e.status === 402) error(403, { message: "forbidden", code: "forbidden" });
    throw e;
  }
};

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const i18n = (f: FormData, k: string) => {
  const fr = text(f, `${k}Fr`);
  const ht = text(f, `${k}Ht`);
  return fr ? { fr, ...(ht ? { ht } : {}) } : null;
};

async function act(
  event: RequestEvent,
  done: string,
  call: (f: FormData, token: string, ip: string) => Promise<unknown>,
) {
  const s = await currentSession(event.cookies, event.locals.partySlug!);
  if (!s || s.me.mfaPending) return fail(401, { code: "unauthorized" });
  const f = await event.request.formData();
  try {
    await call(f, s.token, event.getClientAddress());
    return { ok: true, done };
  } catch (e) {
    if (e instanceof ApiFailure)
      return fail(400, { code: e.code === "invalid_request" && f.has("quiz") ? "quiz_invalid" : e.code });
    throw e;
  }
}

/** Corps d'une leçon depuis le formulaire ; le quiz arrive en JSON depuis le constructeur. */
function lessonBody(f: FormData, creating: boolean) {
  let quiz: unknown = null;
  try {
    quiz = JSON.parse(text(f, "quiz") || "[]");
  } catch {
    throw new ApiFailure(400, "quiz_invalid");
  }
  const body = i18n(f, "body");
  const media = text(f, "mediaFileId");
  return {
    kind: text(f, "kind"),
    title: i18n(f, "title"),
    ...(creating ? (body ? { body } : {}) : { body }),
    ...(media ? { mediaFileId: media } : creating ? {} : { mediaFileId: null }),
    ...(creating
      ? Array.isArray(quiz) && quiz.length
        ? { quiz }
        : {}
      : { quiz: Array.isArray(quiz) && quiz.length ? quiz : null }),
  };
}

export const actions: Actions = {
  settings: (event) =>
    act(event, "saved", (f, token, ip) => {
      const attempts = text(f, "maxAttempts");
      return api(`/courses/${event.params.id}`, {
        method: "PATCH",
        body: {
          title: i18n(f, "title"),
          description: i18n(f, "description"),
          passThresholdPercent: Number(text(f, "passThresholdPercent") || "65"),
          maxAttempts: attempts ? Number(attempts) : null,
          mandatoryForStatusIds: f.getAll("mandatoryForStatusIds").map(String),
        },
        token,
        ip,
      });
    }),
  publish: (event) =>
    act(event, "published", (_f, token, ip) =>
      api(`/courses/${event.params.id}`, { method: "PATCH", body: { published: true }, token, ip }),
    ),
  unpublish: (event) =>
    act(event, "unpublished", (_f, token, ip) =>
      api(`/courses/${event.params.id}`, { method: "PATCH", body: { published: false }, token, ip }),
    ),
  addLesson: (event) =>
    act(event, "lessonCreated", (f, token, ip) =>
      api(`/courses/${event.params.id}/lessons`, { body: lessonBody(f, true), token, ip }),
    ),
  updateLesson: (event) =>
    act(event, "lessonSaved", (f, token, ip) =>
      api(`/lessons/${encodeURIComponent(text(f, "id"))}`, { method: "PATCH", body: lessonBody(f, false), token, ip }),
    ),
  deleteLesson: (event) =>
    act(event, "lessonDeleted", (f, token, ip) =>
      api(`/lessons/${encodeURIComponent(text(f, "id"))}`, { method: "DELETE", token, ip }),
    ),
  reorder: (event) =>
    act(event, "reordered", (f, token, ip) =>
      api(`/courses/${event.params.id}/lessons/order`, {
        method: "PUT",
        body: { lessonIds: text(f, "order").split(",").filter(Boolean) },
        token,
        ip,
      }),
    ),
};
