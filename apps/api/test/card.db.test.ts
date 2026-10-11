// ADH-11 : carte de membre avec QR vérifiable. Lien signé avec la clé du parti, aucune donnée personnelle
// dans le QR, vérification publique minimale, invalidation immédiate.
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LocalKeyProvider } from "../src/lib/crypto.js";
import { LogEmailSender } from "../src/lib/messaging/email.js";
import { PartyKeys } from "../src/lib/party-keys.js";
import { hashToken } from "../src/modules/auth/service.js";
import { parseCardToken, signCardToken } from "../src/modules/members/card.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const B = randomUUID();
const tag = A.slice(0, 8);
const keys = new PartyKeys(new LocalKeyProvider([{ id: 1, base64: randomBytes(32).toString("base64") }]));
let app: Awaited<ReturnType<typeof buildApp>>;

async function member(party: string, first: string, state = "approved") {
  const zone = (await owner`select id from zones where code = 'HT0114-01'`)[0]!.id;
  const user = (
    await owner`insert into users (email, phone_e164) values (${`${first}-${randomUUID().slice(0, 6)}-${tag}@example.test`}, ${"+509" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0")})
    returning id`
  )[0]!.id;
  const id = (
    await owner`insert into members (party_id, user_id, member_number, first_name, last_name, zone_id, application_state, joined_at, phone_e164)
    values (${party}, ${user}, ${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}, ${first}, 'Joseph', ${zone}, ${state}, now(), '+50937001122')
    returning id`
  )[0]!.id as string;
  const token = randomBytes(32).toString("base64url");
  await owner`insert into sessions (party_id, user_id, member_id, token_hash, expires_at) values (${party}, ${user}, ${id}, ${hashToken(token)}, now() + interval '1 day')`;
  return { id, token };
}
const get = (url: string, token?: string) =>
  app.inject({ url, headers: token ? { authorization: `Bearer ${token}` } : {} });

let marie: Awaited<ReturnType<typeof member>>;
let cardToken = "";

beforeAll(async () => {
  await owner`insert into parties (id, slug, name, tier) values (${A}, ${"card-a-" + tag}, 'Parti Horizon', 'mouvement'), (${B}, ${"card-b-" + tag}, 'Parti B', 'essentiel')`;
  app = await buildApp(
    loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", WEB_PARTY_ORIGIN: "https://{slug}.civora.app" }),
    { keys, email: new LogEmailSender() },
  );
  await app.ready();
  marie = await member(A, "Marie");
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  const userIds = (await owner`select user_id from members where party_id in (${A}, ${B})`).map((r) => r.user_id);
  for (const t of ["sessions", "dues_obligations", "dues_plans", "members", "party_keys"]) {
    await owner.unsafe(`delete from ${t} where party_id in ($1, $2)`, [A, B]);
  }
  await owner`delete from parties where id in (${A}, ${B})`;
  await owner`delete from users where id in ${owner(userIds)}`;
  await owner.end();
  await closeDb();
});

describe("jeton de carte", () => {
  it("se relit, et toute modification le rend invalide", () => {
    const dek = randomBytes(32);
    const id = randomUUID();
    const t = signCardToken(dek, 3, id);
    expect(t.length).toBeLessThan(50); // QR petit, lisible même par un téléphone d'entrée de gamme
    expect(parseCardToken(t)).toMatchObject({ keyVersion: 3, memberId: id });
    expect(parseCardToken("pas-un-jeton")).toBeNull();
    // Même octets, autre écriture (bits de remplissage du dernier caractère) : refusé.
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const last = alphabet.indexOf(t.at(-1)!);
    const variant = t.slice(0, -1) + alphabet[(last & 0b110000) | ((last + 1) & 0b001111)]!;
    expect(Buffer.from(variant, "base64url").equals(Buffer.from(t, "base64url"))).toBe(true);
    expect(parseCardToken(variant)).toBeNull();
  });
});

describe("carte de membre (ADH-11)", () => {
  it("donne la carte et le lien signé du QR, à l'adresse du parti", async () => {
    const res = (await get("/members/me/card", marie.token)).json();
    expect(res.member).toMatchObject({ name: "Marie Joseph", location: "1re Section Montagne Noire" });
    expect(res.verifyUrl).toMatch(new RegExp(`^https://card-a-${tag}\\.civora\\.app/v/[A-Za-z0-9_-]+$`));
    cardToken = res.verifyUrl.split("/v/")[1];
  });

  it("le scan confirme la carte, avec le strict nécessaire", async () => {
    const res = await get(`/parties/card-a-${tag}/cards/${cardToken}`);
    expect(res.json()).toMatchObject({
      valid: true,
      party: "Parti Horizon",
      member: { name: "Marie Joseph", photoUrl: null },
      duesUpToDate: true,
    });
    expect(res.body).not.toContain("example.test");
    expect(res.body).not.toContain("+509");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("un QR modifié ou présenté à un autre parti ne vaut rien", async () => {
    const tampered = cardToken.slice(0, -2) + (cardToken.endsWith("AA") ? "BB" : "AA");
    expect((await get(`/parties/card-a-${tag}/cards/${tampered}`)).json()).toEqual({ valid: false });
    expect((await get(`/parties/card-b-${tag}/cards/${cardToken}`)).json()).toEqual({ valid: false });
  });

  it("signale des cotisations en retard", async () => {
    const plan = (
      await owner`insert into dues_plans (party_id, name, amount, currency, periodicity, grace_days)
      values (${A}, ${JSON.stringify({ fr: "Annuelle" })}::jsonb, '100', 'HTG', 'annual', 15) returning id`
    )[0]!.id;
    await owner`insert into dues_obligations (party_id, member_id, plan_id, period_start, due_date, amount)
      values (${A}, ${marie.id}, ${plan}, '2020-01-01', '2020-01-01', '100')`;
    expect((await get(`/parties/card-a-${tag}/cards/${cardToken}`)).json()).toMatchObject({
      valid: true,
      duesUpToDate: false,
    });
  });

  it("une adhésion rejetée invalide la carte immédiatement", async () => {
    await owner`update members set application_state = 'rejected' where id = ${marie.id}`;
    expect((await get(`/parties/card-a-${tag}/cards/${cardToken}`)).json()).toEqual({ valid: false });
    await owner`update members set application_state = 'approved' where id = ${marie.id}`;
  });

  it("réservée aux adhésions validées, et aux formules Mouvement et National", async () => {
    const pending = await member(A, "Paul", "pending");
    expect((await get("/members/me/card", pending.token)).json()).toMatchObject({ code: "card_requires_approval" });
    const other = await member(B, "Luc");
    expect((await get("/members/me/card", other.token)).json()).toMatchObject({
      code: "feature_not_in_plan",
      requiredTier: "mouvement",
    });
  });
});
