// FOR-01 à FOR-04 : formations du parti, leçons, quiz, suivi, certificat.
import { z } from "zod";

const text = (max: number) =>
  z.object({ fr: z.string().trim().min(1).max(max), ht: z.string().trim().max(max).optional() });
const key = z.string().regex(/^[a-z0-9-]{1,36}$/);

/** Nature d'un chapitre : texte, fichier envoyé (vidéo, audio, document) ou lien YouTube ou Vimeo. */
export const CHAPTER_KINDS = ["text", "video", "audio", "document", "youtube", "vimeo"] as const;
export type ChapterKind = (typeof CHAPTER_KINDS)[number];
export const FILE_KINDS: readonly ChapterKind[] = ["video", "audio", "document"];
export const LINK_KINDS: readonly ChapterKind[] = ["youtube", "vimeo"];

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

export const moduleCreate = z.object({
  title: text(160),
  description: text(2000).optional(),
  quiz: quiz.optional(),
});
export const moduleUpdate = moduleCreate.partial().extend({
  description: text(2000).nullable().optional(),
  quiz: quiz.nullable().optional(),
});

export const chapterCreate = z.object({
  kind: z.enum(CHAPTER_KINDS),
  title: text(160),
  body: text(20_000).optional(),
  mediaFileId: z.string().uuid().optional(),
  /** Lien YouTube ou Vimeo collé tel quel ; le serveur le réduit à l'adresse du lecteur. */
  videoUrl: z.string().trim().max(500).optional(),
});
export const chapterUpdate = chapterCreate.partial().extend({
  body: text(20_000).nullable().optional(),
  mediaFileId: z.string().uuid().nullable().optional(),
  videoUrl: z.string().trim().max(500).nullable().optional(),
});
export const idOrder = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) });

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** Modèle de certificat du parti (FOR-04) : textes, couleur, logo, trois signataires au plus. */
export const certificateTemplate = z.object({
  title: text(80).nullable(),
  mention: text(160).nullable(),
  footer: text(300).nullable(),
  accentColor: hexColor.nullable(),
  showLogo: z.boolean(),
  signatories: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        role: text(80),
        signatureFileId: z.string().uuid().nullable(),
      }),
    )
    .max(3),
});
export type CertificateTemplate = z.infer<typeof certificateTemplate>;

/** Réponses d'un membre : identifiant de question vers les choix cochés. */
export const attemptBody = z.object({ answers: z.record(key, z.array(key).max(6)) });

export const progressQuery = z.object({
  zone: z
    .string()
    .regex(/^[A-Z0-9-]{2,20}$/)
    .optional(),
});
export const idParam = z.object({ id: z.string().uuid() });
