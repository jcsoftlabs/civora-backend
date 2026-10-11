import { z } from "zod";
import { PERMISSIONS } from "@civora/shared";

const zoneCode = z.string().regex(/^[A-Z0-9-]{2,20}$/);

export const organCreate = z.object({
  name: z.string().trim().min(2).max(120),
  /** Libellé libre du parti : bureau national, section, coordination, commission, antenne diaspora (SOC-06). */
  kind: z.string().trim().min(2).max(60),
  zoneCode: zoneCode.optional(),
  parentOrganId: z.string().uuid().optional(),
});

export const organUpdate = organCreate.partial().omit({ parentOrganId: true });

export const postCreate = z.object({
  title: z.string().trim().min(2).max(120),
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length).default([]),
  /** Portée territoriale du poste : par défaut celle de l'organe, jamais plus large. */
  scopeZoneCode: zoneCode.optional(),
});

export const postUpdate = postCreate.partial();

export const holderAssign = z.object({
  memberId: z.string().uuid(),
  startsAt: z.coerce.date().optional(),
  /** Successeur (ORG-04) : met fin au mandat des titulaires en cours ; sinon, titulaire supplémentaire. */
  replaceCurrent: z.boolean().default(true),
});

export const idParam = z.object({ id: z.string().uuid() });
export const holderParam = z.object({ id: z.string().uuid(), holderId: z.string().uuid() });
