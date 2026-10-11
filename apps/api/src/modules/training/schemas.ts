// FOR-01 à FOR-04 : formations du parti, leçons, quiz, suivi, certificat.
import { z } from "zod";

const text = (max: number) =>
  z.object({ fr: z.string().trim().min(1).max(max), ht: z.string().trim().max(max).optional() });
const key = z.string().regex(/^[a-z0-9-]{1,36}$/);

export const LESSON_KINDS = ["video", "audio", "document", "text"] as const;

/** Question à choix : une ou plusieurs bonnes réponses (`correct`), jamais envoyées aux membres. */
export const quizQuestion = z
  .object({
    id: key,
    question: text(500),
    choices: z
      .array(z.object({ id: key, text: text(200) }))
      .min(2)
      .max(6),
    correct: z.array(key).min(1),
  })
  .refine((q) => q.correct.every((c) => q.choices.some((x) => x.id === c)), {
    message: "réponse correcte absente des choix",
    path: ["correct"],
  });
export const quiz = z.array(quizQuestion).max(30);
export type Quiz = z.infer<typeof quiz>;

export const courseCreate = z.object({
  title: text(160),
  description: text(5000).optional(),
  passThresholdPercent: z.number().int().min(1).max(100).default(65),
  /** Nombre de tentatives par quiz ; sans valeur, illimité (FOR-02). */
  maxAttempts: z.number().int().min(1).max(20).nullable().default(null),
  /** Statuts pour lesquels la formation est obligatoire (FOR-03). */
  mandatoryForStatusIds: z.array(z.string().uuid()).max(20).default([]),
});
export const courseUpdate = courseCreate
  .partial()
  .extend({ description: text(5000).nullable().optional(), published: z.boolean().optional() });

export const lessonCreate = z.object({
  kind: z.enum(LESSON_KINDS),
  title: text(160),
  body: text(20_000).optional(),
  mediaFileId: z.string().uuid().optional(),
  quiz: quiz.optional(),
});
export const lessonUpdate = lessonCreate.partial().extend({
  body: text(20_000).nullable().optional(),
  mediaFileId: z.string().uuid().nullable().optional(),
  quiz: quiz.nullable().optional(),
});
export const lessonOrder = z.object({ lessonIds: z.array(z.string().uuid()).min(1).max(100) });

/** Réponses d'un membre : identifiant de question vers les choix cochés. */
export const attemptBody = z.object({ answers: z.record(key, z.array(key).max(6)) });

export const progressQuery = z.object({
  zone: z
    .string()
    .regex(/^[A-Z0-9-]{2,20}$/)
    .optional(),
});
export const idParam = z.object({ id: z.string().uuid() });
