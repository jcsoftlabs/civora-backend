// Tâches de fond : la seule lecture transversale est la liste des identifiants des partis.
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, db, listPartyIdsForJobs } from "../src/client.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const B = randomUUID();

beforeAll(async () => {
  await owner`insert into parties (id, slug, name) values (${A}, ${"jobs-a-" + A.slice(0, 8)}, 'A'), (${B}, ${"jobs-b-" + B.slice(0, 8)}, 'B')`;
});
afterAll(async () => {
  await owner`delete from parties where id in (${A}, ${B})`;
  await owner.end();
  await closeDb();
});

describe("job_party_ids", () => {
  it("donne les identifiants de tous les partis au rôle applicatif", async () => {
    expect(await listPartyIdsForJobs()).toEqual(expect.arrayContaining([A, B]));
  });

  it("ne donne que des identifiants : la table parties reste fermée sans contexte", async () => {
    expect((await db.execute(sql`select 1 from parties`)).length).toBe(0);
    const cols = await db.execute(sql`select * from job_party_ids() limit 1`);
    expect(Object.keys(cols[0] ?? {})).toEqual(["job_party_ids"]);
  });

  it("le rôle applicatif lit et écrit les jobs, mais ne crée aucune table, ni dans pgboss ni ailleurs", async () => {
    await expect(db.execute(sql`create table pgboss.essai_droits (x int)`)).rejects.toThrow();
    await expect(db.execute(sql`create table public.essai_droits (x int)`)).rejects.toThrow();
    const queues = await db.execute<{ name: string }>(sql`select name from pgboss.queue`);
    expect(queues.map((q) => q.name)).toEqual(expect.arrayContaining(["payments.reconcile", "dues.generate"]));
  });
});
