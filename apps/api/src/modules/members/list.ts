// Liste des membres du back-office : recherche, filtres, pagination, dans la zone de la personne (SEC-05).
import type { FastifyRequest } from "fastify";
import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { memberStatuses, members, users, withParty, zones } from "@civora/db";
import { zoneScope } from "../../lib/zone-scope.js";
import { ApiError } from "../../plugins/errors.js";
import { filterConditions, filterExpression, memberFilters } from "./filters.js";

const csv = (max: number) =>
  z
    .string()
    .transform((s) => s.split(",").filter(Boolean))
    .pipe(z.array(z.string().min(1).max(40)).max(max));

/** Paramètres d'URL : les filtres de l'export, plus recherche, tri et page. */
export const listQuery = z.object({
  q: z.string().trim().max(80).optional(),
  state: memberFilters.shape.state,
  zoneCode: memberFilters.shape.zoneCode,
  statusId: memberFilters.shape.statusId,
  tags: csv(10).optional(),
  diaspora: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  /** Filtre composé, en JSON dans l'adresse : { combinator, rules }. */
  filter: z
    .string()
    .max(4000)
    .transform((v, ctx) => {
      try {
        return JSON.parse(v) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "filtre illisible" });
        return z.NEVER;
      }
    })
    .pipe(filterExpression)
    .optional(),
  sort: z.enum(["name", "recent", "number"]).default("name"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/**
 * État de chaque mois de l'année pour les cotisations : réglé, en retard (délai de grâce de la formule dépassé),
 * à régler (échéance à venir ou dans le délai), ou rien de dû. Même règle que le relevé (obligationState).
 */
export type MonthDues = "paid" | "late" | "due" | "none";

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listMembers(req: FastifyRequest, q: z.infer<typeof listQuery>) {
  const scope = zoneScope(req, "members.read");
  if (!scope.allowed) throw new ApiError(403, "forbidden");
  const year = new Date().getUTCFullYear();

  return withParty(req.partyId, async (tx) => {
    const { state, filter, ...rest } = q;
    const base = await filterConditions(
      tx,
      { ...rest, ...(filter ? { expression: filter } : {}) },
      scope.where(zones.path),
    );
    if (q.q) {
      const like = `%${escapeLike(q.q)}%`;
      base.push(
        or(
          ilike(sql`${members.firstName} || ' ' || ${members.lastName}`, like),
          ilike(sql`${members.lastName} || ' ' || ${members.firstName}`, like),
          eq(members.memberNumber, q.q),
          ilike(users.email, like),
        ),
      );
    }
    const where = and(...base, state ? eq(members.applicationState, state) : undefined);

    const order =
      q.sort === "recent"
        ? [desc(members.joinedAt), desc(members.createdAt)]
        : q.sort === "number"
          ? [asc(members.memberNumber)]
          : [asc(members.lastName), asc(members.firstName)];

    const rows = await tx
      .select({
        id: members.id,
        number: members.memberNumber,
        firstName: members.firstName,
        lastName: members.lastName,
        state: members.applicationState,
        status: memberStatuses.label,
        zoneCode: zones.code,
        zoneName: zones.name,
        parentName: sql<string | null>`(select p.name from zones p
          where p.path = subpath("zones"."path", 0, nlevel("zones"."path") - 1) and nlevel("zones"."path") > 1)`,
        isDiaspora: members.isDiaspora,
        tags: members.tags,
        joinedAt: members.joinedAt,
        hasPhoto: sql<boolean>`"members"."photo_file_id" is not null`,
        // Douze mois de l'année en cours, de janvier à décembre.
        dues: sql<MonthDues[]>`(select array_agg(x.st order by m.m) from generate_series(1, 12) as m(m)
          cross join lateral (select case
            when count(*) = 0 then 'none'
            when count(*) filter (where o.paid_at is null) = 0 then 'paid'
            when bool_or(o.paid_at is null and o.due_date + pl.grace_days < current_date) then 'late'
            else 'due' end as st
            from dues_obligations o
            join dues_plans pl on pl.party_id = o.party_id and pl.id = o.plan_id
            where o.member_id = "members"."id"
              and o.period_start >= make_date(${year}, m.m, 1)
              and o.period_start < make_date(${year}, m.m, 1) + interval '1 month') x)`,
      })
      .from(members)
      .innerJoin(zones, eq(zones.id, members.zoneId))
      .leftJoin(
        memberStatuses,
        and(eq(memberStatuses.partyId, members.partyId), eq(memberStatuses.id, members.statusId)),
      )
      .leftJoin(users, eq(users.id, members.userId))
      .where(where)
      .orderBy(...order, asc(members.id))
      .limit(q.limit)
      .offset((q.page - 1) * q.limit);

    // Compteurs des onglets : même recherche et mêmes filtres, toutes adhésions confondues.
    const byState = await tx
      .select({ state: members.applicationState, n: count() })
      .from(members)
      .innerJoin(zones, eq(zones.id, members.zoneId))
      .leftJoin(users, eq(users.id, members.userId))
      .where(and(...base))
      .groupBy(members.applicationState);
    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const r of byState) counts[r.state] = r.n;
    const total = state ? counts[state] : counts.pending + counts.approved + counts.rejected;

    return { items: rows, total, counts, page: q.page, limit: q.limit, year };
  });
}
