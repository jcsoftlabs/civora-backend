import { error, fail, redirect } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import type { Actions, PageServerLoad } from "./$types";

export interface CourseSummary {
  id: string;
  title: { fr: string; ht?: string };
  description: { fr: string; ht?: string } | null;
  passThresholdPercent: number;
  maxAttempts: number | null;
  mandatoryForStatusIds: string[] | null;
  publishedAt: string | null;
  moduleCount: number;
  lessonCount: number;
  completions: number;
}

/** FOR-01 à FOR-04 : formations du parti (training.manage). Hors formule, l'option reste visible et verrouillée. */
export const load: PageServerLoad = async ({ cookies, locals, getClientAddress }) => {
  const s = (await currentSession(cookies, locals.partySlug!))!;
  if (!s.me.permissions.includes("training.manage")) error(403, { message: "forbidden", code: "forbidden" });
  const ip = getClientAddress();
  try {
    const [courses, statuses] = await Promise.all([
      api<{ courses: CourseSummary[] }>("/courses", { token: s.token, ip }).then((r) => r.courses),
      api<{ statuses: Array<{ id: string; label: { fr: string; ht?: string } }> }>("/member-statuses", {
        token: s.token,
        ip,
      }).then((r) => r.statuses),
    ]);
    return { courses, statuses, locked: null as string | null };
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 402)
      return { courses: [], statuses: [], locked: e.requiredTier ?? "mouvement" };
    throw e;
  }
};

export const actions: Actions = {
  create: async ({ request, cookies, locals, getClientAddress }) => {
    const s = await currentSession(cookies, locals.partySlug!);
    if (!s || s.me.mfaPending) return fail(401, { code: "unauthorized" });
    const f = await request.formData();
    const fr = String(f.get("titleFr") ?? "").trim();
    const ht = String(f.get("titleHt") ?? "").trim();
    let id: string;
    try {
      id = (
        await api<{ id: string }>("/courses", {
          body: { title: { fr, ...(ht ? { ht } : {}) } },
          token: s.token,
          ip: getClientAddress(),
        })
      ).id;
    } catch (e) {
      if (e instanceof ApiFailure) return fail(400, { code: e.code });
      throw e;
    }
    redirect(303, `/admin/formation/${id}`);
  },
};
