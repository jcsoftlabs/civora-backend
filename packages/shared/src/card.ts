// Modèle de carte de membre (ADH-13) : tout ce que le parti personnalise avant l'impression, et qui règle aussi la
// carte numérique (web et application). Une seule source : l'API valide, le back-office et l'app le lisent.
import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const i18n = (max: number) => z.object({ fr: z.string().trim().max(max), ht: z.string().trim().max(max).optional() });

export const CARD_PATTERNS = ["rosette", "waves", "none"] as const;
export const CARD_FIELDS = ["photo", "number", "zone", "status", "since", "validity"] as const;
export type CardField = (typeof CARD_FIELDS)[number];

export const cardDesign = z.object({
  /** Carte (horizontale, 85,6 × 54 mm) ou badge (vertical). */
  orientation: z.enum(["horizontal", "vertical"]).default("horizontal"),
  /** Fond : aplat d'une couleur (celle du parti par défaut) ou image envoyée par le parti, voilée pour la lecture. */
  background: z
    .object({
      kind: z.enum(["color", "image"]).default("color"),
      color: hex.nullable().default(null),
      imageFileId: z.string().uuid().nullable().default(null),
      /** Voile sombre sur l'image, de 0 à 0,7 : le texte reste lisible. */
      veil: z.number().min(0).max(0.7).default(0.35),
    })
    .default({}),
  /** Couleurs du texte et de l'accent (pastille de l'année) ; null : calculées pour le contraste. */
  textColor: hex.nullable().default(null),
  accentColor: hex.nullable().default(null),
  /** Motif de sécurité. */
  pattern: z.enum(CARD_PATTERNS).default("rosette"),
  showLogo: z.boolean().default(true),
  /** Intitulé de la carte, au-dessus du numéro (« Carte de membre » par défaut). */
  title: i18n(40).nullable().default(null),
  /** Champs imprimés au recto. */
  fields: z
    .object(Object.fromEntries(CARD_FIELDS.map((f) => [f, z.boolean()])) as Record<CardField, z.ZodBoolean>)
    .partial()
    .default({}),
  /** Validité : année civile en cours, date fixe, ou aucune mention. */
  validity: z
    .object({
      mode: z.enum(["year", "until", "none"]).default("year"),
      until: z.string().date().nullable().default(null),
    })
    .default({}),
  /** Côté du QR de vérification. */
  qrSide: z.enum(["front", "back"]).default("front"),
  back: z
    .object({
      enabled: z.boolean().default(true),
      text: i18n(600).nullable().default(null),
      signatory: z
        .object({
          name: z.string().trim().max(80),
          role: i18n(80),
          signatureFileId: z.string().uuid().nullable().default(null),
        })
        .nullable()
        .default(null),
    })
    .default({}),
});
export type CardDesign = z.infer<typeof cardDesign>;

/** Champs visibles par défaut : photo, numéro, zone, validité. */
export const DEFAULT_CARD_FIELDS: Record<CardField, boolean> = {
  photo: true,
  number: true,
  zone: true,
  status: false,
  since: true,
  validity: true,
};

/** Modèle complet (valeurs par défaut pour tout ce que le parti n'a pas réglé). */
export function resolveCardDesign(stored: unknown): CardDesign & { fields: Record<CardField, boolean> } {
  const parsed = cardDesign.safeParse(stored ?? {});
  const d = parsed.success ? parsed.data : cardDesign.parse({});
  const fields = { ...DEFAULT_CARD_FIELDS };
  for (const f of CARD_FIELDS) if (typeof d.fields[f] === "boolean") fields[f] = d.fields[f];
  return { ...d, fields };
}
