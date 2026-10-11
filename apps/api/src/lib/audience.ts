// Ciblage commun aux publications (COM-01), notifications (COM-02) et envois groupés (COM-03).
// Une audience restreint les membres visés ; null = tous les membres du parti.
import type { FastifyRequest } from "fastify";
import { inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { zones, type Tx } from "@civora/db";
import type { Permission } from "@civora/shared";
import { ApiError } from "../plugins/errors.js";
import { authorize } from "../plugins/tenant.js";

/** Audience telle que saisie : codes de zones, statuts, organes, diaspora. */
export const audienceInput = z
  .object({
    zoneCodes: z
      .array(z.string().regex(/^[A-Z0-9-]{2,20}$/))
      .min(1)
      .max(50)
      .optional(),
    statusIds: z.array(z.string().uuid()).min(1).max(20).optional(),
    organIds: z.array(z.string().uuid()).min(1).max(20).optional(),
    diaspora: z.boolean().optional(),
  })
  .nullable();
export type AudienceInput = z.infer<typeof audienceInput>;

/** Audience enregistrée : zones résolues en chemins, pour filtrer sans relire le référentiel. */
export interface Audience {
  zonePaths?: string[];
  zoneCodes?: string[];
  statusIds?: string[];
  organIds?: string[];
  diaspora?: boolean;
}

/**
 * Résout l'audience et vérifie qu'elle reste dans la portée de la personne (SEC-05) : chaque zone visée doit
 * être dans sa zone ; une audience sans zone (tout le parti, ou un statut partout) exige un poste national.
 */
export async function resolveAudience(
  tx: Tx,
  req: Pick<FastifyRequest, "grants">,
  permission: Permission,
  input: AudienceInput,
): Promise<Audience | null> {
  const a = input ?? {};
  let zonePaths: string[] | undefined;
  if (a.zoneCodes) {
    const rows = await tx
      .select({ code: zones.code, path: zones.path })
      .from(zones)
      .where(inArray(zones.code, a.zoneCodes));
    if (rows.length !== new Set(a.zoneCodes).size) throw new ApiError(400, "zone_not_found");
    for (const z of rows) if (!authorize(req, permission, z.path)) throw new ApiError(403, "audience_outside_scope");
    zonePaths = rows.map((r) => r.path);
  } else if (!authorize(req, permission)) {
    throw new ApiError(403, "audience_outside_scope");
  }
  const out: Audience = {
    ...(zonePaths && a.zoneCodes ? { zonePaths, zoneCodes: a.zoneCodes } : {}),
    ...(a.statusIds ? { statusIds: a.statusIds } : {}),
    ...(a.organIds ? { organIds: a.organIds } : {}),
    ...(a.diaspora !== undefined ? { diaspora: a.diaspora } : {}),
  };
  return Object.keys(out).length ? out : null;
}

/**
 * Condition SQL : le membre (colonnes passées en paramètre) fait-il partie de l'audience stockée dans `audienceCol` ?
 * Chaque critère présent doit être satisfait (ET) ; dans un critère, une valeur suffit (OU).
 */
export function memberInAudience(
  audienceCol: SQL | ReturnType<typeof sql.raw>,
  m: { memberId: SQL; zonePath: SQL; statusId: SQL; isDiaspora: SQL },
): SQL {
  return sql`(
    ${audienceCol} is null or (
      (${audienceCol} -> 'zonePaths' is null or exists (
        select 1 from jsonb_array_elements_text(${audienceCol} -> 'zonePaths') zp where ${m.zonePath} <@ zp::ltree))
      and (${audienceCol} -> 'statusIds' is null or ${audienceCol} -> 'statusIds' ? (${m.statusId})::text)
      and (${audienceCol} -> 'diaspora' is null or (${audienceCol} ->> 'diaspora')::boolean = ${m.isDiaspora})
      and (${audienceCol} -> 'organIds' is null or exists (
        select 1 from organ_members om
        where om.member_id = ${m.memberId} and ${audienceCol} -> 'organIds' ? om.organ_id::text))
    )
  )`;
}

/** Valeurs d'un membre pour memberInAudience, à partir des colonnes d'une requête qui joint members et zones. */
export function memberColumns(members: { id: unknown; statusId: unknown; isDiaspora: unknown }, zonePathCol: unknown) {
  return {
    memberId: sql`${members.id}`,
    zonePath: sql`${zonePathCol}`,
    statusId: sql`${members.statusId}`,
    isDiaspora: sql`${members.isDiaspora}`,
  };
}
