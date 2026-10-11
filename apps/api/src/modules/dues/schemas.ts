import { z } from "zod";
import { PERIODICITIES, isValidAmount, isValidFixedDueDay } from "@civora/shared";

const amount = z.string().refine(isValidAmount, "montant invalide");
const i18n = z.object({ fr: z.string().trim().min(1).max(80), ht: z.string().trim().max(80).optional() });

export const CURRENCIES = ["HTG", "USD", "EUR", "CAD"] as const;

export const planCreate = z
  .object({
    name: i18n,
    amount,
    currency: z.enum(CURRENCIES).default("HTG"),
    periodicity: z.enum(PERIODICITIES),
    dueRule: z.enum(["anniversary", "fixed"]).default("anniversary"),
    fixedDueDay: z.string().refine(isValidFixedDueDay, "date MM-JJ invalide").optional(),
    graceDays: z.number().int().min(0).max(180).default(15),
    isDefault: z.boolean().default(false),
  })
  .refine((p) => p.dueRule !== "fixed" || p.fixedDueDay, { message: "date fixe requise", path: ["fixedDueDay"] });

export const planUpdate = z
  .object({
    name: i18n,
    amount,
    graceDays: z.number().int().min(0).max(180),
    isDefault: z.boolean(),
    active: z.boolean(),
  })
  .partial();

export const subscribeBody = z.object({ planId: z.string().uuid() });
export const generateBody = z.object({
  until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export const idParam = z.object({ id: z.string().uuid() });
export const subscriptionParam = z.object({ id: z.string().uuid(), planId: z.string().uuid() });
