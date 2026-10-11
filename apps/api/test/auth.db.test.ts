// SEC-04, SEC-09 : connexion par code, sessions révocables, double authentification des administrateurs,
// limitation du débit, absence d'énumération des comptes. Parcours complet sur un vrai Postgres.
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LocalKeyProvider } from "../src/lib/crypto.js";
import { LogEmailSender } from "../src/lib/messaging/email.js";
import { LogSmsSender } from "../src/lib/messaging/sms.js";
import { PartyKeys } from "../src/lib/party-keys.js";
import { base32Encode, currentStep, totpAt } from "../src/lib/totp.js";
import { AuthService, OTP_MAX_ATTEMPTS, hashToken } from "../src/modules/auth/service.js";
import { requireFeature } from "../src/plugins/tenant.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const B = randomUUID();
const tag = A.slice(0, 8);
const slugA = `auth-a-${tag}`;
const slugB = `auth-b-${tag}`;
const memberEmail = `membre-${tag}@example.test`;
const adminEmail = `admin-${tag}@example.test`;
const fx = { zone: "", memberUser: "", adminUser: "", member: "", admin: "", organ: "", post: "" };

let clock = Date.now();
const email = new LogEmailSender();
const sms = new LogSmsSender();
const service = new AuthService({
  secret: randomBytes(32),
  email,
  sms,
  keys: new PartyKeys(new LocalKeyProvider([{ id: 1, base64: randomBytes(32).toString("base64") }])),
  now: () => clock,
});
let app: Awaited<ReturnType<typeof buildApp>>;
let ipCounter = 1;
const freshIp = () => `10.1.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}`;

const post = (url: string, payload: unknown, opts: { token?: string; ip?: string } = {}) =>
  app.inject({
    method: "POST",
    url,
    payload: payload as Record<string, unknown>,
    remoteAddress: opts.ip ?? freshIp(),
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
  });
const get = (url: string, token?: string) =>
  app.inject({ url, remoteAddress: freshIp(), headers: token ? { authorization: `Bearer ${token}` } : {} });

const lastCode = () => /(\d{6})/.exec(email.sent.at(-1)?.text ?? "")?.[1] ?? "";

async function login(addr: string, slug = slugA) {
  const before = email.sent.length;
  const { challengeId } = (
    await post("/auth/otp/request", { partySlug: slug, channel: "email", destination: addr })
  ).json();
  expect(email.sent.length).toBe(before + 1);
  const res = await post("/auth/otp/verify", { partySlug: slug, challengeId, code: lastCode() });
  expect(res.statusCode).toBe(200);
  return res.json() as { token: string; mfa: string };
}

beforeAll(async () => {
  fx.zone = (
    await owner`insert into zones (level, code, name, path) values ('pays', ${"z" + tag}, 'z', ${"t" + tag})
    returning id`
  )[0]!.id;
  for (const [id, slug] of [
    [A, slugA],
    [B, slugB],
  ]) {
    await owner`insert into parties (id, slug, name) values (${id!}, ${slug!}, ${"Parti " + slug})`;
  }
  fx.memberUser = (
    await owner`insert into users (email, phone_e164, locale)
    values (${memberEmail}, ${"+5093" + tag.replace(/\D/g, "").padEnd(7, "1").slice(0, 7)}, 'ht') returning id`
  )[0]!.id;
  fx.adminUser = (await owner`insert into users (email) values (${adminEmail}) returning id`)[0]!.id;
  const member = async (userId: string, n: string) =>
    (
      await owner`insert into members (party_id, user_id, member_number, first_name, last_name, zone_id, application_state)
      values (${A}, ${userId}, ${n}, 'Prénom', 'Nom', ${fx.zone}, 'approved') returning id`
    )[0]!.id;
  fx.member = await member(fx.memberUser, "M1");
  fx.admin = await member(fx.adminUser, "M2");
  fx.organ = (
    await owner`insert into organs (party_id, name, kind) values (${A}, 'Bureau national', 'national')
    returning id`
  )[0]!.id;
  fx.post = (
    await owner`insert into posts (party_id, organ_id, title, permissions)
    values (${A}, ${fx.organ}, 'Secrétaire général', ${["members.read", "members.approve"]}) returning id`
  )[0]!.id;
  await owner`insert into post_holders (party_id, post_id, member_id, starts_at)
    values (${A}, ${fx.post}, ${fx.admin}, now() - interval '1 day')`;

  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), { auth: service });
  app.get("/zone-admin", { preHandler: requireFeature("votes.internal") }, async (req) => ({ grants: req.grants }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
  for (const t of [
    "sessions",
    "otp_challenges",
    "member_mfa",
    "post_holders",
    "posts",
    "organs",
    "members",
    "party_keys",
  ]) {
    await owner.unsafe(`delete from ${t} where party_id in ($1, $2)`, [A, B]);
  }
  await owner`delete from parties where id in (${A}, ${B})`;
  await owner`delete from users where id in (${fx.memberUser}, ${fx.adminUser})`;
  await owner`delete from zones where id = ${fx.zone}`;
  await owner.end();
  await closeDb();
});

describe("connexion par e-mail", () => {
  it("envoie un code au membre, dans sa langue, et ouvre une session", async () => {
    const { token, mfa } = await login(memberEmail);
    expect(email.sent.at(-1)?.to).toBe(memberEmail);
    expect(email.sent.at(-1)?.subject).toContain("Kòd koneksyon"); // locale ht
    expect(mfa).toBe("none");
    const me = await get("/auth/me", token);
    expect(me.json()).toMatchObject({ partyId: A, memberId: fx.member, mfaPending: false, permissions: [] });
  });

  it("répond de la même façon pour une adresse inconnue, sans rien envoyer", async () => {
    const before = email.sent.length;
    const res = await post("/auth/otp/request", {
      partySlug: slugA,
      channel: "email",
      destination: "inconnu@example.test",
    });
    expect(res.statusCode).toBe(202);
    expect(Object.keys(res.json())).toEqual(["challengeId"]);
    expect(email.sent.length).toBe(before);
    const unknownParty = await post("/auth/otp/request", {
      partySlug: "nexiste-pas",
      channel: "email",
      destination: memberEmail,
    });
    expect(unknownParty.statusCode).toBe(202);
  });

  it("n'ouvre pas de session avec un membre d'un autre parti", async () => {
    const before = email.sent.length;
    await post("/auth/otp/request", { partySlug: slugB, channel: "email", destination: memberEmail });
    expect(email.sent.length).toBe(before);
  });

  it("ne stocke que l'empreinte du jeton et du code", async () => {
    const { token } = await login(memberEmail);
    const rows = await owner`select token_hash from sessions where party_id = ${A}`;
    expect(rows.some((r) => r.token_hash === hashToken(token))).toBe(true);
    expect(rows.some((r) => r.token_hash === token)).toBe(false);
    const codes = await owner`select code_hash from otp_challenges where party_id = ${A}`;
    expect(codes.every((c) => !/^\d{6}$/.test(c.code_hash))).toBe(true);
  });
});

describe("codes", () => {
  const request = async () =>
    (await post("/auth/otp/request", { partySlug: slugA, channel: "email", destination: memberEmail })).json()
      .challengeId as string;

  it("refuse un mauvais code, puis bloque le défi après 5 essais", async () => {
    const challengeId = await request();
    const good = lastCode();
    const bad = good === "000000" ? "111111" : "000000";
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      expect((await post("/auth/otp/verify", { partySlug: slugA, challengeId, code: bad })).statusCode).toBe(401);
    }
    const res = await post("/auth/otp/verify", { partySlug: slugA, challengeId, code: good });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: "otp_invalid" });
  });

  it("un code ne sert qu'une fois", async () => {
    const challengeId = await request();
    const code = lastCode();
    expect((await post("/auth/otp/verify", { partySlug: slugA, challengeId, code })).statusCode).toBe(200);
    expect((await post("/auth/otp/verify", { partySlug: slugA, challengeId, code })).statusCode).toBe(401);
  });

  it("un code expire après 10 minutes", async () => {
    const challengeId = await request();
    const code = lastCode();
    clock += 11 * 60_000;
    expect((await post("/auth/otp/verify", { partySlug: slugA, challengeId, code })).statusCode).toBe(401);
  });

  it("un défi du parti A ne vaut rien dans le parti B", async () => {
    const challengeId = await request();
    expect((await post("/auth/otp/verify", { partySlug: slugB, challengeId, code: lastCode() })).statusCode).toBe(401);
  });

  it("limite les codes envoyés à un même compte", async () => {
    clock += 60 * 60_000; // nouvelle fenêtre
    const before = email.sent.length;
    for (let i = 0; i < 7; i++) await request();
    expect(email.sent.length - before).toBe(5);
  });

  it("limite les demandes par adresse IP (429)", async () => {
    const ip = "10.9.9.9";
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await post(
        "/auth/otp/request",
        { partySlug: slugA, channel: "email", destination: "x@example.test" },
        { ip },
      );
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 5).every((c) => c === 202)).toBe(true);
    expect(codes[5]).toBe(429);
  });

  it("refuse une saisie mal formée sans détail technique", async () => {
    const res = await post("/auth/otp/request", { partySlug: slugA, channel: "email", destination: "pas-un-email" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: "invalid_request" });
  });
});

describe("SMS, au choix du parti", () => {
  it("refuse le SMS tant que le parti ne l'a pas activé", async () => {
    const res = await post("/auth/otp/request", { partySlug: slugA, channel: "sms", destination: "+50937000000" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: "otp_channel_disabled" });
  });

  it("envoie le code par SMS une fois le canal activé par le parti", async () => {
    clock += 60 * 60_000;
    await owner`update parties set otp_channels = ${["email", "sms"]} where id = ${A}`;
    const [u] = await owner`select phone_e164 from users where id = ${fx.memberUser}`;
    const before = sms.sent.length;
    await post("/auth/otp/request", { partySlug: slugA, channel: "sms", destination: u!.phone_e164 });
    expect(sms.sent.length).toBe(before + 1);
    expect(sms.sent.at(-1)?.text).toMatch(/\d{6}/);
  });
});

describe("sessions", () => {
  it("la déconnexion révoque le jeton", async () => {
    clock += 60 * 60_000;
    const { token } = await login(memberEmail);
    expect((await post("/auth/logout", {}, { token })).statusCode).toBe(204);
    expect((await get("/auth/me", token)).statusCode).toBe(401);
  });

  it("« déconnecter partout » révoque toutes les sessions du membre", async () => {
    clock += 60 * 60_000;
    const first = await login(memberEmail);
    const second = await login(memberEmail);
    expect((await post("/auth/sessions/revoke-all", {}, { token: second.token })).statusCode).toBe(200);
    expect((await get("/auth/me", first.token)).statusCode).toBe(401);
  });

  it("refuse un jeton inventé", async () => {
    expect((await get("/auth/me", randomBytes(32).toString("base64url"))).statusCode).toBe(401);
    expect((await get("/auth/me", "' or 1=1 --")).statusCode).toBe(401);
  });
});

describe("double authentification des administrateurs", () => {
  let token = "";
  let secret: Buffer = Buffer.alloc(0);

  it("un administrateur doit s'inscrire à la 2FA ; ses droits restent inactifs en attendant", async () => {
    clock = Date.now();
    const res = await login(adminEmail);
    token = res.token;
    expect(res.mfa).toBe("setup_required");
    expect((await get("/auth/me", token)).json()).toMatchObject({ mfaPending: true, permissions: [] });
    expect((await get("/zone-admin", token)).json()).toMatchObject({ code: "mfa_required" });
  });

  it("valide la 2FA avec l'application d'authentification et active les droits", async () => {
    const setup = await post("/auth/mfa/setup", {}, { token });
    const uri = new URL(setup.json().otpauthUri as string);
    expect(uri.protocol).toBe("otpauth:");
    const b32 = uri.searchParams.get("secret") ?? "";
    secret = base32Decode(b32);
    expect(base32Encode(secret)).toBe(b32);
    const code = totpAt(secret, currentStep(clock));
    expect((await post("/auth/mfa/verify", { code }, { token })).statusCode).toBe(204);
    const me = (await get("/auth/me", token)).json();
    expect(me).toMatchObject({ mfaPending: false });
    expect(me.permissions.sort()).toEqual(["members.approve", "members.read"]);
    expect((await get("/zone-admin", token)).statusCode).toBe(200);
  });

  it("un code TOTP ne sert qu'une fois", async () => {
    const next = await login(adminEmail);
    expect(next.mfa).toBe("required");
    const code = totpAt(secret, currentStep(clock));
    const res = await post("/auth/mfa/verify", { code }, { token: next.token });
    expect(res.statusCode).toBe(401);
    clock += 30_000;
    expect(
      (await post("/auth/mfa/verify", { code: totpAt(secret, currentStep(clock)) }, { token: next.token })).statusCode,
    ).toBe(204);
  });

  it("un code e-mail ne suffit pas pour réinscrire la 2FA d'un administrateur", async () => {
    clock += 60 * 60_000;
    const next = await login(adminEmail);
    expect((await post("/auth/mfa/setup", {}, { token: next.token })).statusCode).toBe(409);
  });

  it("le secret TOTP est chiffré en base", async () => {
    const [row] = await owner`select secret_encrypted from member_mfa where member_id = ${fx.admin}`;
    expect(Buffer.from(row!.secret_encrypted).includes(secret)).toBe(false);
  });
});

function base32Decode(s: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
