// SEC-01, SOC-02 : preuve d'isolation entre deux partis, pour CHAQUE table qui porte party_id.
// Ce test est obligatoire et ne doit jamais être désactivé.
// Les lignes sont fabriquées à partir du catalogue Postgres : une nouvelle table est couverte sans rien écrire ici.
import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, db, withParty } from "../src/client.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });

const A = randomUUID();
const B = randomUUID();

interface Column {
  table: string;
  column: string;
  udt: string;
  isArray: boolean;
  required: boolean;
}

interface ForeignKey {
  table: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
}

let tables: string[] = [];
let columns: Column[] = [];
let foreignKeys: ForeignKey[] = [];
let enumFirstLabel = new Map<string, string>();
/** Ligne fabriquée par table et par parti : les colonnes obligatoires qui pointent vers une autre table la réutilisent. */
const rowIds = new Map<string, string>();
let testZoneId = "";
let testUserId = "";

/** Valeur valide (en texte, castée côté SQL) pour une colonne obligatoire, selon son type. */
function sampleValue(c: Column): string {
  if (c.isArray) return "{}";
  const label = enumFirstLabel.get(c.udt);
  if (label) return label;
  switch (c.udt) {
    case "uuid":
      return randomUUID();
    case "text":
    case "varchar":
      return `test-${randomUUID()}`;
    case "jsonb":
    case "json":
      return "{}";
    case "int2":
    case "int4":
    case "int8":
    case "numeric":
    case "float4":
    case "float8":
      return "1";
    case "bool":
      return "true";
    case "date":
      return "2026-01-01";
    case "timestamptz":
    case "timestamp":
      return new Date().toISOString();
    case "bytea":
      return "\\x00";
    case "ltree":
      return "ht.test";
    default:
      throw new Error(`Type sans fabrique dans le test d'isolation : ${c.table}.${c.column} (${c.udt})`);
  }
}

/** Valeur d'une colonne qui pointe vers une autre table : la ligne du même parti (ou la zone de test). */
function referencedValue(table: string, column: string, partyId: string): string | undefined {
  const fk = foreignKeys.find((f) => f.table === table && f.columns.includes(column) && f.refTable !== "parties");
  if (!fk) return undefined;
  if (fk.refTable === "zones") return testZoneId;
  if (fk.refTable === "users") return testUserId;
  const id = rowIds.get(`${fk.refTable}:${partyId}`);
  if (!id) throw new Error(`Fabrique : ${table}.${column} dépend de ${fk.refTable}, pas encore créée`);
  return id;
}

/** Colonnes et valeurs d'une ligne valide de `table` pour le parti donné. */
function rowFor(
  table: string,
  partyId: string,
  refParty = partyId,
): { cols: string[]; vals: string[]; casts: string[] } {
  const cols: string[] = [];
  const vals: string[] = [];
  const casts: string[] = [];
  for (const c of columns.filter((x) => x.table === table && (x.required || x.column === "party_id"))) {
    cols.push(c.column);
    vals.push(c.column === "party_id" ? partyId : (referencedValue(table, c.column, refParty) ?? sampleValue(c)));
    casts.push(c.isArray ? `"${c.udt.slice(1)}"[]` : `"${c.udt}"`);
  }
  return { cols, vals, casts };
}

/** Ordre d'insertion : une table vient après celles que ses colonnes obligatoires référencent. */
function insertionOrder(): string[] {
  const requiredDeps = (t: string) =>
    foreignKeys
      .filter((f) => f.table === t && f.refTable !== t && tables.includes(f.refTable))
      .filter((f) => f.columns.some((c) => columns.find((x) => x.table === t && x.column === c)?.required))
      .map((f) => f.refTable);
  const done: string[] = [];
  const pending = new Set(tables);
  while (pending.size) {
    const ready = [...pending].filter((t) => requiredDeps(t).every((d) => done.includes(d)));
    if (!ready.length) throw new Error(`Dépendances circulaires obligatoires : ${[...pending].join(", ")}`);
    for (const t of ready) (done.push(t), pending.delete(t));
  }
  return done;
}

/** Même insertion, exprimée pour drizzle (connexion civora_app via withParty). */
function insertSql(table: string, partyId: string, refParty = partyId): SQL {
  const { cols, vals, casts } = rowFor(table, partyId, refParty);
  const values = vals.map((v, i) => sql`${v}::${sql.raw(casts[i] ?? "text")}`);
  return sql`insert into ${sql.identifier(table)} (${sql.join(
    cols.map((c) => sql.identifier(c)),
    sql`, `,
  )}) values (${sql.join(values, sql`, `)})`;
}

beforeAll(async () => {
  tables = (
    await owner<{ table_name: string }[]>`
      select c.table_name from information_schema.columns c
      join information_schema.tables t using (table_schema, table_name)
      where c.table_schema = 'public' and c.column_name = 'party_id' and t.table_type = 'BASE TABLE'
      order by 1`
  ).map((r) => r.table_name);

  columns = (
    await owner<{ table_name: string; column_name: string; udt_name: string; data_type: string; required: boolean }[]>`
      select table_name, column_name, udt_name, data_type,
             (is_nullable = 'NO' and column_default is null and is_identity = 'NO') as required
      from information_schema.columns where table_schema = 'public'`
  ).map((r) => ({
    table: r.table_name,
    column: r.column_name,
    udt: r.udt_name,
    isArray: r.data_type === "ARRAY",
    required: r.required,
  }));

  enumFirstLabel = new Map(
    (
      await owner<{ typname: string; label: string }[]>`
        select distinct on (t.typname) t.typname, e.enumlabel as label
        from pg_type t join pg_enum e on e.enumtypid = t.oid order by t.typname, e.enumsortorder`
    ).map((r) => [r.typname, r.label]),
  );

  foreignKeys = (
    await owner<{ table: string; columns: string[]; ref_table: string; ref_columns: string[] }[]>`
      select c.conrelid::regclass::text as table, c.confrelid::regclass::text as ref_table,
             array(select a.attname::text from unnest(c.conkey) k
                   join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k) as columns,
             array(select a.attname::text from unnest(c.confkey) k
                   join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k) as ref_columns
      from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace`
  ).map((r) => ({ table: r.table, columns: r.columns, refTable: r.ref_table, refColumns: r.ref_columns }));

  const [zone] = await owner<{ id: string }[]>`
    insert into zones (level, code, name, path) values ('pays', ${"test-" + A}, 'Zone de test', 'ht.test') returning id`;
  testZoneId = zone?.id ?? "";
  const [user] = await owner<{ id: string }[]>`
    insert into users (email) values (${"test-" + A + "@example.test"}) returning id`;
  testUserId = user?.id ?? "";

  // Deux partis et une ligne par table pour chacun, insérés par le propriétaire (hors RLS), parents d'abord.
  tables = insertionOrder();
  for (const id of [A, B]) {
    await owner`insert into parties (id, slug, name) values (${id}, ${"test-" + id}, ${"Parti test"})`;
    for (const table of tables) {
      const { cols, vals, casts } = rowFor(table, id);
      const placeholders = casts.map((c, i) => `$${i + 1}::${c}`).join(", ");
      const [row] = await owner.unsafe<{ id: string }[]>(
        `insert into "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) values (${placeholders}) returning id`,
        vals,
      );
      if (row) rowIds.set(`${table}:${id}`, row.id);
    }
  }
});

afterAll(async () => {
  // Enfants d'abord, dans l'ordre inverse de création.
  for (const table of [...tables].reverse()) {
    await owner.unsafe(`delete from "${table}" where party_id in ($1, $2)`, [A, B]);
  }
  await owner`delete from parties where id in (${A}, ${B})`;
  await owner`delete from zones where id = ${testZoneId}`;
  await owner`delete from users where id = ${testUserId}`;
  await owner.end();
  await closeDb();
});

describe("isolation entre partis", () => {
  it("couvre toutes les tables métier", () => {
    expect(tables.length).toBeGreaterThan(40);
    expect(tables).toEqual(expect.arrayContaining(["members", "payments", "ballots", "audit_log", "files"]));
  });

  it("dans withParty(A), chaque table ne renvoie que les lignes de A", async () => {
    const leaks: string[] = [];
    await withParty(A, async (tx) => {
      for (const table of tables) {
        const rows = await tx.execute<{ party_id: string }>(sql`select party_id from ${sql.identifier(table)}`);
        if (rows.length !== 1 || rows.some((r) => r.party_id !== A)) leaks.push(`${table} (${rows.length} lignes)`);
      }
    });
    expect(leaks).toEqual([]);
  });

  it("dans withParty(A), insérer une ligne avec party_id = B est refusé (WITH CHECK)", async () => {
    const accepted: string[] = [];
    for (const table of tables) {
      try {
        await withParty(A, (tx) => tx.execute(insertSql(table, B)));
        accepted.push(table);
      } catch (e) {
        const code = (e as { cause?: { code?: string }; code?: string }).cause?.code ?? (e as { code?: string }).code;
        if (code !== "42501") accepted.push(`${table} (erreur inattendue ${code})`);
      }
    }
    expect(accepted).toEqual([]);
  });

  it("dans withParty(A), une ligne de A peut être insérée", async () => {
    await withParty(A, async (tx) => {
      await tx.execute(insertSql("members", A));
      const rows = await tx.execute(sql`select 1 from members`);
      expect(rows.length).toBe(2);
      tx.rollback();
    }).catch((e: Error) => {
      if (!/rollback/i.test(e.message)) throw e;
    });
  });

  it("dans withParty(A), une ligne de A ne peut pas pointer vers une ligne de B (clés composites)", async () => {
    // Chaque table qui référence une autre table du parti : la ligne de A pointe vers les parents de B.
    const referencing = tables.filter((t) =>
      foreignKeys.some(
        (f) =>
          f.table === t &&
          f.columns[0] === "party_id" &&
          f.columns.length === 2 &&
          columns.find((c) => c.table === t && c.column === f.columns[1])?.required,
      ),
    );
    expect(referencing.length).toBeGreaterThan(20);
    const accepted: string[] = [];
    for (const table of referencing) {
      try {
        await withParty(A, (tx) => tx.execute(insertSql(table, A, B)));
        accepted.push(table);
      } catch (e) {
        const code = (e as { cause?: { code?: string } }).cause?.code;
        if (code !== "23503") accepted.push(`${table} (erreur inattendue ${code})`);
      }
    }
    expect(accepted).toEqual([]);
  });

  it("un membre de B ne peut pas être ajouté à un organe de A", async () => {
    const organA = rowIds.get(`organs:${A}`);
    const memberB = rowIds.get(`members:${B}`);
    await expect(
      withParty(A, (tx) =>
        tx.execute(sql`insert into organ_members (party_id, organ_id, member_id) values (${A}, ${organA}, ${memberB})`),
      ),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });

  it("un compte n'adhère qu'à un seul parti", async () => {
    const [user] = await owner<{ id: string }[]>`
      insert into users (phone_e164) values (${"+509" + Date.now()}) returning id`;
    try {
      await owner`update members set user_id = ${user?.id ?? null} where id = ${rowIds.get(`members:${A}`) ?? null}`;
      await expect(
        owner`update members set user_id = ${user?.id ?? null} where id = ${rowIds.get(`members:${B}`) ?? null}`,
      ).rejects.toMatchObject({ code: "23505" });
    } finally {
      await owner`update members set user_id = null where user_id = ${user?.id ?? null}`;
      await owner`delete from users where id = ${user?.id ?? null}`;
    }
  });

  it("dans withParty(A), modifier ou supprimer une ligne de B n'a aucun effet", async () => {
    await withParty(A, async (tx) => {
      await tx.execute(sql`update members set first_name = 'pirate' where party_id = ${B}`);
      await tx.execute(sql`delete from payments where party_id = ${B}`);
    });
    const [m] = await owner`select first_name from members where party_id = ${B}`;
    const [p] = await owner`select count(*)::int as n from payments where party_id = ${B}`;
    expect(m?.first_name).not.toBe("pirate");
    expect(p?.n).toBe(1);
  });

  it("sans app.party_id, toute lecture renvoie zéro ligne", async () => {
    const visible: string[] = [];
    await db.transaction(async (tx) => {
      for (const table of tables) {
        const rows = await tx.execute(sql`select 1 from ${sql.identifier(table)}`);
        if (rows.length > 0) visible.push(table);
      }
    });
    expect(visible).toEqual([]);
  });

  it("le contexte de parti ne survit pas à la transaction (sûr derrière un pooler)", async () => {
    await withParty(A, (tx) => tx.execute(sql`select 1`));
    // Même pool : sans SET LOCAL, la connexion réutilisée ne porte plus app.party_id.
    const rows = await db.execute(sql`select count(*)::int as n from members`);
    expect(rows[0]?.n).toBe(0);
  });

  it("un parti ne voit que sa propre ligne dans parties", async () => {
    const rows = await withParty(A, (tx) => tx.execute<{ id: string }>(sql`select id from parties`));
    expect(rows.map((r) => r.id)).toEqual([A]);
  });

  it("withParty refuse un identifiant qui n'est pas un UUID", async () => {
    await expect(withParty("' or 1=1 --", async () => 0)).rejects.toThrow("party_id invalide");
    await expect(withParty("-".repeat(36), async () => 0)).rejects.toThrow("party_id invalide");
  });

  it("ballots ne contient aucune colonne member_id (secret du vote)", () => {
    const ballotCols = columns.filter((c) => c.table === "ballots").map((c) => c.column);
    expect(ballotCols.length).toBeGreaterThan(0);
    expect(ballotCols.filter((c) => /member|user|voter/.test(c))).toEqual([]);
  });

  it("audit_log, point_ledger, ballots et ballot_receipts sont en ajout seul", async () => {
    for (const table of ["audit_log", "point_ledger", "ballots", "ballot_receipts"]) {
      await expect(withParty(A, (tx) => tx.execute(sql`delete from ${sql.identifier(table)}`))).rejects.toThrow();
      await expect(
        withParty(A, (tx) => tx.execute(sql`update ${sql.identifier(table)} set party_id = party_id`)),
      ).rejects.toThrow();
    }
  });
});
