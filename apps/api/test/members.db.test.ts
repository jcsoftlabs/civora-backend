// ADH-01 à ADH-04 : adhésion par code e-mail, fiche membre, statuts, mode d'adhésion. Parcours complet sur Postgres.
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

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const B = randomUUID();
const tag = A.slice(0, 8);
const slugA = `adh-a-${tag}`;
const slugB = `adh-b-${tag}`;
const email = new LogEmailSender();
const keys = new PartyKeys(new LocalKeyProvider([{ id: 1, base64: randomBytes(32).toString("base64") }]));
const auth = new AuthService({ secret: randomBytes(32), email, sms: new LogSmsSender(), keys });
let app: Awaited<ReturnType<typeof buildApp>>;
let ip = 1;
const nextIp = () => `10.2.${Math.floor(ip / 250)}.${ip++ % 250}`;
const addr = (label: string) => `${label}-${tag}@example.test`;

const inject = (method: "GET" | "POST" | "PATCH" | "PUT", url: string, payload?: object, token?: string) =>
  app.inject({
    method,
    url,
    remoteAddress: nextIp(),
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload ? { payload } : {}),
  });
const lastCode = () => /: (\d{6})\n/.exec(email.sent.at(-1)?.text ?? "")?.[1] ?? "";

async function start(label: string, slug = slugA) {
  const res = await inject("POST", "/join/start", { partySlug: slug, email: addr(label) });
  expect(res.statusCode).toBe(202);
  return { challengeId: res.json().challengeId as string, code: lastCode() };
}
const profile = (extra: object = {}) => ({ firstName: "Marie", lastName: "Joseph", zoneCode: "HT0114-01", ...extra });
async function join(label: string, extra: object = {}, slug = slugA) {
  const { challengeId, code } = await start(label, slug);
  return inject("POST", "/join/complete", { partySlug: slug, challengeId, code, ...profile(extra) });
}

/** Responsable avec session prête (2FA considérée validée). */
async function admin(permissions: string[], scope: string | null) {
  const user = (
    await owner`insert into users (email) values (${addr("admin" + randomUUID().slice(0, 4))}) returning id`
  )[0]!.id;
  const zone = (await owner`select id from zones where code = 'HT0114'`)[0]!.id;
  const member = (
    await owner`insert into members (party_id, user_id, member_number, first_name, last_name, zone_id, application_state)
    values (${A}, ${user}, ${"ADM-" + randomUUID().slice(0, 8)}, 'Admin', 'Test', ${zone}, 'approved') returning id`
  )[0]!.id;
  const scopeId = scope ? (await owner`select id from zones where code = ${scope}`)[0]!.id : null;
  const organ = (
    await owner`insert into organs (party_id, name, kind) values (${A}, 'Bureau', 'bureau') returning id`
  )[0]!.id;
  const post = (
    await owner`insert into posts (party_id, organ_id, title, permissions, scope_zone_id)
    values (${A}, ${organ}, 'Poste', ${permissions}, ${scopeId}) returning id`
  )[0]!.id;
  await owner`insert into post_holders (party_id, post_id, member_id, starts_at) values (${A}, ${post}, ${member}, now() - interval '1 hour')`;
  const token = randomBytes(32).toString("base64url");
  await owner`insert into sessions (party_id, user_id, member_id, token_hash, expires_at)
    values (${A}, ${user}, ${member}, ${hashToken(token)}, now() + interval '1 day')`;
  return token;
}

let president = "";
let pvCoordinator = "";
let nordCoordinator = "";

beforeAll(async () => {
  await owner`insert into parties (id, slug, name) values (${A}, ${slugA}, 'Parti A'), (${B}, ${slugB}, 'Parti B')`;
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), { auth, keys });
  await app.ready();
  president = await admin([...PERMISSIONS], null);
  pvCoordinator = await admin(["members.read", "members.write"], "HT0114");
  nordCoordinator = await admin(["members.read", "identity.read"], "HT03");
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  const userIds = (await owner`select user_id from members where party_id in (${A}, ${B}) and user_id is not null`).map(
    (r) => r.user_id,
  );
  for (const t of [
    "audit_log",
    "sessions",
    "otp_challenges",
    "referrals",
    "member_identities",
    "post_holders",
    "posts",
    "organs",
    "members",
    "member_statuses",
    "party_keys",
  ]) {
    await owner.unsafe(`delete from ${t} where party_id in ($1, $2)`, [A, B]);
  }
  await owner`delete from parties where id in (${A}, ${B})`;
  await owner`delete from users where email like ${"%-" + tag + "@example.test"} or id in ${owner(userIds.length ? userIds : [randomUUID()])}`;
  await owner.end();
  await closeDb();
});

describe("adhésion (ADH-01, ADH-04)", () => {
  it("présente l'écran d'adhésion du parti", async () => {
    const res = await inject("GET", `/join/${slugA}`);
    expect(res.json()).toMatchObject({ name: "Parti A", admissionMode: "validation" });
  });

  it("sur validation : la fiche est créée en attente, avec un numéro, et la session s'ouvre", async () => {
    const res = await join("marie", { identity: { kind: "nif", value: "003-111-222-3" }, phone: "+50937001122" });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ applicationState: "pending" });
    expect(body.memberNumber).toMatch(/^\d{6}$/);
    const me = (await inject("GET", "/members/me", undefined, body.token)).json();
    expect(me).toMatchObject({
      firstName: "Marie",
      applicationState: "pending",
      isDiaspora: false,
      residenceCountry: "HT",
    });
    expect(me.location.map((z: { code: string }) => z.code)).toEqual(["HT", "HT01", "HT0114", "HT0114-01"]);
    expect(me.identities).toEqual([{ id: expect.any(String), kind: "nif" }]);
    expect(JSON.stringify(me)).not.toContain("0031112223");
  });

  it("le code d'adhésion est en créole si la personne l'a choisi", async () => {
    await inject("POST", "/join/start", { partySlug: slugA, email: addr("kreyol"), locale: "ht" });
    expect(email.sent.at(-1)?.subject).toContain("vin manm");
  });

  it("refuse une zone trop large, et le code reste valable pour corriger", async () => {
    const { challengeId, code } = await start("jean");
    const bad = await inject("POST", "/join/complete", {
      partySlug: slugA,
      challengeId,
      code,
      ...profile({ zoneCode: "HT0114" }),
    });
    expect(bad.json()).toMatchObject({ code: "zone_too_broad" });
    const ok = await inject("POST", "/join/complete", { partySlug: slugA, challengeId, code, ...profile() });
    expect(ok.statusCode).toBe(201);
  });

  it("localise la diaspora et en déduit le pays de résidence", async () => {
    const res = await join("miami", { zoneCode: "DIA-US-MIA" });
    const me = (await inject("GET", "/members/me", undefined, res.json().token)).json();
    expect(me).toMatchObject({ isDiaspora: true, residenceCountry: "US" });
  });

  it("refuse un numéro de pièce déjà enregistré dans le parti, sans dire à qui il appartient", async () => {
    const res = await join("doublon", { identity: { kind: "nif", value: "0031112223" } });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ code: "identity_duplicate", requestId: expect.any(String) });
  });

  it("refuse une deuxième adhésion avec la même adresse", async () => {
    expect((await join("marie")).json()).toMatchObject({ code: "already_member" });
  });

  it("refuse l'adhésion à un second parti", async () => {
    expect((await join("marie", {}, slugB)).json()).toMatchObject({ code: "already_member_elsewhere" });
  });

  it("refuse un mauvais code, et un code de connexion ne sert pas à adhérer", async () => {
    const { challengeId } = await start("pierre");
    expect(
      (await inject("POST", "/join/complete", { partySlug: slugA, challengeId, code: "000000", ...profile() }))
        .statusCode,
    ).toBe(401);
    const login = (
      await inject("POST", "/auth/otp/request", { partySlug: slugA, channel: "email", destination: addr("marie") })
    ).json();
    const res = await inject("POST", "/join/complete", {
      partySlug: slugA,
      challengeId: login.challengeId,
      code: lastCode(),
      ...profile(),
    });
    expect(res.statusCode).toBe(401);
  });

  it("attribue des numéros uniques sous adhésions simultanées", async () => {
    const results = await Promise.all(
      ["s1", "s2", "s3", "s4", "s5"].map(async (l) => (await join(l)).json().memberNumber),
    );
    expect(new Set(results).size).toBe(5);
  });

  it("libre : membre accepté tout de suite (ADH-04, changement audité)", async () => {
    expect((await inject("PUT", "/party/admission", { admissionMode: "libre" }, pvCoordinator)).statusCode).toBe(403);
    expect((await inject("PUT", "/party/admission", { admissionMode: "libre" }, president)).statusCode).toBe(204);
    const res = await join("libre");
    expect(res.json()).toMatchObject({ applicationState: "approved" });
    const [log] = await owner`select metadata from audit_log where party_id = ${A} and action = 'settings.admission'`;
    expect(log?.metadata).toEqual({ before: "validation", after: "libre" });
  });

  it("parrainage : un parrain membre est exigé et le parrainage est enregistré", async () => {
    await inject("PUT", "/party/admission", { admissionMode: "parrainage" }, president);
    expect((await join("sansparrain")).json()).toMatchObject({ code: "sponsor_required" });
    const [sponsor] =
      await owner`select member_number from members where party_id = ${A} and application_state = 'approved' and first_name = 'Marie' limit 1`;
    expect((await join("faux", { sponsorMemberNumber: "123456789" })).json()).toMatchObject({
      code: "sponsor_not_found",
    });
    const res = await join("filleul", { sponsorMemberNumber: sponsor!.member_number });
    expect(res.json()).toMatchObject({ applicationState: "pending" });
    const [ref] = await owner`select count(*)::int as n from referrals where party_id = ${A}`;
    expect(ref?.n).toBe(1);
  });
});

describe("fiche membre et statuts (ADH-02, ADH-03)", () => {
  let marieId = "";
  let marieToken = "";
  let statusId = "";

  beforeAll(async () => {
    const { challengeId } = (
      await inject("POST", "/auth/otp/request", { partySlug: slugA, channel: "email", destination: addr("marie") })
    ).json();
    marieToken = (await inject("POST", "/auth/otp/verify", { partySlug: slugA, challengeId, code: lastCode() })).json()
      .token;
    marieId = (await inject("GET", "/members/me", undefined, marieToken)).json().id;
  });

  it("le membre met à jour sa fiche et change de section", async () => {
    expect(
      (await inject("PATCH", "/members/me", { zoneCode: "HT0114-02", phone: "+50937009999" }, marieToken)).statusCode,
    ).toBe(204);
    const me = (await inject("GET", "/members/me", undefined, marieToken)).json();
    expect(me.location.at(-1).code).toBe("HT0114-02");
    expect(me.phone).toBe("+50937009999");
  });

  it("seul un responsable national crée les statuts, en français et en créole", async () => {
    expect(
      (await inject("POST", "/member-statuses", { label: { fr: "Militant" }, rank: 1 }, pvCoordinator)).statusCode,
    ).toBe(403);
    const res = await inject(
      "POST",
      "/member-statuses",
      { label: { fr: "Militant", ht: "Militan" }, rank: 1 },
      president,
    );
    expect(res.statusCode).toBe(201);
    statusId = res.json().id;
    const list = (await inject("GET", "/member-statuses", undefined, marieToken)).json().statuses;
    expect(list).toContainEqual({ id: statusId, label: { fr: "Militant", ht: "Militan" }, rank: 1 });
  });

  it("un responsable de la zone attribue un statut ; hors de sa zone, il ne voit pas la fiche (SEC-05)", async () => {
    expect(
      (await inject("PATCH", `/members/${marieId}`, { statusId, tags: ["jeunesse"] }, pvCoordinator)).statusCode,
    ).toBe(204);
    const fiche = (await inject("GET", `/members/${marieId}`, undefined, pvCoordinator)).json();
    expect(fiche).toMatchObject({ statusLabel: { fr: "Militant", ht: "Militan" }, tags: ["jeunesse"] });
    expect((await inject("GET", `/members/${marieId}`, undefined, nordCoordinator)).statusCode).toBe(403);
  });

  it("la pièce d'identité ne s'affiche en clair qu'avec identity.read dans la zone, et c'est audité", async () => {
    const fiche = (await inject("GET", `/members/${marieId}`, undefined, president)).json();
    const identityId = fiche.identities[0].id;
    expect(
      (await inject("POST", `/members/${marieId}/identities/${identityId}/reveal`, {}, pvCoordinator)).statusCode,
    ).toBe(403);
    expect(
      (await inject("POST", `/members/${marieId}/identities/${identityId}/reveal`, {}, nordCoordinator)).statusCode,
    ).toBe(403);
    const ok = await inject("POST", `/members/${marieId}/identities/${identityId}/reveal`, {}, president);
    expect(ok.json()).toEqual({ kind: "nif", value: "0031112223" });
    const [n] =
      await owner`select count(*)::int as n from audit_log where party_id = ${A} and action = 'identity.read'`;
    expect(n?.n).toBe(1);
  });
});
