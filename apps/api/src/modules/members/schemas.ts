import { z } from "zod";
import { IDENTITY_KINDS } from "./identity.js";

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/);
const zoneCode = z.string().regex(/^[A-Z0-9-]{2,20}$/);
const memberNumber = z.string().regex(/^\d{1,12}$/);
const name = z.string().trim().min(1).max(80);
const phone = z.string().regex(/^\+\d{8,15}$/);
/** Texte saisi par le parti en plusieurs langues (au moins le français). */
const i18n = z.object({ fr: z.string().trim().min(1).max(80), ht: z.string().trim().max(80).optional() });

export const ADMISSION_MODES = ["libre", "validation", "parrainage"] as const;

export const joinStart = z.object({
  partySlug: slug,
  email: z.string().email().max(254),
  locale: z.enum(["fr", "ht"]).default("fr"),
});

export const joinComplete = z.object({
  partySlug: slug,
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
  firstName: name,
  lastName: name,
  birthDate: z.coerce.date().optional(),
  /** Section communale en Haïti, ou pays et ville de la diaspora (ADH-02). */
  zoneCode,
  phone: phone.optional(),
  referentMemberNumber: memberNumber.optional(),
  /** Obligatoire si le parti adhère par parrainage (ADH-04). */
  sponsorMemberNumber: memberNumber.optional(),
  identity: z.object({ kind: z.enum(IDENTITY_KINDS), value: z.string().min(4).max(40) }).optional(),
});

export const meUpdate = z
  .object({ firstName: name, lastName: name, birthDate: z.coerce.date().nullable(), zoneCode, phone: phone.nullable() })
  .partial();

export const memberAdminUpdate = z
  .object({
    statusId: z.string().uuid().nullable(),
    category: z.string().trim().max(60).nullable(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
  })
  .partial();

export const statusCreate = z.object({ label: i18n, rank: z.number().int().min(0).max(1000) });
export const statusUpdate = statusCreate.partial();
export const admissionUpdate = z.object({ admissionMode: z.enum(ADMISSION_MODES) });

export const idParam = z.object({ id: z.string().uuid() });
export const identityParam = z.object({ id: z.string().uuid(), identityId: z.string().uuid() });
export const slugParam = z.object({ slug });

export const decisionBody = z.object({
  score: z.number().int().min(0).max(100).optional(),
  /** Motif interne au parti : au journal d'audit, jamais envoyé au candidat. */
  reason: z.string().trim().max(500).optional(),
});
export const scoreBody = z.object({ score: z.number().int().min(0).max(100) });
