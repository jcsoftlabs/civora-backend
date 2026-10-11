// SEC-04 : les recherches d'authentification n'ouvrent qu'une ligne précise, en lecture seule.
import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, withAuthLookup } from "../src/client.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const B = randomUUID();
const slugA = `test-${A.slice(0, 8)}`;
const tokenA = createHash("sha256").update(randomUUID()).digest("hex");
const tokenB = createHash("sha256").update(randomUUID()).digest("hex");
let zone = "";
let user = "";

beforeAll(async () => {
  zone = (
    await owner`insert into zones (level, code, name, path) values ('pays', ${"t" + A}, 'z', 'ht.t') returning id`
  )[0]!.id;
  user = (await owner`insert into users (email) values (${A + "@example.test"}) returning id`)[0]!.id;
  for (const [p, slug, token] of [
    [A, slugA, tokenA],
    [B, `test-${B.slice(0, 8)}`, tokenB],
  ] as const) {
    await owner`insert into parties (id, slug, name) values (${p}, ${slug}, 'Parti test')`;
    const [m] = await owner`insert into members (party_id, member_number, first_name, last_name, zone_id)
      values (${p}, '1', 'a', 'b', ${zone}) returning id`;
    await owner`insert into sessions (party_id, user_id, member_id, token_hash, expires_at)
      values (${p}, ${user}, ${m!.id}, ${token}, now() + interval '1 day')`;
  }
});

afterAll(async () => {
  for (const t of ["sessions", "members"]) await owner.unsafe(`delete from ${t} where party_id in ($1, $2)`, [A, B]);
  await owner`delete from parties where id in (${A}, ${B})`;
  await owner`delete from users where id = ${user}`;
  await owner`delete from zones where id = ${zone}`;
  await owner.end();
  await closeDb();
});

describe("withAuthLookup", () => {
  it("par empreinte de jeton : une seule session, rien d'autre", async () => {
    await withAuthLookup({ sessionTokenHash: tokenA }, async (tx) => {
      const s = await tx.execute<{ party_id: string }>(sql`select party_id from sessions`);
      expect(s.map((r) => r.party_id)).toEqual([A]);
      expect((await tx.execute(sql`select 1 from members`)).length).toBe(0);
      expect((await tx.execute(sql`select 1 from parties`)).length).toBe(0);
    });
  });

  it("une empreinte inconnue ne révèle rien", async () => {
    const unknown = createHash("sha256").update("x").digest("hex");
    const rows = await withAuthLookup({ sessionTokenHash: unknown }, (tx) => tx.execute(sql`select 1 from sessions`));
    expect(rows.length).toBe(0);
  });

  it("ne permet pas de modifier ou révoquer une session", async () => {
    await withAuthLookup({ sessionTokenHash: tokenA }, (tx) => tx.execute(sql`update sessions set revoked_at = now()`));
    const [s] = await owner`select revoked_at from sessions where token_hash = ${tokenA}`;
    expect(s?.revoked_at).toBeNull();
  });

  it("par slug : un seul parti, aucune donnée métier", async () => {
    await withAuthLookup({ partySlug: slugA }, async (tx) => {
      const p = await tx.execute<{ id: string }>(sql`select id from parties`);
      expect(p.map((r) => r.id)).toEqual([A]);
      expect((await tx.execute(sql`select 1 from sessions`)).length).toBe(0);
      expect((await tx.execute(sql`select 1 from members`)).length).toBe(0);
    });
  });

  it("refuse des valeurs mal formées", async () => {
    await expect(withAuthLookup({ partySlug: "' or 1=1" }, async () => 0)).rejects.toThrow();
    await expect(withAuthLookup({ sessionTokenHash: "abc" }, async () => 0)).rejects.toThrow();
  });
});
