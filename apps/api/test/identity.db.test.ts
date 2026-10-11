// SEC-02, ADH-08 : pièces d'identité chiffrées par parti, doublons, lecture auditée, rotation.
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, withParty } from "@civora/db";
import { LocalKeyProvider } from "../src/lib/crypto.js";
import { PartyKeys } from "../src/lib/party-keys.js";
import { IdentityService, normalizeIdentity, type Reader } from "../src/modules/members/identity.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const provider = new LocalKeyProvider([{ id: 1, base64: randomBytes(32).toString("base64") }]);
const service = new IdentityService(new PartyKeys(provider));

const A = randomUUID();
const B = randomUUID();
const ids = { zoneOuest: "", zonePv: "", zoneNord: "", memberA1: "", memberA2: "", memberB: "" };
const NIF = "003-456-789-0";

const national: Reader = { userId: null, grants: [{ permission: "identity.read", zonePath: null }] };

beforeAll(async () => {
  const tag = randomUUID().slice(0, 8);
  const zone = async (code: string, path: string) =>
    (
      await owner<{ id: string }[]>`insert into zones (level, code, name, path)
      values ('commune', ${code + tag}, ${code}, ${path}) returning id`
    )[0]!.id;
  ids.zoneOuest = await zone("ouest", `t${tag}.ouest`);
  ids.zonePv = await zone("pv", `t${tag}.ouest.petion_ville`);
  ids.zoneNord = await zone("nord", `t${tag}.nord`);
  for (const p of [A, B]) await owner`insert into parties (id, slug, name) values (${p}, ${"test-" + p}, 'Parti test')`;
  const member = async (party: string, n: string, zoneId: string) =>
    (
      await owner<{ id: string }[]>`insert into members (party_id, member_number, first_name, last_name, zone_id)
      values (${party}, ${n}, 'Prénom', 'Nom', ${zoneId}) returning id`
    )[0]!.id;
  ids.memberA1 = await member(A, "A1", ids.zonePv);
  ids.memberA2 = await member(A, "A2", ids.zoneNord);
  ids.memberB = await member(B, "B1", ids.zonePv);
});

afterAll(async () => {
  await owner`set session_replication_role = replica`; // audit_log en ajout seul (SEC-06)
  for (const t of ["audit_log", "member_identities", "members", "party_keys"]) {
    await owner.unsafe(`delete from ${t} where party_id in ($1, $2)`, [A, B]);
  }
  await owner`delete from parties where id in (${A}, ${B})`;
  await owner`delete from zones where id in (${ids.zoneOuest}, ${ids.zonePv}, ${ids.zoneNord})`;
  await owner.end();
  await closeDb();
});

describe("pièces d'identité", () => {
  let identityA1 = "";

  it("normalise les numéros", () => {
    expect(normalizeIdentity("nif", " 003-456-789-0 ")).toBe("0034567890");
    expect(normalizeIdentity("passport", "rd 1234567")).toBe("RD1234567");
    expect(() => normalizeIdentity("nin", "ABC123")).toThrow();
    expect(() => normalizeIdentity("nif", "1")).toThrow();
  });

  it("ne stocke jamais le numéro en clair, ni la clé du parti", async () => {
    identityA1 = (await withParty(A, (tx) => service.store(tx, A, ids.memberA1, "nif", NIF))).id;
    const [row] = await owner`select value_encrypted, value_hmac from member_identities where id = ${identityA1}`;
    expect(Buffer.from(row?.value_encrypted).includes(Buffer.from("0034567890"))).toBe(false);
    expect(row?.value_hmac).not.toContain("0034567890");
    const [key] = await owner`select wrapped_key from party_keys where party_id = ${A}`;
    expect(Buffer.from(key?.wrapped_key).length).toBeGreaterThan(32);
  });

  it("chaque parti a sa propre clé", async () => {
    await withParty(B, (tx) => service.store(tx, B, ids.memberB, "nif", NIF));
    const keys = await owner`select party_id, wrapped_key from party_keys where party_id in (${A}, ${B})`;
    expect(keys.length).toBe(2);
    const [a, b] = await Promise.all(keys.map((k) => provider.unwrap(Buffer.from(k.wrapped_key))));
    expect(a!.equals(b!)).toBe(false);
    // Même numéro, empreintes différentes : un parti ne peut pas tester les numéros d'un autre.
    const hmacs = await owner`select distinct value_hmac from member_identities where party_id in (${A}, ${B})`;
    expect(hmacs.length).toBe(2);
  });

  it("trouve un doublon dans le parti, quelle que soit la saisie, et jamais chez un autre parti", async () => {
    expect(await withParty(A, (tx) => service.findDuplicates(tx, A, "nif", "0034567890"))).toEqual([ids.memberA1]);
    expect(await withParty(A, (tx) => service.findDuplicates(tx, A, "nif", "003 456 789 0"))).toEqual([ids.memberA1]);
    expect(await withParty(A, (tx) => service.findDuplicates(tx, A, "nin", "0034567890"))).toEqual([]);
    expect(await withParty(B, (tx) => service.findDuplicates(tx, B, "nif", NIF))).toEqual([ids.memberB]);
  });

  it("déchiffre pour un lecteur autorisé et écrit une ligne d'audit", async () => {
    const res = await withParty(A, (tx) => service.read(tx, A, { ...national, ip: "127.0.0.1" }, identityA1));
    expect(res).toEqual({ kind: "nif", value: "0034567890" });
    const logs = await owner`select action, target_id, metadata from audit_log where party_id = ${A}`;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "identity.read", target_id: identityA1 });
    expect(JSON.stringify(logs[0]?.metadata)).not.toContain("0034567890");
  });

  it("refuse sans la permission identity.read", async () => {
    const reader: Reader = { userId: null, grants: [{ permission: "members.read", zonePath: null }] };
    await expect(withParty(A, (tx) => service.read(tx, A, reader, identityA1))).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("limite la lecture à la zone du responsable", async () => {
    const tag = (await owner`select path::text from zones where id = ${ids.zoneOuest}`)[0]?.path as string;
    const ouest: Reader = { userId: null, grants: [{ permission: "identity.read", zonePath: tag }] };
    expect((await withParty(A, (tx) => service.read(tx, A, ouest, identityA1))).value).toBe("0034567890");
    const idA2 = (await withParty(A, (tx) => service.store(tx, A, ids.memberA2, "nin", "1234567890"))).id;
    await expect(withParty(A, (tx) => service.read(tx, A, ouest, idA2))).rejects.toMatchObject({ code: "forbidden" });
  });

  it("le parti B ne lit pas une pièce du parti A", async () => {
    await expect(withParty(B, (tx) => service.read(tx, B, national, identityA1))).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("un chiffré recopié sur un autre membre devient illisible", async () => {
    const idA2 = (await owner`select id from member_identities where member_id = ${ids.memberA2}`)[0]?.id as string;
    await owner`update member_identities set value_encrypted = (select value_encrypted from member_identities where id = ${identityA1})
                where id = ${idA2}`;
    await expect(withParty(A, (tx) => service.read(tx, A, national, idA2))).rejects.toThrow();
  });

  it("après rotation, les anciennes pièces restent lisibles et les doublons détectés", async () => {
    const fresh = new IdentityService(new PartyKeys(provider)); // sans cache
    const keys = new PartyKeys(provider);
    const rotated = await withParty(A, (tx) => keys.rotate(tx, A));
    expect(rotated.version).toBe(2);
    expect((await withParty(A, (tx) => fresh.read(tx, A, national, identityA1))).value).toBe("0034567890");
    expect(await withParty(A, (tx) => fresh.findDuplicates(tx, A, "nif", NIF))).toEqual([ids.memberA1]);
    const next = (await withParty(A, (tx) => fresh.store(tx, A, ids.memberA2, "passport", "RD1234567"))).id;
    const [row] = await owner`select key_version from member_identities where id = ${next}`;
    expect(row?.key_version).toBe(2);
  });
});
