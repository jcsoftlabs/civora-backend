// ENG-01, GAM-01, GAM-09 : code de parrainage attribué à chaque membre validé quand le parti parraine, adhésion
// avec le code du parrain, filleuls, points du parrain à la validation, barème, corrections tracées, formule.
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { PERMISSIONS } from "@civora/shared";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LocalKeyProvider } from "../src/lib/crypto.js";
import { LogEmailSender } from "../src/lib/messaging/email.js";
import { LogSmsSender } from "../src/lib/messaging/sms.js";
import { PartyKeys } from "../src/lib/party-keys.js";
import { AuthService, hashToken } from "../src/modules/auth/service.js";
import { referralCodeFor } from "../src/modules/engagement/points.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const B = randomUUID();
const tag = A.slice(0, 8);
const slugA = `eng-a-${tag}`;
const slugB = `eng-b-${tag}`;
const email = new LogEmailSender();
const keys = new PartyKeys(new LocalKeyProvider([{ id: 1, base64: randomBytes(32).toString("base64") }]));
const auth = new AuthService({ secret: randomBytes(32), email, sms: new LogSmsSender(), keys });
let app: Awaited<ReturnType<typeof buildApp>>;
let ip = 1;
const nextIp = () => `10.4.${Math.floor(ip / 250)}.${ip++ % 250}`;
const addr = (label: string) => `${label}-${tag}@example.test`;
const lastCode = () => /: (\d{6})\n/.exec(email.sent.at(-1)?.text ?? "")?.[1] ?? "";

const inject = (method: "GET" | "POST" | "PUT", url: string, payload?: object, token?: string) =>
  app.inject({
    method,
    url,
    remoteAddress: nextIp(),
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload ? { payload } : {}),
  });

async function admin(party: string, permissions: string[], scope: string | null) {
  const user = (
    await owner`insert into users (email) values (${addr("admin" + randomUUID().slice(0, 4))}) returning id`
  )[0]!.id;
  const zone = (await owner`select id from zones where code = 'HT0114-01'`)[0]!.id;
  const member = (
    await owner`insert into members (party_id, user_id, member_number, first_name, last_name, zone_id, application_state)
    values (${party}, ${user}, ${String(Math.floor(Math.random() * 1e9))}, 'Nadège', 'Paul', ${zone}, 'approved')
    returning id`
  )[0]!.id as string;
  const scopeId = scope ? (await owner`select id from zones where code = ${scope}`)[0]!.id : null;
  const organ = (
    await owner`insert into organs (party_id, name, kind) values (${party}, 'Bureau', 'bureau') returning id`
  )[0]!.id;
  const post = (
    await owner`insert into posts (party_id, organ_id, title, permissions, scope_zone_id)
    values (${party}, ${organ}, 'Poste', ${permissions}, ${scopeId}) returning id`
  )[0]!.id;
  await owner`insert into post_holders (party_id, post_id, member_id, starts_at) values (${party}, ${post}, ${member}, now() - interval '1 hour')`;
  const token = randomBytes(32).toString("base64url");
  await owner`insert into sessions (party_id, user_id, member_id, token_hash, expires_at)
    values (${party}, ${user}, ${member}, ${hashToken(token)}, now() + interval '1 day')`;
  return { token, member };
}

async function join(label: string, extra: object, slug = slugA) {
  const start = await inject("POST", "/join/start", { partySlug: slug, email: addr(label) });
  return inject("POST", "/join/complete", {
    partySlug: slug,
    challengeId: start.json().challengeId,
    code: lastCode(),
    firstName: "Marie",
    lastName: "Joseph",
    zoneCode: "HT0114-01",
    ...extra,
  });
}

let president: Awaited<ReturnType<typeof admin>>;
let coordinator: Awaited<ReturnType<typeof admin>>;
let presidentB: Awaited<ReturnType<typeof admin>>;
let presidentCode = "";
let filleul = "";

beforeAll(async () => {
  await owner`insert into parties (id, slug, name, tier) values (${A}, ${slugA}, 'Parti A', 'national'), (${B}, ${slugB}, 'Parti B', 'essentiel')`;
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), { auth, keys });
  await app.ready();
  president = await admin(A, [...PERMISSIONS], null);
  coordinator = await admin(A, ["members.read"], "HT0114");
  presidentB = await admin(B, [...PERMISSIONS], null);
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  const userIds = (await owner`select user_id from members where party_id in (${A}, ${B}) and user_id is not null`).map(
    (r) => r.user_id,
  );
  for (const t of [
    "audit_log",
    "point_entries",
    "sessions",
    "otp_challenges",
    "referrals",
    "receipts",
    "ledger_entries",
    "payments",
    "dues_subscriptions",
    "dues_obligations",
    "dues_plans",
    "post_holders",
    "posts",
    "organs",
    "members",
    "party_keys",
  ]) {
    await owner.unsafe(`delete from ${t} where party_id in ($1, $2)`, [A, B]);
  }
  await owner`delete from parties where id in (${A}, ${B})`;
  await owner`delete from users where email like ${"%-" + tag + "@example.test"} or id in ${owner(userIds.length ? userIds : [randomUUID()])}`;
  await owner.end();
  await closeDb();
});

describe("code de parrainage (ENG-01)", () => {
  it("forme lisible : quatre lettres du prénom, sans accent, puis quatre signes", () => {
    expect(referralCodeFor("Nadège")).toMatch(/^NADE-[A-Z2-9]{4}$/);
    expect(referralCodeFor("Lô")).toMatch(/^LOXX-[A-Z2-9]{4}$/);
  });

  it("aucun code tant que le parti ne parraine pas", async () => {
    expect((await inject("GET", "/members/me/referrals", undefined, president.token)).json()).toMatchObject({
      enabled: false,
      code: null,
    });
  });

  it("à l'activation, chaque membre validé reçoit son code", async () => {
    const r = await inject("PUT", "/party/engagement", { referralEnabled: true }, president.token);
    expect(r.json().codes).toBeGreaterThanOrEqual(2);
    const me = (await inject("GET", "/members/me/referrals", undefined, president.token)).json();
    expect(me.enabled).toBe(true);
    expect(me.code).toMatch(/^NADE-[A-Z2-9]{4}$/);
    expect(me.shareUrl).toContain(`/rejoindre?parrain=${me.code}`);
    presidentCode = me.code;
    // Le code ne change pas d'une lecture à l'autre.
    expect((await inject("GET", "/members/me/referrals", undefined, president.token)).json().code).toBe(presidentCode);
  });

  it("la personne qui adhère avec le code devient filleule ; le parrain la voit, en attente", async () => {
    expect((await join("faux", { sponsorCode: "ZZZZ-9999" })).json()).toMatchObject({ code: "sponsor_not_found" });
    const res = await join("marie", { sponsorCode: presidentCode.toLowerCase() });
    expect(res.statusCode).toBe(201);
    filleul = (await owner`select id from members where party_id = ${A} and first_name = 'Marie'`)[0]!.id as string;
    const list = (await inject("GET", "/members/me/referrals", undefined, president.token)).json().referrals;
    expect(list).toEqual([{ name: "Marie J.", state: "pending", since: expect.any(String) }]);
  });

  it("à la validation : parrainage validé, points au parrain, code pour le filleul", async () => {
    expect((await inject("POST", `/applications/${filleul}/approve`, {}, president.token)).statusCode).toBe(204);
    const list = (await inject("GET", "/members/me/referrals", undefined, president.token)).json().referrals;
    expect(list[0].state).toBe("validated");
    const points = (await inject("GET", "/members/me/points", undefined, president.token)).json();
    expect(points).toMatchObject({ enabled: true, total: 50, entries: [{ action: "referral", points: 50 }] });
    const [f] = await owner`select referral_code from members where id = ${filleul}`;
    expect(f!.referral_code).toMatch(/^MARI-[A-Z2-9]{4}$/);
  });
});

describe("points (GAM-01, GAM-09)", () => {
  it("barème modifiable par le parti, audité", async () => {
    await inject("PUT", "/party/engagement", { scale: { referral: 80, vote: 5 } }, president.token);
    const s = (await inject("GET", "/party/engagement", undefined, president.token)).json();
    expect(s.scale).toMatchObject({ referral: 80, vote: 5, training: 30 });
    expect((await inject("GET", "/party/engagement", undefined, coordinator.token)).statusCode).toBe(403);
  });

  it("correction manuelle : permission gamification.manage, motif, journal d'audit", async () => {
    const body = { points: -10, note: "Doublon de parrainage" };
    expect((await inject("POST", `/members/${president.member}/points`, body, coordinator.token)).statusCode).toBe(403);
    expect((await inject("POST", `/members/${president.member}/points`, body, president.token)).statusCode).toBe(204);
    const points = (await inject("GET", "/members/me/points", undefined, president.token)).json();
    expect(points.total).toBe(40);
    expect(points.entries[0]).toMatchObject({ action: "manual", points: -10, note: "Doublon de parrainage" });
    const [a] = await owner`select metadata from audit_log where party_id = ${A} and action = 'points.adjust'`;
    expect(a!.metadata).toEqual({ points: -10 });
  });

  it("une cotisation réglée à temps rapporte ses points, une seule fois", async () => {
    const plan = (
      await owner`insert into dues_plans (party_id, name, amount, currency, periodicity)
      values (${A}, ${owner.json({ fr: "Mensuelle" })}, 500, 'HTG', 'monthly') returning id`
    )[0]!.id;
    const ob = (
      await owner`insert into dues_obligations (party_id, plan_id, member_id, period_start, due_date, amount)
      values (${A}, ${plan}, ${filleul}, current_date, current_date + 10, 500) returning id`
    )[0]!.id as string;
    const cash = { memberId: filleul, obligationIds: [ob], amount: "500.00", currency: "HTG", clientRef: randomUUID() };
    expect((await inject("POST", "/payments/cash", cash, president.token)).statusCode).toBe(201);
    // La même saisie renvoyée (réseau coupé) n'est enregistrée qu'une fois, ses points aussi.
    await inject("POST", "/payments/cash", cash, president.token);
    const rows = await owner`select points from point_entries where member_id = ${filleul} and action = 'dues'`;
    expect(rows.map((r) => r.points)).toEqual([20]);
  });

  it("formule Essentiel : pas de points, le parrainage reste possible", async () => {
    await inject("PUT", "/party/engagement", { referralEnabled: true }, presidentB.token);
    expect((await inject("GET", "/members/me/referrals", undefined, presidentB.token)).json().code).toMatch(/^NADE-/);
    expect((await inject("GET", "/members/me/points", undefined, presidentB.token)).json()).toMatchObject({
      enabled: false,
      total: 0,
    });
    const r = await inject(
      "POST",
      `/members/${presidentB.member}/points`,
      { points: 5, note: "Essai" },
      presidentB.token,
    );
    expect(r.statusCode).toBe(402);
  });

  it("un autre parti ne voit pas les points d'un membre", async () => {
    const r = await inject("GET", `/members/${president.member}/points`, undefined, presidentB.token);
    expect(r.statusCode).toBe(402); // Essentiel ; et même en National, la fiche est invisible (RLS)
    await owner`update parties set tier = 'national' where id = ${B}`;
    await app.entitlements.invalidate(B);
    expect((await inject("GET", `/members/${president.member}/points`, undefined, presidentB.token)).statusCode).toBe(
      404,
    );
  });
});
