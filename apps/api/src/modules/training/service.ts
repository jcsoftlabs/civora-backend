// FOR-01 à FOR-04 : formations découpées en modules, chapitres (texte, fichier, YouTube ou Vimeo), quiz par
// module, progression bloquante, formations obligatoires par statut, suivi par zone, certificat numéroté au
// modèle du parti. Les bonnes réponses des quiz ne quittent jamais le serveur.
import type { FastifyRequest } from "fastify";
import { and, asc, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { z } from "zod";
import { videoEmbed } from "@civora/shared";
import {
  certificateTemplates,
  courseCompletions,
  courseModules,
  courses,
  files,
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
import {
  FILE_KINDS,
  LINK_KINDS,
  type attemptBody,
  type CertificateTemplate,
  type ChapterKind,
  type chapterCreate,
  type chapterUpdate,
  type courseCreate,
  type courseUpdate,
  type moduleCreate,
  type moduleUpdate,
  type Quiz,
} from "./schemas.js";

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

const sameSet = (rows: { id: string }[], ids: string[]) =>
  rows.length === ids.length && new Set(ids).size === ids.length && ids.every((x) => rows.some((r) => r.id === x));

/** Types de fichier admis par nature de chapitre. */
const KIND_MIME: Record<string, (mime: string) => boolean> = {
  video: (m) => m.startsWith("video/"),
  audio: (m) => m.startsWith("audio/"),
  document: (m) => m === "application/pdf" || m.startsWith("image/"),
};

type Walked = Awaited<ReturnType<TrainingService["walk"]>>;

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
          moduleCount: sql<number>`(select count(*)::int from course_modules m where m.course_id = "courses"."id")`,
          lessonCount: sql<number>`(select count(*)::int from lessons l where l.course_id = "courses"."id")`,
          completions: sql<number>`(select count(*)::int from course_completions c where c.course_id = "courses"."id")`,
        })
        .from(courses)
        .orderBy(desc(courses.createdAt)),
    );
  }

  /** Modules et chapitres d'une formation, dans l'ordre. */
  private async outline(tx: Tx, courseId: string) {
    const mods = await tx
      .select()
      .from(courseModules)
      .where(eq(courseModules.courseId, courseId))
      .orderBy(asc(courseModules.position));
    const chs = await tx.select().from(lessons).where(eq(lessons.courseId, courseId)).orderBy(asc(lessons.position));
    return mods.map((m) => ({ ...m, quiz: m.quiz as Quiz | null, chapters: chs.filter((c) => c.moduleId === m.id) }));
  }

  async detail(req: Req, id: string) {
    manage(req);
    return withParty(req.partyId, async (tx) => {
      const [c] = await tx.select().from(courses).where(eq(courses.id, id));
      if (!c) throw new ApiError(404, "not_found");
      const mods = await this.outline(tx, id);
      const urls = await this.files.mediaUrls(
        tx,
        mods.flatMap((m) => m.chapters.flatMap((l) => (l.mediaFileId ? [l.mediaFileId] : []))),
        "training_media",
      );
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        passThresholdPercent: c.passThresholdPercent,
        maxAttempts: c.maxAttempts,
        mandatoryForStatusIds: c.mandatoryForStatusIds ?? [],
        publishedAt: c.publishedAt,
        modules: mods.map((m) => ({
          id: m.id,
          position: m.position,
          title: m.title,
          description: m.description,
          quiz: m.quiz,
          chapters: m.chapters.map((l) => ({
            id: l.id,
            position: l.position,
            kind: l.kind,
            title: l.title,
            body: l.body,
            mediaFileId: l.mediaFileId,
            media: l.mediaFileId ? (urls.get(l.mediaFileId) ?? null) : null,
            embedUrl: l.embedUrl,
          })),
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
        // Une formation publiée a au moins un module, et chaque module au moins un chapitre.
        const mods = await this.outline(tx, id);
        if (!mods.length) throw new ApiError(409, "course_without_modules");
        if (mods.some((m) => !m.chapters.length)) throw new ApiError(409, "module_without_chapters");
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

  // Modules

  async addModule(req: Req, courseId: string, body: z.infer<typeof moduleCreate>) {
    manage(req);
    return withParty(req.partyId, async (tx) => {
      const [c] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId));
      if (!c) throw new ApiError(404, "not_found");
      const [last] = await tx
        .select({ p: sql<number>`coalesce(max(${courseModules.position}), 0)::int` })
        .from(courseModules)
        .where(eq(courseModules.courseId, courseId));
      const [m] = await tx
        .insert(courseModules)
        .values({
          partyId: req.partyId,
          courseId,
          position: (last?.p ?? 0) + 1,
          title: body.title,
          description: body.description ?? null,
          quiz: body.quiz?.length ? body.quiz : null,
        })
        .returning({ id: courseModules.id });
      return { id: m!.id };
    });
  }

  async updateModule(req: Req, id: string, body: z.infer<typeof moduleUpdate>) {
    manage(req);
    await withParty(req.partyId, async (tx) => {
      const upd = await tx
        .update(courseModules)
        .set({
          ...(body.title ? { title: body.title } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.quiz !== undefined ? { quiz: body.quiz?.length ? body.quiz : null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(courseModules.id, id))
        .returning({ id: courseModules.id });
      if (!upd.length) throw new ApiError(404, "not_found");
    });
  }

  /** Suppression d'un module que personne n'a commencé (ni chapitre vu, ni quiz tenté), chapitres compris. */
  async deleteModule(req: Req, id: string) {
    manage(req);
    await withParty(req.partyId, async (tx) => {
      const [a] = await tx
        .select({ n: count() })
        .from(lessonAttempts)
        .where(
          sql`"lesson_attempts"."module_id" = ${id}
          or "lesson_attempts"."lesson_id" in (select l.id from lessons l where l.module_id = ${id})`,
        );
      if ((a?.n ?? 0) > 0) throw new ApiError(409, "module_has_progress");
      const chs = await tx
        .delete(lessons)
        .where(eq(lessons.moduleId, id))
        .returning({ mediaFileId: lessons.mediaFileId });
      const del = await tx.delete(courseModules).where(eq(courseModules.id, id)).returning({ id: courseModules.id });
      if (!del.length) throw new ApiError(404, "not_found");
      for (const c of chs) if (c.mediaFileId) await this.trashIfUnused(tx, c.mediaFileId);
    });
  }

  async reorderModules(req: Req, courseId: string, ids: string[]) {
    manage(req);
    await withParty(req.partyId, async (tx) => {
      const rows = await tx
        .select({ id: courseModules.id })
        .from(courseModules)
        .where(eq(courseModules.courseId, courseId));
      if (!sameSet(rows, ids)) throw new ApiError(400, "order_mismatch");
      for (const [i, mid] of ids.entries())
        await tx
          .update(courseModules)
          .set({ position: i + 1, updatedAt: new Date() })
          .where(eq(courseModules.id, mid));
    });
  }

  // Chapitres

  /**
   * Contenu d'un chapitre selon sa nature : texte obligatoire, fichier du bon type, ou lien YouTube ou Vimeo
   * réduit à l'adresse du lecteur. Les champs qui ne servent pas à cette nature sont vidés.
   */
  private async chapterContent(
    tx: Tx,
    c: { kind: ChapterKind; body: unknown; mediaFileId: string | null; videoUrl: string | null },
  ) {
    if (c.kind === "text") {
      if (!c.body) throw new ApiError(400, "chapter_body_required");
      return { kind: c.kind, mediaFileId: null, embedUrl: null };
    }
    if (FILE_KINDS.includes(c.kind)) {
      if (!c.mediaFileId) throw new ApiError(400, "chapter_media_required");
      const f = await this.files.readyFile(tx, c.mediaFileId, "training_media");
      if (!KIND_MIME[c.kind]!(f.mimeType)) throw new ApiError(400, "chapter_media_kind_mismatch");
      return { kind: c.kind, mediaFileId: c.mediaFileId, embedUrl: null };
    }
    const v = c.videoUrl ? videoEmbed(c.videoUrl) : null;
    if (!v || v.provider !== c.kind) throw new ApiError(400, "invalid_video_url");
    return { kind: c.kind, mediaFileId: null, embedUrl: v.embedUrl };
  }

  /** Un média de formation remplacé ou retiré part à la corbeille s'il ne sert plus à aucun chapitre (DOC-07). */
  private async trashIfUnused(tx: Tx, fileId: string) {
    const [n] = await tx.select({ n: count() }).from(lessons).where(eq(lessons.mediaFileId, fileId));
    if (!n?.n) await tx.update(files).set({ trashedAt: new Date() }).where(eq(files.id, fileId));
  }

  async addChapter(req: Req, moduleId: string, body: z.infer<typeof chapterCreate>) {
    manage(req);
    return withParty(req.partyId, async (tx) => {
      const [m] = await tx
        .select({ id: courseModules.id, courseId: courseModules.courseId })
        .from(courseModules)
        .where(eq(courseModules.id, moduleId));
      if (!m) throw new ApiError(404, "not_found");
      const content = await this.chapterContent(tx, {
        kind: body.kind,
        body: body.body ?? null,
        mediaFileId: body.mediaFileId ?? null,
        videoUrl: body.videoUrl ?? null,
      });
      const [last] = await tx
        .select({ p: sql<number>`coalesce(max(${lessons.position}), 0)::int` })
        .from(lessons)
        .where(eq(lessons.moduleId, moduleId));
      const [l] = await tx
        .insert(lessons)
        .values({
          partyId: req.partyId,
          courseId: m.courseId,
          moduleId,
          position: (last?.p ?? 0) + 1,
          title: body.title,
          body: body.body ?? null,
          ...content,
        })
        .returning({ id: lessons.id });
      return { id: l!.id };
    });
  }

  async updateChapter(req: Req, id: string, body: z.infer<typeof chapterUpdate>) {
    manage(req);
    await withParty(req.partyId, async (tx) => {
      const [cur] = await tx.select().from(lessons).where(eq(lessons.id, id));
      if (!cur) throw new ApiError(404, "not_found");
      const kind = body.kind ?? (cur.kind as ChapterKind);
      const nextBody = body.body !== undefined ? body.body : cur.body;
      // Lien : celui envoyé, sinon le lecteur déjà enregistré (qui se relit comme un lien).
      const videoUrl = body.videoUrl !== undefined ? body.videoUrl : LINK_KINDS.includes(kind) ? cur.embedUrl : null;
      const mediaFileId = body.mediaFileId !== undefined ? body.mediaFileId : cur.mediaFileId;
      const content = await this.chapterContent(tx, { kind, body: nextBody, mediaFileId, videoUrl });
      await tx
        .update(lessons)
        .set({
          ...(body.title ? { title: body.title } : {}),
          body: nextBody,
          ...content,
          updatedAt: new Date(),
        })
        .where(eq(lessons.id, id));
      if (cur.mediaFileId && cur.mediaFileId !== content.mediaFileId) await this.trashIfUnused(tx, cur.mediaFileId);
    });
  }

  /** Suppression d'un chapitre que personne n'a encore vu ; sinon on le modifie. */
  async deleteChapter(req: Req, id: string) {
    manage(req);
    await withParty(req.partyId, async (tx) => {
      const [a] = await tx.select({ n: count() }).from(lessonAttempts).where(eq(lessonAttempts.lessonId, id));
      if ((a?.n ?? 0) > 0) throw new ApiError(409, "chapter_has_views");
      const del = await tx.delete(lessons).where(eq(lessons.id, id)).returning({ mediaFileId: lessons.mediaFileId });
      if (!del.length) throw new ApiError(404, "not_found");
      if (del[0]!.mediaFileId) await this.trashIfUnused(tx, del[0]!.mediaFileId);
    });
  }

  async reorderChapters(req: Req, moduleId: string, ids: string[]) {
    manage(req);
    await withParty(req.partyId, async (tx) => {
      const rows = await tx.select({ id: lessons.id }).from(lessons).where(eq(lessons.moduleId, moduleId));
      if (!sameSet(rows, ids)) throw new ApiError(400, "order_mismatch");
      for (const [i, lid] of ids.entries())
        await tx
          .update(lessons)
          .set({ position: i + 1, updatedAt: new Date() })
          .where(eq(lessons.id, lid));
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
            and exists (select 1 from lesson_attempts la
              where la.member_id = mb.id
                and (la.lesson_id in (select l.id from lessons l where l.course_id = ${courseId})
                  or la.module_id in (select m.id from course_modules m where m.course_id = ${courseId}))))::int
            as started
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

  /**
   * Parcours du membre, module par module. Un module est réussi quand son quiz l'est, ou, sans quiz, quand tous
   * ses chapitres ont été vus. Il s'ouvre quand le précédent est réussi ; son quiz, quand ses chapitres sont vus.
   */
  private async walk(tx: Tx, courseId: string, memberId: string) {
    const mods = await this.outline(tx, courseId);
    const att = await tx
      .select({
        lessonId: lessonAttempts.lessonId,
        moduleId: lessonAttempts.moduleId,
        passed: lessonAttempts.passed,
        score: lessonAttempts.scorePercent,
      })
      .from(lessonAttempts)
      .where(
        and(
          eq(lessonAttempts.memberId, memberId),
          sql`("lesson_attempts"."lesson_id" in (select l.id from lessons l where l.course_id = ${courseId})
            or "lesson_attempts"."module_id" in (select m.id from course_modules m where m.course_id = ${courseId}))`,
        ),
      );
    const viewed = new Set(att.flatMap((a) => (a.lessonId ? [a.lessonId] : [])));
    let open = true;
    return mods.map((m) => {
      const tries = att.filter((a) => a.moduleId === m.id);
      const hasQuiz = !!m.quiz?.length;
      const allViewed = m.chapters.length > 0 && m.chapters.every((c) => viewed.has(c.id));
      const passed = hasQuiz ? tries.some((t) => t.passed) : allViewed;
      const locked = !open;
      if (!passed) open = false;
      return { ...m, locked, passed, hasQuiz, allViewed, viewed, tries };
    });
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
          certificateNumber: sql<string | null>`(select cc.certificate_number from course_completions cc
            where cc.course_id = "courses"."id" and cc.member_id = ${me.id})`,
        })
        .from(courses)
        .where(isNotNull(courses.publishedAt))
        .orderBy(asc(courses.createdAt));
      const out = [];
      for (const { mandatoryFor, ...c } of rows) {
        const walked = await this.walk(tx, c.id, me.id);
        out.push({
          ...c,
          moduleCount: walked.length,
          passedModules: walked.filter((m) => m.passed).length,
          mandatory: !!me.statusId && (mandatoryFor ?? []).includes(me.statusId),
          completed: c.certificateNumber !== null,
        });
      }
      return out;
    });
  }

  /** Formation vue par le membre : modules dans l'ordre, contenu des seuls modules ouverts. */
  async myCourse(req: Req, id: string) {
    return withParty(req.partyId, async (tx) => {
      const [c] = await tx
        .select()
        .from(courses)
        .where(and(eq(courses.id, id), isNotNull(courses.publishedAt)));
      if (!c) throw new ApiError(404, "not_found");
      const walked = await this.walk(tx, id, req.memberId!);
      const urls = await this.files.mediaUrls(
        tx,
        walked.flatMap((m) => (m.locked ? [] : m.chapters.flatMap((l) => (l.mediaFileId ? [l.mediaFileId] : [])))),
        "training_media",
      );
      const [done] = await tx
        .select({ number: courseCompletions.certificateNumber, at: courseCompletions.completedAt })
        .from(courseCompletions)
        .where(and(eq(courseCompletions.courseId, id), eq(courseCompletions.memberId, req.memberId!)));
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        passThresholdPercent: c.passThresholdPercent,
        maxAttempts: c.maxAttempts,
        modules: walked.map((m) => ({
          id: m.id,
          position: m.position,
          title: m.title,
          description: m.description,
          locked: m.locked,
          passed: m.passed,
          // Chapitres : titres toujours visibles, contenu seulement dans un module ouvert.
          chapters: m.chapters.map((l) => ({
            id: l.id,
            position: l.position,
            kind: l.kind,
            title: l.title,
            body: m.locked ? null : l.body,
            media: !m.locked && l.mediaFileId ? (urls.get(l.mediaFileId) ?? null) : null,
            embedUrl: m.locked ? null : l.embedUrl,
            viewed: m.viewed.has(l.id),
          })),
          hasQuiz: m.hasQuiz,
          quizOpen: m.hasQuiz && !m.locked && m.allViewed,
          quiz: m.hasQuiz && !m.locked && m.allViewed ? publicQuiz(m.quiz) : null,
          attemptsUsed: m.tries.length,
          bestScore: m.tries.length ? Math.max(...m.tries.map((t) => t.score)) : null,
        })),
        completion: done ?? null,
      };
    });
  }

  /** Verrou par membre et par formation : deux envois simultanés ne dépassent pas le nombre de tentatives. */
  private async lockMember(tx: Tx, req: Req, courseId: string) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`training:${courseId}:${req.memberId}`}, 0))`);
  }

  /** Fin de formation : tous les modules réussis, certificat numéroté (une seule fois). */
  private async completeIfDone(tx: Tx, req: Req, courseId: string, walked: Walked) {
    if (!walked.length || walked.some((m) => !m.passed)) return null;
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

  /** Chapitre vu : enregistré une fois ; peut réussir un module sans quiz, voire terminer la formation. */
  async markViewed(req: Req, chapterId: string) {
    return withParty(req.partyId, async (tx) => {
      const [l] = await tx
        .select({ id: lessons.id, courseId: lessons.courseId, moduleId: lessons.moduleId })
        .from(lessons)
        .innerJoin(courses, and(eq(courses.partyId, lessons.partyId), eq(courses.id, lessons.courseId)))
        .where(and(eq(lessons.id, chapterId), isNotNull(courses.publishedAt)));
      if (!l) throw new ApiError(404, "not_found");
      await this.lockMember(tx, req, l.courseId);
      const before = await this.walk(tx, l.courseId, req.memberId!);
      const m = before.find((x) => x.id === l.moduleId)!;
      if (m.locked) throw new ApiError(409, "module_locked");
      if (!m.viewed.has(chapterId)) {
        await tx.insert(lessonAttempts).values({
          partyId: req.partyId,
          lessonId: chapterId,
          memberId: req.memberId!,
          scorePercent: 100,
          passed: true,
        });
      }
      const after = await this.walk(tx, l.courseId, req.memberId!);
      const now = after.find((x) => x.id === l.moduleId)!;
      return {
        viewed: true,
        modulePassed: now.passed,
        quizOpen: now.hasQuiz && now.allViewed && !now.passed,
        certificateNumber: await this.completeIfDone(tx, req, l.courseId, after),
      };
    });
  }

  /** Réponses au quiz d'un module (FOR-02) : note, réussite au seuil de la formation, tentatives restantes. */
  async attempt(req: Req, moduleId: string, body: z.infer<typeof attemptBody>) {
    return withParty(req.partyId, async (tx) => {
      const [mod] = await tx
        .select({
          id: courseModules.id,
          courseId: courseModules.courseId,
          threshold: courses.passThresholdPercent,
          maxAttempts: courses.maxAttempts,
        })
        .from(courseModules)
        .innerJoin(courses, and(eq(courses.partyId, courseModules.partyId), eq(courses.id, courseModules.courseId)))
        .where(and(eq(courseModules.id, moduleId), isNotNull(courses.publishedAt)));
      if (!mod) throw new ApiError(404, "not_found");
      await this.lockMember(tx, req, mod.courseId);
      const walked = await this.walk(tx, mod.courseId, req.memberId!);
      const m = walked.find((x) => x.id === moduleId)!;
      if (m.locked) throw new ApiError(409, "module_locked");
      if (!m.hasQuiz) throw new ApiError(409, "module_without_quiz");
      if (!m.allViewed) throw new ApiError(409, "chapters_not_viewed");
      if (m.passed) throw new ApiError(409, "module_already_passed");
      const used = m.tries.length;
      if (mod.maxAttempts !== null && used >= mod.maxAttempts) throw new ApiError(409, "attempts_exhausted");
      const { scorePercent, wrongQuestionIds } = grade(m.quiz!, body.answers);
      const passed = scorePercent >= mod.threshold;
      await tx
        .insert(lessonAttempts)
        .values({ partyId: req.partyId, moduleId, memberId: req.memberId!, scorePercent, passed });
      const certificateNumber = passed
        ? await this.completeIfDone(tx, req, mod.courseId, await this.walk(tx, mod.courseId, req.memberId!))
        : null;
      return {
        scorePercent,
        passed,
        threshold: mod.threshold,
        // Les questions manquées, sans la bonne réponse : la reprise reste un vrai exercice.
        wrongQuestionIds,
        attemptsLeft: mod.maxAttempts === null ? null : Math.max(0, mod.maxAttempts - used - 1),
        certificateNumber,
      };
    });
  }

  // ---------- Certificat (FOR-04) ----------

  /** Modèle du parti, ou les réglages par défaut s'il n'en a pas encore enregistré. */
  private async template(tx: Tx): Promise<CertificateTemplate> {
    const [t] = await tx.select().from(certificateTemplates);
    return {
      title: (t?.title as CertificateTemplate["title"]) ?? null,
      mention: (t?.mention as CertificateTemplate["mention"]) ?? null,
      footer: (t?.footer as CertificateTemplate["footer"]) ?? null,
      accentColor: t?.accentColor ?? null,
      showLogo: t?.showLogo ?? true,
      signatories: (t?.signatories as CertificateTemplate["signatories"]) ?? [],
    };
  }

  /** Modèle pour l'éditeur, avec l'aperçu des signatures et du logo. */
  async getTemplate(req: Req) {
    manage(req);
    return withParty(req.partyId, async (tx) => {
      const t = await this.template(tx);
      const urls = await this.files.mediaUrls(
        tx,
        t.signatories.flatMap((s) => (s.signatureFileId ? [s.signatureFileId] : [])),
        "signature",
      );
      return {
        ...t,
        signatories: t.signatories.map((s) => ({
          ...s,
          signatureUrl: s.signatureFileId ? (urls.get(s.signatureFileId)?.url ?? null) : null,
        })),
      };
    });
  }

  async saveTemplate(req: Req, body: CertificateTemplate) {
    manage(req);
    await withParty(req.partyId, async (tx) => {
      for (const s of body.signatories)
        if (s.signatureFileId) await this.files.readyFile(tx, s.signatureFileId, "signature");
      const before = await this.template(tx);
      const values = {
        title: body.title,
        mention: body.mention,
        footer: body.footer,
        accentColor: body.accentColor,
        showLogo: body.showLogo,
        signatories: body.signatories,
        updatedAt: new Date(),
      };
      await tx
        .insert(certificateTemplates)
        .values({ partyId: req.partyId, ...values })
        .onConflictDoUpdate({ target: certificateTemplates.partyId, set: values });
      // Signatures remplacées : à la corbeille, elles ne servent plus.
      const kept = new Set(body.signatories.map((s) => s.signatureFileId));
      const dropped = before.signatories.flatMap((s) =>
        s.signatureFileId && !kept.has(s.signatureFileId) ? [s.signatureFileId] : [],
      );
      if (dropped.length)
        await tx
          .update(files)
          .set({ trashedAt: new Date() })
          .where(and(inArray(files.id, dropped), eq(files.purpose, "signature")));
      await audit(tx, {
        ...actor(req),
        action: "certificate_template.update",
        targetType: "party",
        targetId: req.partyId,
      });
    });
  }

  /** Images du certificat (logo du parti, signatures), lues par le serveur pour le PDF. */
  private async artwork(tx: Tx, t: CertificateTemplate) {
    const [p] = await tx
      .select({ name: parties.name, logo: parties.logoFileId, color: parties.brandColor })
      .from(parties);
    const logo = t.showLogo && p?.logo ? await this.files.imageBytes(tx, p.logo, "party_logo") : null;
    const signatures = [];
    for (const s of t.signatories)
      signatures.push(s.signatureFileId ? await this.files.imageBytes(tx, s.signatureFileId, "signature") : null);
    return { partyName: p?.name ?? "", brandColor: p?.color ?? null, logo, signatures };
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
      const template = await this.template(tx);
      return { ...r, courseTitle: r.courseTitle as I18n, template, ...(await this.artwork(tx, template)) };
    });
  }

  /** Exemplaire du certificat au modèle enregistré, au nom d'un membre fictif, pour l'éditeur. */
  async sample(req: Req) {
    manage(req);
    return withParty(req.partyId, async (tx) => {
      const template = await this.template(tx);
      return {
        number: `${new Date().getUTCFullYear()}-000000`,
        completedAt: new Date(),
        courseTitle: { fr: "Formation des nouveaux membres", ht: "Fòmasyon nouvo manm" },
        firstName: "Marie",
        lastName: "Exemple",
        memberNumber: "000000",
        locale: null,
        template,
        ...(await this.artwork(tx, template)),
      };
    });
  }
}
