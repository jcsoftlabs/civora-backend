// FOR-01 à FOR-04 : formations séquentielles, quiz notés, formations obligatoires par statut, suivi par zone,
// certificat numéroté. Les bonnes réponses des quiz ne quittent jamais le serveur.
import type { FastifyRequest } from "fastify";
import { and, asc, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { z } from "zod";
import {
  courseCompletions,
  courses,
  lessonAttempts,
  lessons,
  members,
  parties,
  users,
  withParty,
  zones,
  type Tx,
} from "@civora/db";
import { audit } from "../../lib/audit.js";
import { currentMember } from "../../lib/member-context.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize } from "../../plugins/tenant.js";
import type { FilesService } from "../files/service.js";
import type { attemptBody, courseCreate, courseUpdate, lessonCreate, lessonUpdate, Quiz } from "./schemas.js";

type Req = FastifyRequest;
type I18n = { fr: string; ht?: string };

/** Note d'un quiz : une question est juste si les choix cochés sont exactement les bonnes réponses. */
export function grade(q: Quiz, answers: Record<string, string[]>) {
  const wrong: string[] = [];
  for (const question of q) {
    const given = new Set(answers[question.id] ?? []);
    const ok = given.size === question.correct.length && question.correct.every((c) => given.has(c));
    if (!ok) wrong.push(question.id);
  }
  const scorePercent = q.length ? Math.round(((q.length - wrong.length) / q.length) * 100) : 100;
  return { scorePercent, wrongQuestionIds: wrong };
}

/** Quiz montré au membre : questions et choix, sans les bonnes réponses. */
const publicQuiz = (q: Quiz | null) =>
  q?.map(({ correct: _c, ...rest }) => ({ ...rest, multiple: _c.length > 1 })) ?? null;

const manage = (req: Req) => {
  if (!authorize(req, "training.manage")) throw new ApiError(403, "forbidden");
};
const actor = (req: Req) => ({
  partyId: req.partyId,
  actorUserId: req.auth?.userId ?? null,
  actorKind: "member" as const,
  ip: req.clientIp,
});

/** Numéro de certificat suivant pour l'année : AAAA-NNNNNN, sans trou ni doublon (verrou par parti). */
async function nextCertificateNumber(tx: Tx, partyId: string, year: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"certificates:" + partyId}, 0))`);
  const prefix = `${year}-`;
  const [r] = await tx.execute<{ n: string }>(
    sql`select coalesce(max(substring(certificate_number from 6)::int), 0) + 1 as n
        from course_completions where certificate_number like ${prefix + "%"}`,
  );
  return `${prefix}${String(r?.n ?? 1).padStart(6, "0")}`;
}

export class TrainingService {
  constructor(private readonly files: FilesService) {}

  // ---------- Back-office (training.manage, poste national) ----------

  async manageList(req: Req) {
    manage(req);
    return withParty(req.partyId, (tx) =>
      tx
        .select({
          id: courses.id,
          title: courses.title,
          description: courses.description,
          passThresholdPercent: courses.passThresholdPercent,
          maxAttempts: courses.maxAttempts,
          mandatoryForStatusIds: courses.mandatoryForStatusIds,
          publishedAt: courses.publishedAt,
          lessonCount: sql<number>`(select count(*)::int from lessons l where l.course_id = "courses"."id")`,
          completions: sql<number>`(select count(*)::int from course_completions c where c.course_id = "courses"."id")`,
        })
        .from(courses)
        .orderBy(desc(courses.createdAt)),
    );
  }

  async detail(req: Req, id: string) {
    manage(req);
    return withParty(req.partyId, async (tx) => {
      const [c] = await tx.select().from(courses).where(eq(courses.id, id));
      if (!c) throw new ApiError(404, "not_found");
      const ls = await tx.select().from(lessons).where(eq(lessons.courseId, id)).orderBy(asc(lessons.position));
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        passThresholdPercent: c.passThresholdPercent,
        maxAttempts: c.maxAttempts,
        mandatoryForStatusIds: c.mandatoryForStatusIds ?? [],
        publishedAt: c.publishedAt,
        lessons: ls.map((l) => ({
          id: l.id,
          position: l.position,
          kind: l.kind,
          title: l.title,
          body: l.body,
          mediaFileId: l.mediaFileId,
          quiz: l.quiz as Quiz | null,
        })),
      };
    });
  }

  async create(req: Req, body: z.infer<typeof courseCreate>) {
    manage(req);
    return withParty(req.partyId, async (tx) => {
      const [c] = await tx
        .insert(courses)
        .values({
          partyId: req.partyId,
          title: body.title,
          description: body.description ?? null,
          passThresholdPercent: body.passThresholdPercent,
          maxAttempts: body.maxAttempts,
          mandatoryForStatusIds: body.mandatoryForStatusIds,
        })
        .returning({ id: courses.id });
      await audit(tx, { ...actor(req), action: "course.create", targetType: "course", targetId: c!.id });
      return { id: c!.id };
    });
  }

  async update(req: Req, id: string, body: z.infer<typeof courseUpdate>) {
    manage(req);
    await withParty(req.partyId, async (tx) => {
      const [c] = await tx.select({ publishedAt: courses.publishedAt }).from(courses).where(eq(courses.id, id));
      if (!c) throw new ApiError(404, "not_found");
      if (body.published) {
        const [n] = await tx.select({ n: count() }).from(lessons).where(eq(lessons.courseId, id));
        if (!n?.n) throw new ApiError(409, "course_without_lessons");
      }
      await tx
        .update(courses)
        .set({
          ...(body.title ? { title: body.title } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.passThresholdPercent !== undefined ? { passThresholdPercent: body.passThresholdPercent } : {}),
          ...(body.maxAttempts !== undefined ? { maxAttempts: body.maxAttempts } : {}),
          ...(body.mandatoryForStatusIds ? { mandatoryForStatusIds: body.mandatoryForStatusIds } : {}),
          ...(body.published !== undefined
            ? { publishedAt: body.published ? (c.publishedAt ?? new Date()) : null }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(courses.id, id));
      if (body.published !== undefined) {
        await audit(tx, {
          ...actor(req),
          action: body.published ? "course.publish" : "course.unpublish",
          targetType: "course",
          targetId: id,
        });
      }
    });
  }

  async addLesson(req: Req, courseId: string, body: z.infer<typeof lessonCreate>) {
    manage(req);
    return withParty(req.partyId, async (tx) => {
      const [c] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId));
      if (!c) throw new ApiError(404, "not_found");
      if (body.mediaFileId) await this.files.readyFile(tx, body.mediaFileId, "training_media");
      const [last] = await tx
        .select({ p: sql<number>`coalesce(max(${lessons.position}), 0)::int` })
        .from(lessons)
        .where(eq(lessons.courseId, courseId));
      const [l] = await tx
        .insert(lessons)
        .values({
          partyId: req.partyId,
          courseId,
          position: (last?.p ?? 0) + 1,
          kind: body.kind,
          title: body.title,
          body: body.body ?? null,
          mediaFileId: body.mediaFileId ?? null,
          quiz: body.quiz?.length ? body.quiz : null,
        })
        .returning({ id: lessons.id });
      return { id: l!.id };
    });
  }

  async updateLesson(req: Req, id: string, body: z.infer<typeof lessonUpdate>) {
    manage(req);
    await withParty(req.partyId, async (tx) => {
      const [l] = await tx.select({ id: lessons.id }).from(lessons).where(eq(lessons.id, id));
      if (!l) throw new ApiError(404, "not_found");
      if (body.mediaFileId) await this.files.readyFile(tx, body.mediaFileId, "training_media");
      await tx
        .update(lessons)
        .set({
          ...(body.kind ? { kind: body.kind } : {}),
          ...(body.title ? { title: body.title } : {}),
          ...(body.body !== undefined ? { body: body.body } : {}),
          ...(body.mediaFileId !== undefined ? { mediaFileId: body.mediaFileId } : {}),
          ...(body.quiz !== undefined ? { quiz: body.quiz?.length ? body.quiz : null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(lessons.id, id));
    });
  }

  /** Suppression d'une leçon que personne n'a encore suivie ; sinon on la modifie. */
  async deleteLesson(req: Req, id: string) {
    manage(req);
    await withParty(req.partyId, async (tx) => {
      const [a] = await tx.select({ n: count() }).from(lessonAttempts).where(eq(lessonAttempts.lessonId, id));
      if ((a?.n ?? 0) > 0) throw new ApiError(409, "lesson_has_attempts");
      const del = await tx.delete(lessons).where(eq(lessons.id, id)).returning({ id: lessons.id });
      if (!del.length) throw new ApiError(404, "not_found");
    });
  }

  async reorder(req: Req, courseId: string, lessonIds: string[]) {
    manage(req);
    await withParty(req.partyId, async (tx) => {
      const ls = await tx.select({ id: lessons.id }).from(lessons).where(eq(lessons.courseId, courseId));
      const known = new Set(ls.map((l) => l.id));
      if (ls.length !== lessonIds.length || !lessonIds.every((x) => known.has(x)))
        throw new ApiError(400, "lesson_order_mismatch");
      for (const [i, lid] of lessonIds.entries()) {
        await tx
          .update(lessons)
          .set({ position: i + 1, updatedAt: new Date() })
          .where(eq(lessons.id, lid));
      }
    });
  }

  /**
   * FOR-03 : suivi par sous-zone. Membres concernés (statuts obligatoires, sinon tous les membres validés),
   * formations terminées et commencées. Portée training.manage de la personne ; agrégats seulement.
   */
  async progress(req: Req, courseId: string, parentCode?: string) {
    const scopes = req.grants.filter((g) => g.permission === "training.manage");
    if (!scopes.length) throw new ApiError(403, "forbidden");
    return withParty(req.partyId, async (tx) => {
      const [c] = await tx
        .select({ mandatory: courses.mandatoryForStatusIds })
        .from(courses)
        .where(eq(courses.id, courseId));
      if (!c) throw new ApiError(404, "not_found");
      const [parent] = await tx
        .select({ id: zones.id, code: zones.code, name: zones.name, path: zones.path })
        .from(zones)
        .where(eq(zones.code, parentCode ?? "HT"));
      if (!parent) throw new ApiError(404, "not_found");
      if (!authorize(req, "training.manage", parent.path)) throw new ApiError(403, "forbidden");
      const mandatory = c.mandatory ?? [];
      const statusFilter = mandatory.length
        ? sql`and mb.status_id::text in (select jsonb_array_elements_text(${JSON.stringify(mandatory)}::text::jsonb))`
        : sql``;
      const rows = await tx.execute<{
        code: string;
        name: string;
        level: string;
        is_total: boolean;
        target: number;
        completed: number;
        started: number;
      }>(sql`
        with targets as (
          select id, code, name, level, path, false as is_total from zones where parent_id = ${parent.id}
          union all
          select id, code, name, level, path, true from zones where id = ${parent.id}
        )
        select t.code, t.name, t.level::text as level, t.is_total,
          count(mb.id)::int as target,
          count(mb.id) filter (where exists (select 1 from course_completions cc
            where cc.member_id = mb.id and cc.course_id = ${courseId}))::int as completed,
          count(mb.id) filter (where not exists (select 1 from course_completions cc
              where cc.member_id = mb.id and cc.course_id = ${courseId})
            and exists (select 1 from lesson_attempts la join lessons l on l.id = la.lesson_id
              where la.member_id = mb.id and l.course_id = ${courseId}))::int as started
        from targets t
        left join zones z on z.path <@ t.path
        left join members mb on mb.zone_id = z.id and mb.deleted_at is null
          and mb.application_state = 'approved' ${statusFilter}
        group by t.code, t.name, t.level, t.is_total
        order by t.is_total desc, t.name`);
      const toRow = (r: (typeof rows)[number]) => ({
        code: r.code,
        name: r.name,
        level: r.level,
        target: r.target,
        completed: r.completed,
        started: r.started,
      });
      const total = rows.find((r) => r.is_total);
      return {
        zone: total ? toRow(total) : null,
        children: rows.filter((r) => !r.is_total).map(toRow),
        mandatory: mandatory.length > 0,
      };
    });
  }

  // ---------- Membre ----------

  /** État du membre dans une formation : leçons réussies, tentatives, formation terminée. */
  private async state(tx: Tx, courseId: string, memberId: string) {
    const attempts = await tx
      .select({ lessonId: lessonAttempts.lessonId, passed: lessonAttempts.passed, score: lessonAttempts.scorePercent })
      .from(lessonAttempts)
      .innerJoin(lessons, and(eq(lessons.partyId, lessonAttempts.partyId), eq(lessons.id, lessonAttempts.lessonId)))
      .where(and(eq(lessons.courseId, courseId), eq(lessonAttempts.memberId, memberId)));
    const [done] = await tx
      .select({ number: courseCompletions.certificateNumber, at: courseCompletions.completedAt })
      .from(courseCompletions)
      .where(and(eq(courseCompletions.courseId, courseId), eq(courseCompletions.memberId, memberId)));
    return { attempts, completion: done ?? null };
  }

  /** Formations publiées, avec la progression du membre et le caractère obligatoire pour son statut. */
  async myCourses(req: Req) {
    return withParty(req.partyId, async (tx) => {
      const me = await currentMember(tx, req.memberId!);
      const rows = await tx
        .select({
          id: courses.id,
          title: courses.title,
          description: courses.description,
          mandatoryFor: courses.mandatoryForStatusIds,
          lessonCount: sql<number>`(select count(*)::int from lessons l where l.course_id = "courses"."id")`,
          passedLessons: sql<number>`(select count(distinct la.lesson_id)::int from lesson_attempts la
            join lessons l on l.id = la.lesson_id
            where l.course_id = "courses"."id" and la.member_id = ${me.id} and la.passed)`,
          certificateNumber: sql<string | null>`(select cc.certificate_number from course_completions cc
            where cc.course_id = "courses"."id" and cc.member_id = ${me.id})`,
        })
        .from(courses)
        .where(isNotNull(courses.publishedAt))
        .orderBy(asc(courses.createdAt));
      return rows.map(({ mandatoryFor, ...c }) => ({
        ...c,
        mandatory: !!me.statusId && (mandatoryFor ?? []).includes(me.statusId),
        completed: c.certificateNumber !== null,
      }));
    });
  }

  /** Formation vue par le membre : leçons dans l'ordre, verrouillées tant que la précédente n'est pas réussie. */
  async myCourse(req: Req, id: string) {
    return withParty(req.partyId, async (tx) => {
      const [c] = await tx
        .select()
        .from(courses)
        .where(and(eq(courses.id, id), isNotNull(courses.publishedAt)));
      if (!c) throw new ApiError(404, "not_found");
      const ls = await tx.select().from(lessons).where(eq(lessons.courseId, id)).orderBy(asc(lessons.position));
      const st = await this.state(tx, id, req.memberId!);
      const urls = await this.files.mediaUrls(
        tx,
        ls.flatMap((l) => (l.mediaFileId ? [l.mediaFileId] : [])),
        "training_media",
      );
      let open = true;
      const items = ls.map((l) => {
        const mine = st.attempts.filter((a) => a.lessonId === l.id);
        const passed = mine.some((a) => a.passed);
        const locked = !open;
        if (!passed) open = false;
        return {
          id: l.id,
          position: l.position,
          kind: l.kind,
          title: l.title,
          // Contenu seulement pour une leçon ouverte : on ne saute pas une étape.
          body: locked ? null : l.body,
          media: !locked && l.mediaFileId ? (urls.get(l.mediaFileId) ?? null) : null,
          quiz: locked ? null : publicQuiz(l.quiz as Quiz | null),
          locked,
          passed,
          attemptsUsed: mine.length,
          bestScore: mine.length ? Math.max(...mine.map((a) => a.score)) : null,
        };
      });
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        passThresholdPercent: c.passThresholdPercent,
        maxAttempts: c.maxAttempts,
        lessons: items,
        completion: st.completion,
      };
    });
  }

  /** Leçon ouverte au membre, verrouillée pour la mise à jour de ses tentatives. */
  private async openLesson(tx: Tx, req: Req, lessonId: string) {
    const [l] = await tx
      .select({
        id: lessons.id,
        courseId: lessons.courseId,
        position: lessons.position,
        quiz: lessons.quiz,
        threshold: courses.passThresholdPercent,
        maxAttempts: courses.maxAttempts,
      })
      .from(lessons)
      .innerJoin(courses, and(eq(courses.partyId, lessons.partyId), eq(courses.id, lessons.courseId)))
      .where(and(eq(lessons.id, lessonId), isNotNull(courses.publishedAt)));
    if (!l) throw new ApiError(404, "not_found");
    // Verrou par membre et par leçon : deux envois simultanés ne dépassent pas le nombre de tentatives.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`lesson:${lessonId}:${req.memberId}`}, 0))`);
    const before = await tx
      .select({ id: lessons.id })
      .from(lessons)
      .where(and(eq(lessons.courseId, l.courseId), sql`${lessons.position} < ${l.position}`));
    if (before.length) {
      const passed = await tx
        .selectDistinct({ id: lessonAttempts.lessonId })
        .from(lessonAttempts)
        .where(
          and(
            eq(lessonAttempts.memberId, req.memberId!),
            eq(lessonAttempts.passed, true),
            inArray(
              lessonAttempts.lessonId,
              before.map((b) => b.id),
            ),
          ),
        );
      if (passed.length < before.length) throw new ApiError(409, "lesson_locked");
    }
    const mine = await tx
      .select({ passed: lessonAttempts.passed })
      .from(lessonAttempts)
      .where(and(eq(lessonAttempts.lessonId, lessonId), eq(lessonAttempts.memberId, req.memberId!)));
    return { ...l, quiz: l.quiz as Quiz | null, used: mine.length, alreadyPassed: mine.some((m) => m.passed) };
  }

  /** Fin de formation : toutes les leçons réussies, certificat numéroté (une seule fois). */
  private async completeIfDone(tx: Tx, req: Req, courseId: string) {
    const [n] = await tx.select({ n: count() }).from(lessons).where(eq(lessons.courseId, courseId));
    const [p] = await tx
      .select({ n: sql<number>`count(distinct ${lessonAttempts.lessonId})::int` })
      .from(lessonAttempts)
      .innerJoin(lessons, and(eq(lessons.partyId, lessonAttempts.partyId), eq(lessons.id, lessonAttempts.lessonId)))
      .where(
        and(
          eq(lessons.courseId, courseId),
          eq(lessonAttempts.memberId, req.memberId!),
          eq(lessonAttempts.passed, true),
        ),
      );
    if (!n?.n || (p?.n ?? 0) < n.n) return null;
    const [existing] = await tx
      .select({ number: courseCompletions.certificateNumber })
      .from(courseCompletions)
      .where(and(eq(courseCompletions.courseId, courseId), eq(courseCompletions.memberId, req.memberId!)));
    if (existing) return existing.number;
    const number = await nextCertificateNumber(tx, req.partyId, new Date().getUTCFullYear());
    await tx
      .insert(courseCompletions)
      .values({ partyId: req.partyId, courseId, memberId: req.memberId!, certificateNumber: number });
    await audit(tx, { ...actor(req), action: "course.completed", targetType: "course", targetId: courseId });
    return number;
  }

  /** Leçon sans quiz : lue, donc réussie. */
  async markRead(req: Req, lessonId: string) {
    return withParty(req.partyId, async (tx) => {
      const l = await this.openLesson(tx, req, lessonId);
      if (l.quiz?.length) throw new ApiError(409, "lesson_has_quiz");
      if (!l.alreadyPassed) {
        await tx
          .insert(lessonAttempts)
          .values({ partyId: req.partyId, lessonId, memberId: req.memberId!, scorePercent: 100, passed: true });
      }
      return { passed: true, certificateNumber: await this.completeIfDone(tx, req, l.courseId) };
    });
  }

  /** Réponses à un quiz (FOR-02) : note, réussite au seuil de la formation, tentatives restantes. */
  async attempt(req: Req, lessonId: string, body: z.infer<typeof attemptBody>) {
    return withParty(req.partyId, async (tx) => {
      const l = await this.openLesson(tx, req, lessonId);
      if (!l.quiz?.length) throw new ApiError(409, "lesson_without_quiz");
      if (l.alreadyPassed) throw new ApiError(409, "lesson_already_passed");
      if (l.maxAttempts !== null && l.used >= l.maxAttempts) throw new ApiError(409, "attempts_exhausted");
      const { scorePercent, wrongQuestionIds } = grade(l.quiz, body.answers);
      const passed = scorePercent >= l.threshold;
      await tx
        .insert(lessonAttempts)
        .values({ partyId: req.partyId, lessonId, memberId: req.memberId!, scorePercent, passed });
      const certificateNumber = passed ? await this.completeIfDone(tx, req, l.courseId) : null;
      return {
        scorePercent,
        passed,
        threshold: l.threshold,
        // Les questions manquées, sans la bonne réponse : la reprise reste un vrai exercice.
        wrongQuestionIds,
        attemptsLeft: l.maxAttempts === null ? null : Math.max(0, l.maxAttempts - l.used - 1),
        certificateNumber,
      };
    });
  }

  /** Données du certificat d'un membre (le sien), pour le PDF (FOR-04). */
  async certificate(req: Req, courseId: string) {
    return withParty(req.partyId, async (tx) => {
      const [r] = await tx
        .select({
          number: courseCompletions.certificateNumber,
          completedAt: courseCompletions.completedAt,
          courseTitle: courses.title,
          firstName: members.firstName,
          lastName: members.lastName,
          memberNumber: members.memberNumber,
          locale: users.locale,
        })
        .from(courseCompletions)
        .innerJoin(
          courses,
          and(eq(courses.partyId, courseCompletions.partyId), eq(courses.id, courseCompletions.courseId)),
        )
        .innerJoin(
          members,
          and(eq(members.partyId, courseCompletions.partyId), eq(members.id, courseCompletions.memberId)),
        )
        .leftJoin(users, eq(users.id, members.userId))
        .where(and(eq(courseCompletions.courseId, courseId), eq(courseCompletions.memberId, req.memberId!)));
      if (!r) throw new ApiError(404, "not_found");
      const [p] = await tx.select({ name: parties.name }).from(parties);
      return { ...r, courseTitle: r.courseTitle as I18n, partyName: p?.name ?? "" };
    });
  }
}
