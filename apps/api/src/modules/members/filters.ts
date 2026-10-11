// Filtres communs à la liste des membres et à l'export (ADH-12) : mêmes critères, même portée territoriale.
import { arrayOverlaps, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { members, zones, type Tx } from "@civora/db";
import { ApiError } from "../../plugins/errors.js";

export const memberFilters = z.object({
  state: z.enum(["pending", "approved", "rejected"]).optional(),
  zoneCode: z
    .string()
    .regex(/^[A-Z0-9-]{2,20}$/)
    .optional(),
  statusId: z.string().uuid().optional(),
  tags: z.array(z.string().min(1).max(40)).max(10).optional(),
  diaspora: z.boolean().optional(),
  /** Sélection cochée dans la liste (export de la sélection). */
  ids: z.array(z.string().uuid()).min(1).max(1000).optional(),
  /** Filtre composé (règles ET / OU), voir filterExpression plus bas. */
  expression: z.lazy(() => filterExpression).optional(),
});
export type MemberFilters = z.infer<typeof memberFilters>;

/** Conditions SQL des filtres ; la portée (`scope`) s'applique toujours, quel que soit le filtre de zone. */
export async function filterConditions(tx: Tx, f: MemberFilters, scope: SQL): Promise<(SQL | undefined)[]> {
  const conditions: (SQL | undefined)[] = [isNull(members.deletedAt), scope];
  if (f.zoneCode) {
    const [z] = await tx.select({ path: zones.path }).from(zones).where(eq(zones.code, f.zoneCode));
    if (!z) throw new ApiError(400, "zone_not_found");
    // Filtrer sur une zone hors de sa portée ne donne rien de plus.
    conditions.push(sql`${zones.path} <@ ${z.path}::ltree`);
  }
  if (f.state) conditions.push(eq(members.applicationState, f.state));
  if (f.statusId) conditions.push(eq(members.statusId, f.statusId));
  if (f.diaspora !== undefined) conditions.push(eq(members.isDiaspora, f.diaspora));
  if (f.tags?.length) conditions.push(arrayOverlaps(members.tags, f.tags));
  if (f.ids?.length) conditions.push(inArray(members.id, f.ids));
  conditions.push(await expressionCondition(tx, f.expression));
  return conditions;
}

/**
 * Filtre composé de la liste des membres : règles « champ, opérateur, valeur » reliées par ET ou OU.
 * Chaque règle devient une condition SQL paramétrée ; la portée territoriale de la personne s'y ajoute toujours.
 */
const codes = z
  .array(z.string().regex(/^[A-Z0-9-]{2,20}$/))
  .min(1)
  .max(20);
const uuids = z.array(z.string().uuid()).min(1).max(20);
const words = z.array(z.string().trim().min(1).max(40)).min(1).max(10);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Libellé d'affichage de la valeur (nom de la zone, du statut…), conservé dans les segments ; sans effet sur la requête. */
const label = z.string().trim().max(120).optional();

export const filterRule = z.discriminatedUnion("field", [
  z.object({ label, field: z.literal("zone"), operator: z.enum(["in", "notIn"]), value: codes }),
  z.object({ label, field: z.literal("status"), operator: z.enum(["in", "notIn"]), value: uuids }),
  z.object({ label, field: z.literal("tag"), operator: z.enum(["hasAny", "hasNone"]), value: words }),
  z.object({ label, field: z.literal("place"), operator: z.literal("is"), value: z.enum(["haiti", "diaspora"]) }),
  z.object({ label, field: z.literal("dues"), operator: z.literal("is"), value: z.enum(["upToDate", "late", "none"]) }),
  z.object({ label, field: z.literal("joined"), operator: z.enum(["after", "before"]), value: day }),
  z.object({
    field: z.literal("category"),
    operator: z.enum(["is", "isNot"]),
    value: z.string().trim().min(1).max(60),
  }),
  z.object({ label, field: z.literal("organ"), operator: z.literal("memberOf"), value: uuids }),
]);
export const filterExpression = z.object({
  combinator: z.enum(["and", "or"]).default("and"),
  rules: z.array(filterRule).max(12),
});
export type FilterExpression = z.infer<typeof filterExpression>;

/** Liste passée en JSON : drizzle développerait un tableau JavaScript en liste de valeurs. */
const jsonList = (v: string[]) => sql`(select jsonb_array_elements_text(${JSON.stringify(v)}::text::jsonb))`;

async function ruleCondition(tx: Tx, r: z.infer<typeof filterRule>): Promise<SQL> {
  switch (r.field) {
    case "zone": {
      const rows = await tx.select({ path: zones.path }).from(zones).where(inArray(zones.code, r.value));
      if (rows.length !== new Set(r.value).size) throw new ApiError(400, "zone_not_found");
      const inside = sql`${zones.path} <@ ${`{${rows.map((z) => z.path).join(",")}}`}::ltree[]`;
      return r.operator === "in" ? inside : sql`not (${inside})`;
    }
    case "status": {
      const inList = sql`"members"."status_id"::text in ${jsonList(r.value)}`;
      return r.operator === "in" ? inList : sql`("members"."status_id" is null or not (${inList}))`;
    }
    case "tag": {
      const any = sql`"members"."tags" && array${jsonList(r.value)}`;
      return r.operator === "hasAny" ? any : sql`not (${any})`;
    }
    case "place":
      return eq(members.isDiaspora, r.value === "diaspora");
    case "dues": {
      const has = sql`exists (select 1 from dues_obligations o where o.member_id = "members"."id")`;
      const late = sql`exists (select 1 from dues_obligations o
        join dues_plans pl on pl.party_id = o.party_id and pl.id = o.plan_id
        where o.member_id = "members"."id" and o.paid_at is null and o.due_date + pl.grace_days < current_date)`;
      if (r.value === "none") return sql`not ${has}`;
      return r.value === "late" ? late : sql`(${has} and not ${late})`;
    }
    case "joined":
      return r.operator === "after"
        ? sql`"members"."joined_at" >= ${r.value}::date`
        : sql`"members"."joined_at" < ${r.value}::date`;
    case "category":
      return r.operator === "is"
        ? sql`lower("members"."category") = lower(${r.value})`
        : sql`("members"."category" is null or lower("members"."category") <> lower(${r.value}))`;
    case "organ":
      return sql`exists (select 1 from organ_members om
        where om.member_id = "members"."id" and om.organ_id::text in ${jsonList(r.value)})`;
  }
}

/** Condition SQL du filtre composé (undefined s'il n'a aucune règle). */
export async function expressionCondition(tx: Tx, e: FilterExpression | undefined): Promise<SQL | undefined> {
  if (!e?.rules.length) return undefined;
  const parts = await Promise.all(e.rules.map((r) => ruleCondition(tx, r)));
  return sql`(${sql.join(parts, e.combinator === "or" ? sql` or ` : sql` and `)})`;
}
