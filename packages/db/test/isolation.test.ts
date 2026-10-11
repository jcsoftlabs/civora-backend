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

let tables: string[] = [];
let columns: Column[] = [];
let enumFirstLabel = new Map<string, string>();

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

/** Colonnes et valeurs d'une ligne valide de `table` pour le parti donné. */
function rowFor(table: string, partyId: string): { cols: string[]; vals: string[]; casts: string[] } {
  const cols: string[] = [];
  const vals: string[] = [];
  const casts: string[] = [];
  for (const c of columns.filter((x) => x.table === table && (x.required || x.column === "party_id"))) {
    cols.push(c.column);
    vals.push(c.column === "party_id" ? partyId : sampleValue(c));
    casts.push(c.isArray ? `"${c.udt.slice(1)}"[]` : `"${c.udt}"`);
  }
  return { cols, vals, casts };
}

/** Même insertion, exprimée pour drizzle (connexion civora_app via withParty). */
function insertSql(table: string, partyId: string): SQL {
  const { cols, vals, casts } = rowFor(table, partyId);
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

  // Deux partis et une ligne par table pour chacun, insérés par le propriétaire (hors RLS).
  for (const id of [A, B]) {
    await owner`insert into parties (id, slug, name) values (${id}, ${"test-" + id}, ${"Parti test"})`;
    for (const table of tables) {
      const { cols, vals, casts } = rowFor(table, id);
      const placeholders = casts.map((c, i) => `$${i + 1}::${c}`).join(", ");
      await owner.unsafe(
        `insert into "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) values (${placeholders})`,
        vals,
      );
    }
  }
});

afterAll(async () => {
  for (const table of tables) await owner.unsafe(`delete from "${table}" where party_id in ($1, $2)`, [A, B]);
  await owner`delete from parties where id in (${A}, ${B})`;
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
