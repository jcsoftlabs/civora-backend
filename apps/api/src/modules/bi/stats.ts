// PIL-01 : statistiques d'adhésion, de cotisation et d'engagement par zone. Agrégats seulement, jamais de nom.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { withParty, zones } from "@civora/db";
import { today } from "../../lib/today.js";
import { requireAuth } from "../../plugins/auth.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize, requireFeature } from "../../plugins/tenant.js";

export const statsQuery = z.object({
  parent: z
    .string()
    .regex(/^[A-Z0-9-]{2,20}$/)
    .optional(),
});

interface ZoneStats {
  code: string;
  name: string;
  nameHt: string | null;
  level: string;
  members: { approved: number; pending: number; newLast30Days: number; diaspora: number };
  dues: { upToDate: number; late: number; collectedLast30Days: Record<string, string> };
  engagement: { eventRegistrationsLast30Days: number };
}

/**
 * Découpe une zone en sous-zones (départements sous Haïti, communes sous un département…) avec leurs indicateurs,
 * plus une ligne de total pour la zone elle-même. Permission bi.read sur la zone demandée (SEC-05).
 */
export async function zoneStats(req: FastifyRequest, parentCode?: string) {
  // Sans zone demandée : la zone du poste de la personne s'il n'y en a qu'une, sinon Haïti.
  const scopes = req.grants.filter((g) => g.permission === "bi.read");
  if (!scopes.length) throw new ApiError(403, "forbidden");
  return withParty(req.partyId, async (tx) => {
    let code = parentCode;
    if (!code) {
      const local = scopes.every((g) => g.zonePath !== null) && new Set(scopes.map((g) => g.zonePath)).size === 1;
      if (local) {
        const [z] = await tx
          .select({ code: zones.code })
          .from(zones)
          .where(sql`${zones.path} = ${scopes[0]!.zonePath}::ltree`);
        code = z?.code;
      }
    }
    const [parent] = await tx
      .select({
        id: zones.id,
        code: zones.code,
        name: zones.name,
        nameHt: zones.nameHt,
        level: zones.level,
        path: zones.path,
      })
      .from(zones)
      .where(eq(zones.code, code ?? "HT"));
    if (!parent) throw new ApiError(404, "not_found");
    if (!authorize(req, "bi.read", parent.path)) throw new ApiError(403, "forbidden");

    const day = today();
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    // Une ligne par sous-zone, plus la zone elle-même (total) ; les membres sont comptés dans leur sous-arbre.
    const rows = await tx.execute<{
      code: string;
      name: string;
      name_ht: string | null;
      level: string;
      is_total: boolean;
      approved: number;
      pending: number;
      new_30: number;
      diaspora: number;
      late: number;
      registrations_30: number;
    }>(sql`
      with targets as (
        select id, code, name, name_ht, level, path, false as is_total from zones where parent_id = ${parent.id}
        union all
        select id, code, name, name_ht, level, path, true from zones where id = ${parent.id}
      ),
      m as (
        select t.code, mb.id, mb.application_state, mb.joined_at, mb.is_diaspora
        from targets t
        join zones z on z.path <@ t.path
        join members mb on mb.zone_id = z.id and mb.deleted_at is null
      )
      select t.code, t.name, t.name_ht, t.level::text as level, t.is_total,
        count(m.id) filter (where m.application_state = 'approved')::int as approved,
        count(m.id) filter (where m.application_state = 'pending')::int as pending,
        count(m.id) filter (where m.application_state = 'approved' and m.joined_at >= ${since}::timestamptz)::int as new_30,
        count(m.id) filter (where m.application_state = 'approved' and m.is_diaspora)::int as diaspora,
        count(m.id) filter (where m.application_state = 'approved' and exists (
          select 1 from dues_obligations o join dues_plans p on p.party_id = o.party_id and p.id = o.plan_id
          where o.member_id = m.id and o.paid_at is null and o.due_date + p.grace_days < ${day}::date))::int as late,
        (select count(*)::int from event_registrations r join m m2 on m2.id = r.member_id
          where m2.code = t.code and r.created_at >= ${since}::timestamptz) as registrations_30
      from targets t
      left join m on m.code = t.code
      group by t.code, t.name, t.name_ht, t.level, t.is_total
      order by t.is_total desc, t.name`);

    const collected = await tx.execute<{ code: string; currency: string; total: string }>(sql`
      with targets as (
        select code, path from zones where parent_id = ${parent.id} union all select code, path from zones where id = ${parent.id}
      )
      select t.code, p.currency, sum(p.amount)::numeric(14,2)::text as total
      from targets t
      join zones z on z.path <@ t.path
      join members mb on mb.zone_id = z.id
      join payments p on p.member_id = mb.id and p.status = 'succeeded' and p.confirmed_at >= ${since}::timestamptz
      group by t.code, p.currency`);

    const toStats = (r: (typeof rows)[number]): ZoneStats => ({
      code: r.code,
      name: r.name,
      nameHt: r.name_ht,
      level: r.level,
      members: { approved: r.approved, pending: r.pending, newLast30Days: r.new_30, diaspora: r.diaspora },
      dues: {
        upToDate: r.approved - r.late,
        late: r.late,
        collectedLast30Days: Object.fromEntries(
          collected.filter((c) => c.code === r.code).map((c) => [c.currency, c.total]),
        ),
      },
      engagement: { eventRegistrationsLast30Days: r.registrations_30 },
    });
    const total = rows.find((r) => r.is_total);
    return { zone: total ? toStats(total) : null, children: rows.filter((r) => !r.is_total).map(toStats) };
  });
}

export default async function biRoutes(app: FastifyInstance) {
  app.get("/stats/zones", { preHandler: [requireAuth, requireFeature("bi.indicators")] }, async (req) =>
    zoneStats(req, statsQuery.parse(req.query).parent),
  );
}
