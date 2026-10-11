// PIL-01 : statistiques par zone, limitées à la portée de la personne, agrégats seulement.
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LogEmailSender } from "../src/lib/messaging/email.js";
import { hashToken } from "../src/modules/auth/service.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const tag = A.slice(0, 8);
let app: Awaited<ReturnType<typeof buildApp>>;
let plan = "";
const zone = async (code: string) => (await owner`select id from zones where code = ${code}`)[0]!.id as string;

async function member(first: string, zoneCode: string, state = "approved") {
  return (
    await owner`insert into members (party_id, member_number, first_name, last_name, zone_id, application_state, joined_at, is_diaspora)
    values (${A}, ${String(Math.floor(Math.random() * 1e9))}, ${first}, 'Test', ${await zone(zoneCode)}, ${state},
            ${state === "approved" ? new Date() : null}, ${zoneCode.startsWith("DIA")}) returning id`
  )[0]!.id as string;
}
async function analyst(permissions: string[], scope: string | null) {
  const user = (
    await owner`insert into users (email) values (${`an-${randomUUID().slice(0, 6)}-${tag}@example.test`}) returning id`
  )[0]!.id;
  const id = (
    await owner`insert into members (party_id, user_id, member_number, first_name, last_name, zone_id, application_state)
    values (${A}, ${user}, ${"AN-" + randomUUID().slice(0, 6)}, 'Analyste', 'Test', ${await zone("DIA-CA-MTL")}, 'pending') returning id`
  )[0]!.id;
  if (permissions.length) {
    const organ = (
      await owner`insert into organs (party_id, name, kind) values (${A}, 'Bureau', 'bureau') returning id`
    )[0]!.id;
    const post = (
      await owner`insert into posts (party_id, organ_id, title, permissions, scope_zone_id)
      values (${A}, ${organ}, 'Analyste', ${permissions}, ${scope ? await zone(scope) : null}) returning id`
    )[0]!.id;
    await owner`insert into post_holders (party_id, post_id, member_id, starts_at) values (${A}, ${post}, ${id}, now() - interval '1 hour')`;
  }
  const token = randomBytes(32).toString("base64url");
  await owner`insert into sessions (party_id, user_id, member_id, token_hash, expires_at) values (${A}, ${user}, ${id}, ${hashToken(token)}, now() + interval '1 day')`;
  return token;
}
const get = (url: string, token: string) => app.inject({ url, headers: { authorization: `Bearer ${token}` } });
interface ZoneRow {
  code: string;
  members: { approved: number; pending: number; diaspora: number };
}
const child = (body: { children: ZoneRow[] }, code: string) => body.children.find((c) => c.code === code)!;

let national = "";
let pvAnalyst = "";
let nobody = "";

beforeAll(async () => {
  await owner`insert into parties (id, slug, name) values (${A}, ${"stats-" + tag}, 'Parti test')`;
  plan = (
    await owner`insert into dues_plans (party_id, name, amount, currency, periodicity, grace_days)
    values (${A}, ${JSON.stringify({ fr: "Annuelle" })}::jsonb, '250.00', 'HTG', 'annual', 15) returning id`
  )[0]!.id;
  // Pétion-Ville : 3 validés (dont 1 en retard, 1 qui a payé), 1 en attente. Nord : 1 validé. Diaspora : 1 validée.
  const late = await member("Late", "HT0114-01");
  const payer = await member("Payer", "HT0114-02");
  await member("Simple", "HT0114-01");
  await member("Attente", "HT0114-01", "pending");
  await member("Nord", "HT0311-01");
  await member("Miami", "DIA-US-MIA");
  await owner`insert into dues_obligations (party_id, member_id, plan_id, period_start, due_date, amount)
    values (${A}, ${late}, ${plan}, '2020-01-01', '2020-01-01', '250.00')`;
  await owner`insert into payments (party_id, member_id, kind, provider, idempotency_key, amount, currency, status, confirmed_at)
    values (${A}, ${payer}, 'dues', 'cash', ${"st:" + randomUUID()}, '250.00', 'HTG', 'succeeded', now())`;
  const event = (
    await owner`insert into events (party_id, kind, title, starts_at, ends_at, qr_secret_ref)
    values (${A}, 'rassemblement', ${JSON.stringify({ fr: "R" })}::jsonb, now() + interval '1 day', now() + interval '2 days', 'x') returning id`
  )[0]!.id;
  await owner`insert into event_registrations (party_id, event_id, member_id) values (${A}, ${event}, ${payer})`;
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), { email: new LogEmailSender() });
  await app.ready();
  national = await analyst(["bi.read"], null);
  pvAnalyst = await analyst(["bi.read"], "HT0114");
  nobody = await analyst([], null);
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  const userIds = (await owner`select user_id from members where party_id = ${A} and user_id is not null`).map(
    (r) => r.user_id,
  );
  for (const t of [
    "sessions",
    "event_registrations",
    "events",
    "payments",
    "dues_obligations",
    "dues_plans",
    "post_holders",
    "posts",
    "organs",
    "members",
  ]) {
    await owner.unsafe(`delete from ${t} where party_id = $1`, [A]);
  }
  await owner`delete from parties where id = ${A}`;
  await owner`delete from users where id in ${owner(userIds)}`;
  await owner.end();
  await closeDb();
});

describe("statistiques par zone (PIL-01)", () => {
  it("le national voit Haïti découpée en départements, avec les totaux", async () => {
    const body = (await get("/stats/zones", national)).json();
    expect(body.zone).toMatchObject({ code: "HT", members: { approved: 4, pending: 1 } });
    expect(body.children).toHaveLength(10);
    expect(child(body, "HT01")).toMatchObject({
      name: "Ouest",
      nameHt: "Lwès",
      members: { approved: 3, pending: 1, newLast30Days: 3 },
      dues: { upToDate: 2, late: 1, collectedLast30Days: { HTG: "250.00" } },
      engagement: { eventRegistrationsLast30Days: 1 },
    });
    expect(child(body, "HT03").members.approved).toBe(1);
    expect(child(body, "HT05").members.approved).toBe(0);
  });

  it("descend d'un niveau, jusqu'aux sections communales", async () => {
    expect(child((await get("/stats/zones?parent=HT01", national)).json(), "HT0114").members.approved).toBe(3);
    const sections = (await get("/stats/zones?parent=HT0114", national)).json();
    expect(child(sections, "HT0114-01").members).toMatchObject({ approved: 2, pending: 1 });
  });

  it("compte la diaspora à part", async () => {
    const body = (await get("/stats/zones?parent=DIA", national)).json();
    expect(child(body, "DIA-US").members).toMatchObject({ approved: 1, diaspora: 1 });
  });

  it("un analyste de commune voit sa commune par défaut, et rien au-dessus ni à côté", async () => {
    const body = (await get("/stats/zones", pvAnalyst)).json();
    expect(body.zone).toMatchObject({ code: "HT0114", members: { approved: 3 } });
    expect((await get("/stats/zones?parent=HT", pvAnalyst)).statusCode).toBe(403);
    expect((await get("/stats/zones?parent=HT03", pvAnalyst)).statusCode).toBe(403);
    expect((await get("/stats/zones", nobody)).statusCode).toBe(403);
  });

  it("ne contient que des agrégats : aucun nom de membre", async () => {
    const raw = (await get("/stats/zones?parent=HT0114", national)).body;
    for (const name of ["Late", "Payer", "Simple", "Attente"]) expect(raw).not.toContain(name);
  });
});
