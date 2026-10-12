// SOC-09 : assistant de démarrage. Étapes déduites des données du parti, étape passée, assistant masqué,
// réservé à settings.party ; un autre parti ne compte jamais.
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { PERMISSIONS } from "@civora/shared";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LogEmailSender } from "../src/lib/messaging/email.js";
import { hashToken } from "../src/modules/auth/service.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const B = randomUUID();
const tag = A.slice(0, 8);
let app: Awaited<ReturnType<typeof buildApp>>;
const userIds: string[] = [];

async function member(party: string, first: string, number: string) {
  const user = (await owner`insert into users (email) values (${`${first}-${tag}@example.test`}) returning id`)[0]!.id;
  userIds.push(user);
  const id = (
    await owner`insert into members (party_id, user_id, member_number, first_name, last_name, zone_id, application_state)
    values (${party}, ${user}, ${number}, ${first}, 'Test', (select id from zones where code = 'HT0114-01'), 'approved') returning id`
  )[0]!.id as string;
  const token = randomBytes(32).toString("base64url");
  await owner`insert into sessions (party_id, user_id, member_id, token_hash, expires_at)
    values (${party}, ${user}, ${id}, ${hashToken(token)}, now() + interval '1 day')`;
  return { id, token };
}
/** Espace tout juste créé : fondateur n° 000001 président du bureau national. */
async function newSpace(party: string, tier: string) {
  await owner`insert into parties (id, slug, name, tier) values (${party}, ${"onb-" + party.slice(0, 8)}, 'Nouveau parti', ${tier})`;
  const founder = await member(party, `fondateur${party.slice(0, 4)}`, "000001");
  const organ = (
    await owner`insert into organs (party_id, name, kind) values (${party}, 'Bureau national', 'bureau') returning id`
  )[0]!.id;
  const post = (
    await owner`insert into posts (party_id, organ_id, title, permissions) values (${party}, ${organ}, 'Président', ${[...PERMISSIONS]}) returning id`
  )[0]!.id;
  await owner`insert into post_holders (party_id, post_id, member_id, starts_at) values (${party}, ${post}, ${founder.id}, now() - interval '1 hour')`;
  return { founder, organ };
}
const call = (method: "GET" | "PUT", url: string, token: string, payload?: object) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });
const state = async (token: string) => {
  const r = (await call("GET", "/party/onboarding", token)).json();
  return {
    ...r,
    by: Object.fromEntries(
      r.steps.map((s: { key: string; done: boolean; skipped: boolean }) => [s.key, s.skipped ? "skipped" : s.done]),
    ),
  };
};

let a: Awaited<ReturnType<typeof newSpace>>;
let b: Awaited<ReturnType<typeof newSpace>>;

beforeAll(async () => {
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), { email: new LogEmailSender() });
  await app.ready();
  a = await newSpace(A, "essentiel");
  b = await newSpace(B, "national");
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  for (const p of [A, B])
    for (const t of ["audit_log", "dues_plans", "sessions", "post_holders", "posts", "organs", "members"])
      await owner.unsafe(`delete from ${t} where party_id = $1`, [p]);
  await owner`delete from parties where id in (${A}, ${B})`;
  await owner`delete from users where id in ${owner(userIds)}`;
  await owner.end();
  await closeDb();
});

describe("assistant de démarrage (SOC-09)", () => {
  it("un espace neuf : tout reste à faire ; la carte n'apparaît qu'avec la formule qui l'inclut", async () => {
    const s = await state(a.founder.token);
    expect(s.by).toEqual({
      identity: false,
      admission: false,
      dues: false,
      organs: false,
      members: false,
      invite: false,
    });
    expect(s).toMatchObject({ remaining: 6, completed: false, dismissed: false });
    expect(Object.keys((await state(b.founder.token)).by)).toContain("card");
  });

  it("chaque étape se coche toute seule quand la donnée existe", async () => {
    await call("PUT", "/party/admission", a.founder.token, { admissionMode: "libre" });
    await owner`insert into dues_plans (party_id, name, amount, currency, periodicity) values (${A}, ${JSON.stringify({ fr: "Cotisation" })}::text::jsonb, 500, 'HTG', 'monthly')`;
    await owner`insert into organs (party_id, name, kind) values (${A}, 'Section de Pétion-Ville', 'section')`;
    await member(A, "marie", "000002");
    const s = await state(a.founder.token);
    expect(s.by).toMatchObject({ admission: true, dues: true, organs: true, members: true, invite: true });
    expect(s.steps.find((x: { key: string }) => x.key === "dues").detail).toEqual({ plans: 1, merchants: 0 });
    expect(s.remaining).toBe(1);
    // Ce qui se passe dans l'autre parti ne compte pas.
    expect((await state(b.founder.token)).by).toMatchObject({
      admission: false,
      dues: false,
      organs: false,
      members: false,
    });
  });

  it("une étape passée ne compte plus ; l'assistant se termine puis se masque", async () => {
    expect((await call("PUT", "/party/onboarding", a.founder.token, { skip: "identity" })).statusCode).toBe(204);
    expect(await state(a.founder.token)).toMatchObject({ remaining: 0, completed: true });
    expect((await state(a.founder.token)).by.identity).toBe("skipped");
    await call("PUT", "/party/onboarding", a.founder.token, { unskip: "identity" });
    expect((await state(a.founder.token)).by.identity).toBe(false);
    await call("PUT", "/party/onboarding", a.founder.token, { dismiss: true });
    expect((await state(a.founder.token)).dismissed).toBe(true);
    const [audits] =
      await owner`select count(*)::int n from audit_log where party_id = ${A} and action = 'settings.onboarding'`;
    expect(audits!.n).toBe(3);
  });

  it("réservé aux réglages du parti", async () => {
    const marie = await member(A, "simple", "000003");
    expect((await call("GET", "/party/onboarding", marie.token)).statusCode).toBe(403);
    expect((await call("PUT", "/party/onboarding", marie.token, { dismiss: true })).statusCode).toBe(403);
  });
});
