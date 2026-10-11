// SOC-10, SEC-11 : les tables du personnel ne s'ouvrent qu'à la console ; la liste des organisations ne sort
// que dans une transaction de console ; le journal de la console est en ajout seulement.
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, withConsole, withParty } from "../src/client.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const P = randomUUID();
const email = `owner-${P.slice(0, 8)}@example.test`;
let staff = "";

beforeAll(async () => {
  await owner`insert into parties (id, slug, name) values (${P}, ${"console-" + P.slice(0, 8)}, 'Parti console')`;
  await owner`set app.console = 'on'`;
  staff = (
    await owner`insert into platform_staff (email, name, role) values (${email}, 'Propriétaire', 'owner')
    returning id`
  )[0]!.id;
  await owner`insert into platform_audit_log (staff_id, action) values (${staff}, 'test.action')`;
  await owner`reset app.console`;
});

afterAll(async () => {
  await owner`set session_replication_role = replica`;
  await owner`delete from platform_audit_log where staff_id = ${staff}`;
  await owner`delete from platform_staff where id = ${staff}`;
  await owner`delete from parties where id = ${P}`;
  await owner.end();
  await closeDb();
});

describe("console de l'éditeur", () => {
  it("une transaction d'organisation ne voit ni le personnel ni le journal de la console", async () => {
    await withParty(P, async (tx) => {
      expect(await tx.execute(sql`select 1 from platform_staff`)).toHaveLength(0);
      expect(await tx.execute(sql`select 1 from platform_audit_log`)).toHaveLength(0);
      expect(await tx.execute(sql`select 1 from console_parties()`)).toHaveLength(0);
    });
  });

  it("une transaction de console voit le personnel et la liste des organisations", async () => {
    await withConsole(async (tx) => {
      const rows = await tx.execute<{ email: string }>(sql`select email from platform_staff where id = ${staff}`);
      expect(rows[0]?.email).toBe(email);
      const parties = await tx.execute<{ id: string }>(sql`select id from console_parties()`);
      expect(parties.map((r) => r.id)).toContain(P);
    });
  });

  it("le journal de la console ne se modifie ni ne s'efface", async () => {
    await expect(
      withConsole((tx) => tx.execute(sql`update platform_audit_log set action = 'x' where staff_id = ${staff}`)),
    ).rejects.toThrow();
    await expect(
      withConsole((tx) => tx.execute(sql`delete from platform_audit_log where staff_id = ${staff}`)),
    ).rejects.toThrow();
  });

  it("refuse un rôle inconnu", async () => {
    await expect(
      withConsole((tx) =>
        tx.execute(sql`insert into platform_staff (email, name, role) values ('x@example.test', 'X', 'god')`),
      ),
    ).rejects.toThrow();
  });
});
