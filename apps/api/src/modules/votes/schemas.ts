// VOT-01 à VOT-07 : schémas des scrutins internes.
import { z } from "zod";
import { filterExpression } from "../members/filters.js";

const text = (max: number) =>
  z.object({ fr: z.string().trim().min(1).max(max), ht: z.string().trim().max(max).optional() });
const zoneCode = z.string().regex(/^[A-Z0-9-]{2,20}$/);
export const METHODS = ["simple_majority", "two_rounds", "list", "yes_no"] as const;

const base = z.object({
  kind: z.enum(["post", "question"]),
  title: text(160),
  description: text(5000).optional(),
  /** Zone du scrutin ; sans zone, tout le parti (poste national exigé). */
  zoneCode: zoneCode.optional(),
  /** Poste à pourvoir : le gagnant y est installé à la certification (VOT-10). */
  postId: z.string().uuid().optional(),
  method: z.enum(METHODS),
  seats: z.number().int().min(1).max(50).default(1),
  opensAt: z.coerce.date(),
  closesAt: z.coerce.date(),
  candidaciesCloseAt: z.coerce.date().optional(),
  contestationsCloseAt: z.coerce.date().optional(),
  quorumPercent: z.number().int().min(1).max(100).optional(),
  validityThresholdPercent: z.number().int().min(1).max(100).optional(),
  allowBlank: z.boolean().default(true),
  /** Corps électoral (VOT-02) : zone, organe, statut, ancienneté, cotisation à jour. */
  rules: filterExpression.default({ combinator: "and", rules: [] }),
  /** Conditions d'éligibilité des candidats (VOT-04). */
  eligibility: filterExpression.optional(),
});

/** Cohérence du scrutin : mode et nature, dates dans l'ordre. */
export const electionCreate = base.superRefine((v, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if ((v.kind === "question") !== (v.method === "yes_no")) issue("method", "question_requires_yes_no");
  if (v.method === "list" && v.seats < 2) issue("seats", "list_requires_seats");
  if (v.method !== "list" && v.seats !== 1) issue("seats", "single_seat");
  if (v.closesAt <= v.opensAt) issue("closesAt", "closes_before_opens");
  if (v.candidaciesCloseAt && v.candidaciesCloseAt > v.opensAt) issue("candidaciesCloseAt", "after_opening");
  if (v.contestationsCloseAt && v.contestationsCloseAt > v.opensAt) issue("contestationsCloseAt", "after_opening");
});
export type ElectionInput = z.infer<typeof base>;

export const candidateCreate = z.object({
  memberId: z.string().uuid().optional(),
  label: text(160),
  statement: text(3000).optional(),
});
export const candidateDecision = z.object({
  status: z.enum(["accepted", "rejected"]),
  reason: z.string().trim().max(500).optional(),
});
export const candidacyBody = z.object({ statement: text(3000).optional() });

export const contestBody = z.object({
  kind: z.enum(["missing", "ineligible"]),
  /** Membre concerné ; par défaut soi-même (omission). */
  concernedMemberId: z.string().uuid().optional(),
  reason: z.string().trim().min(5).max(1000),
});
export const contestDecision = z.object({
  status: z.enum(["accepted", "rejected"]),
  note: z.string().trim().max(500).optional(),
});

export const ballotBody = z.object({
  blank: z.boolean().optional(),
  candidateIds: z.array(z.string().uuid()).max(50).default([]),
});

/** Second tour : nouvelles dates d'ouverture et de clôture. */
export const runoffBody = z
  .object({ opensAt: z.coerce.date(), closesAt: z.coerce.date() })
  .refine((v) => v.closesAt > v.opensAt, { message: "closes_before_opens", path: ["closesAt"] });

export const idParam = z.object({ id: z.string().uuid() });
export const contestParam = z.object({ id: z.string().uuid(), contestId: z.string().uuid() });
export const candidateParam = z.object({ id: z.string().uuid(), candidateId: z.string().uuid() });
