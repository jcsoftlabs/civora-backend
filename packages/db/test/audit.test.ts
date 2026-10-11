// SEC-06 : journal d'audit inaltérable. Ajout seul pour tous (déclencheur), chaîne d'empreintes par parti,
// détection d'une ligne modifiée, retirée ou intercalée, numérotation sûre en concurrence.
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, withParty } from "../src/client.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const B = randomUUID();

const write = (party: string, action: string, metadata: object = {}) =>
  withParty(party, (tx) =>
    tx.execute(sql`insert into audit_log (party_id, actor_kind, action, metadata)
                   values (${party}, 'system', ${action}, ${JSON.stringify(metadata)}::jsonb)`),
  );
const verify = async (party: string) => {
  const [r] = await owner`select checked::int, broken_at::int from audit_log_verify(${party})`;
  return { checked: r?.checked as number, brokenAt: (r?.broken_at ?? null) as number | null };
};
/** Contournement des déclencheurs : réservé au super-utilisateur, pour simuler une falsification. */
const tamper = async (statement: string) => {
  await owner`set session_replication_role = replica`;
  await owner.unsafe(statement, [A]);
  await owner`set session_replication_role = origin`;
};

beforeAll(async () => {
  for (const p of [A, B])
    await owner`insert into parties (id, slug, name) values (${p}, ${"audit-" + p}, 'Parti test')`;
});

afterAll(async () => {
  await owner`set session_replication_role = replica`;
  await owner`delete from audit_log where party_id in (${A}, ${B})`;
  await owner`delete from parties where id in (${A}, ${B})`;
  await owner.end();
  await closeDb();
});

describe("journal d'audit", () => {
  it("numérote et chaîne les entrées, par parti", async () => {
    for (const a of ["export.members", "identity.read", "role.change"]) await write(A, a);
    await write(B, "export.members");
    const rows = await owner`select seq::int, prev_hash, hash from audit_log where party_id = ${A} order by seq`;
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(rows[0]?.prev_hash).toBe("");
    expect(rows[1]?.prev_hash).toBe(rows[0]?.hash);
    expect(rows[2]?.prev_hash).toBe(rows[1]?.hash);
    expect((await owner`select seq::int from audit_log where party_id = ${B}`)[0]?.seq).toBe(1);
    expect(await verify(A)).toEqual({ checked: 3, brokenAt: null });
  });

  it("ignore un numéro ou une empreinte fournis par l'appelant", async () => {
    await withParty(A, (tx) =>
      tx.execute(sql`insert into audit_log (party_id, actor_kind, action, seq, hash, prev_hash)
                     values (${A}, 'system', 'forge', 999, 'faux', 'faux')`),
    );
    const [last] = await owner`select seq::int, hash from audit_log where party_id = ${A} order by seq desc limit 1`;
    expect(last?.seq).toBe(4);
    expect(last?.hash).not.toBe("faux");
    expect((await verify(A)).brokenAt).toBeNull();
  });

  it("refuse modification, suppression et vidage, même au propriétaire de la table", async () => {
    await expect(owner`update audit_log set action = 'rien' where party_id = ${A}`).rejects.toThrow(/ajout seul/);
    await expect(owner`delete from audit_log where party_id = ${A}`).rejects.toThrow(/ajout seul/);
    await expect(owner`truncate audit_log`).rejects.toThrow(/ajout seul/);
  });

  it("numérote sans trou ni doublon sous écritures simultanées", async () => {
    await Promise.all(Array.from({ length: 20 }, (_, i) => write(B, "concurrent", { i })));
    const seqs = (await owner`select seq::int from audit_log where party_id = ${B} order by seq`).map((r) => r.seq);
    expect(seqs).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    expect((await verify(B)).brokenAt).toBeNull();
  });

  it("détecte une entrée modifiée", async () => {
    await tamper(`update audit_log set action = 'rien de grave' where party_id = $1 and seq = 2`);
    expect((await verify(A)).brokenAt).toBe(2);
  });

  it("détecte une entrée supprimée", async () => {
    await tamper(`update audit_log set action = 'identity.read' where party_id = $1 and seq = 2`);
    expect((await verify(A)).brokenAt).toBeNull(); // contenu d'origine rétabli : chaîne de nouveau intacte
    await tamper(`delete from audit_log where party_id = $1 and seq = 3`);
    expect((await verify(A)).brokenAt).toBe(4);
  });

  it("la falsification d'un parti ne touche pas la chaîne d'un autre", async () => {
    expect((await verify(B)).brokenAt).toBeNull();
  });
});
