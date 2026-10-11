import { error, fail } from "@sveltejs/kit";
import { hasFeature } from "@civora/shared";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";

export interface QuizQuestion {
  id: string;
  question: { fr: string; ht?: string };
  choices: Array<{ id: string; text: { fr: string; ht?: string } }>;
  correct: string[];
}
export type ChapterKind = "text" | "video" | "audio" | "document" | "youtube" | "vimeo";
export interface Chapter {
  id: string;
  position: number;
  kind: ChapterKind;
  title: { fr: string; ht?: string };
  body: { fr: string; ht?: string } | null;
  mediaFileId: string | null;
  media: { url: string; mimeType: string; name: string } | null;
  embedUrl: string | null;
}
export interface CourseModule {
  id: string;
  position: number;
  title: { fr: string; ht?: string };
  description: { fr: string; ht?: string } | null;
  quiz: QuizQuestion[] | null;
  chapters: Chapter[];
}
export interface Course {
  id: string;
  title: { fr: string; ht?: string };
  description: { fr: string; ht?: string } | null;
  passThresholdPercent: number;
  maxAttempts: number | null;
  mandatoryForStatusIds: string[];
  publishedAt: string | null;
  modules: CourseModule[];
}
export interface TemplatePreview {
  title: { fr: string; ht?: string } | null;
  mention: { fr: string; ht?: string } | null;
  accentColor: string | null;
  signatories: Array<{ name: string }>;
}
export interface ProgressRow {
  code: string;
  name: string;
  level: string;
  target: number;
  completed: number;
  started: number;
}

/** Une formation : réglages, modules, chapitres et quiz (Contenu), progression par zone (Suivi, FOR-03). */
export const load: PageServerLoad = async ({ params, url, cookies, locals, getClientAddress }) => {
  const s = (await currentSession(cookies, locals.partySlug!))!;
  if (!s.me.permissions.includes("training.manage")) error(403, { message: "forbidden", code: "forbidden" });
  const ip = getClientAddress();
  const call = <T>(path: string) => api<T>(path, { token: s.token, ip });
  const tab = url.searchParams.get("vue") === "suivi" ? "progress" : "content";
  try {
    const zone = url.searchParams.get("zone");
    const certificates = s.me.tier ? hasFeature(s.me.tier, "training.certificates") : false;
    const [course, statuses, progress, template] = await Promise.all([
      call<Course>(`/courses/${params.id}`),
      call<{ statuses: Array<{ id: string; label: { fr: string; ht?: string } }> }>("/member-statuses").then(
        (r) => r.statuses,
      ),
      tab === "progress"
        ? call<{ zone: ProgressRow | null; children: ProgressRow[]; mandatory: boolean }>(
            `/courses/${params.id}/progress${zone && /^[A-Z0-9-]{2,20}$/.test(zone) ? `?zone=${zone}` : ""}`,
          ).catch(() => null)
        : null,
      certificates ? call<TemplatePreview>("/certificate-template").catch(() => null) : null,
    ]);
    return { course, statuses, progress, tab, template };
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

/** Quiz d'un module : arrive en JSON depuis le constructeur ; liste vide = pas de quiz. */
function quizFrom(f: FormData) {
  try {
    const quiz = JSON.parse(text(f, "quiz") || "[]") as unknown;
    return Array.isArray(quiz) && quiz.length ? quiz : null;
  } catch {
    throw new ApiFailure(400, "quiz_invalid");
  }
}

/** Corps d'un chapitre selon sa nature : texte, fichier envoyé, ou lien YouTube ou Vimeo. */
function chapterBody(f: FormData, creating: boolean) {
  const kind = text(f, "kind");
  const body = i18n(f, "body");
  const media = text(f, "mediaFileId");
  const link = text(f, "videoUrl");
  return {
    kind,
    title: i18n(f, "title"),
    ...(creating ? (body ? { body } : {}) : { body }),
    ...(["video", "audio", "document"].includes(kind) && media ? { mediaFileId: media } : {}),
    ...(["youtube", "vimeo"].includes(kind) && link ? { videoUrl: link } : {}),
  };
}
const idOf = (f: FormData) => encodeURIComponent(text(f, "id"));
const order = (f: FormData) => ({ ids: text(f, "order").split(",").filter(Boolean) });

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
  addModule: (event) =>
    act(event, "moduleCreated", (f, token, ip) => {
      const quiz = quizFrom(f);
      return api(`/courses/${event.params.id}/modules`, {
        body: { title: i18n(f, "title"), description: i18n(f, "description") ?? undefined, ...(quiz ? { quiz } : {}) },
        token,
        ip,
      });
    }),
  updateModule: (event) =>
    act(event, "moduleSaved", (f, token, ip) =>
      api(`/modules/${idOf(f)}`, {
        method: "PATCH",
        body: { title: i18n(f, "title"), description: i18n(f, "description"), quiz: quizFrom(f) },
        token,
        ip,
      }),
    ),
  deleteModule: (event) =>
    act(event, "moduleDeleted", (f, token, ip) => api(`/modules/${idOf(f)}`, { method: "DELETE", token, ip })),
  reorderModules: (event) =>
    act(event, "reordered", (f, token, ip) =>
      api(`/courses/${event.params.id}/modules/order`, { method: "PUT", body: order(f), token, ip }),
    ),
  addChapter: (event) =>
    act(event, "chapterCreated", (f, token, ip) =>
      api(`/modules/${encodeURIComponent(text(f, "moduleId"))}/chapters`, { body: chapterBody(f, true), token, ip }),
    ),
  updateChapter: (event) =>
    act(event, "chapterSaved", (f, token, ip) =>
      api(`/chapters/${idOf(f)}`, { method: "PATCH", body: chapterBody(f, false), token, ip }),
    ),
  deleteChapter: (event) =>
    act(event, "chapterDeleted", (f, token, ip) => api(`/chapters/${idOf(f)}`, { method: "DELETE", token, ip })),
  reorderChapters: (event) =>
    act(event, "reordered", (f, token, ip) =>
      api(`/modules/${encodeURIComponent(text(f, "moduleId"))}/chapters/order`, {
        method: "PUT",
        body: order(f),
        token,
        ip,
      }),
    ),
};
