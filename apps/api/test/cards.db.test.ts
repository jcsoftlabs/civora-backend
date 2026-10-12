// ADH-13 : modèle de carte de membre (settings.party), exemplaire PDF, impression des cartes au format carte et
// en planche A4, dans la zone de la personne, auditée ; un autre parti ne voit rien.
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { PERMISSIONS } from "@civora/shared";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LocalKeyProvider } from "../src/lib/crypto.js";
import { LogEmailSender } from "../src/lib/messaging/email.js";
import { PartyKeys } from "../src/lib/party-keys.js";
import { hashToken } from "../src/modules/auth/service.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const B = randomUUID();
const tag = A.slice(0, 8);
const keys = new PartyKeys(new LocalKeyProvider([{ id: 1, base64: randomBytes(32).toString("base64") }]));
let app: Awaited<ReturnType<typeof buildApp>>;
const userIds: string[] = [];

async function member(party: string, first: string, zoneCode: string) {
  const user = (await owner`insert into users (email) values (${`${first}-${tag}@example.test`}) returning id`)[0]!.id;
  userIds.push(user);
  const id = (
    await owner`insert into members (party_id, user_id, member_number, first_name, last_name, zone_id, application_state)
    values (${party}, ${user}, ${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}, ${first}, 'Test',
      (select id from zones where code = ${zoneCode}), 'approved') returning id`
  )[0]!.id as string;
  const token = randomBytes(32).toString("base64url");
  await owner`insert into sessions (party_id, user_id, member_id, token_hash, expires_at)
    values (${party}, ${user}, ${id}, ${hashToken(token)}, now() + interval '1 day')`;
  return { id, token };
}
async function holdPost(party: string, memberId: string, permissions: string[], scope: string | null) {
  const organ = (
    await owner`insert into organs (party_id, name, kind) values (${party}, 'Bureau', 'bureau') returning id`
  )[0]!.id;
  const post = (
    await owner`insert into posts (party_id, organ_id, title, permissions, scope_zone_id)
    values (${party}, ${organ}, 'Poste', ${permissions}, ${scope ? owner`(select id from zones where code = ${scope})` : null}) returning id`
  )[0]!.id;
  await owner`insert into post_holders (party_id, post_id, member_id, starts_at) values (${party}, ${post}, ${memberId}, now() - interval '1 hour')`;
}
const call = (method: "GET" | "PUT" | "POST", url: string, token: string, payload?: object) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });

let president: Awaited<ReturnType<typeof member>>;
let chef: Awaited<ReturnType<typeof member>>;
let marie: Awaited<ReturnType<typeof member>>;
let luc: Awaited<ReturnType<typeof member>>;
let other: Awaited<ReturnType<typeof member>>;

beforeAll(async () => {
  await owner`insert into parties (id, slug, name, tier) values (${A}, ${"cards-a-" + tag}, 'Parti Carte', 'national'), (${B}, ${"cards-b-" + tag}, 'Autre parti', 'national')`;
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), { email: new LogEmailSender(), keys });
  await app.ready();
  president = await member(A, "president", "HT0114-01");
  await holdPost(A, president.id, [...PERMISSIONS], null);
  chef = await member(A, "chef", "HT0114-01");
  await holdPost(A, chef.id, ["members.read"], "HT0114");
  marie = await member(A, "marie", "HT0114-01");
  luc = await member(A, "luc", "HT0311-01");
  other = await member(B, "autre", "HT0114-01");
  await holdPost(B, other.id, [...PERMISSIONS], null);
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  for (const p of [A, B])
    for (const t of [
      "audit_log",
      "card_templates",
      "sessions",
      "post_holders",
      "posts",
      "organs",
      "members",
      "party_keys",
    ])
      await owner.unsafe(`delete from ${t} where party_id = $1`, [p]);
  await owner`delete from parties where id in (${A}, ${B})`;
  await owner`delete from users where id in ${owner(userIds)}`;
  await owner.end();
  await closeDb();
});

describe("modèle de carte (ADH-13)", () => {
  it("modèle par défaut tant que le parti n'a rien réglé", async () => {
    const r = (await call("GET", "/party/card-template", president.token)).json();
    expect(r.design).toMatchObject({ orientation: "horizontal", pattern: "rosette", qrSide: "front" });
    expect(r.design.fields).toMatchObject({ photo: true, number: true, status: false });
    expect(r.party.name).toBe("Parti Carte");
  });

  it("enregistre un modèle personnalisé, réservé à settings.party, audité", async () => {
    const design = {
      orientation: "vertical",
      background: { kind: "color", color: "#7A2E5C" },
      pattern: "waves",
      fields: { status: true, since: false },
      qrSide: "back",
      back: {
        enabled: true,
        text: { fr: "Unis pour la section.", ht: "Ini pou seksyon an." },
        signatory: { name: "Nadège Pierre-Louis", role: { fr: "Secrétaire générale" } },
      },
    };
    expect((await call("PUT", "/party/card-template", chef.token, { design })).statusCode).toBe(403);
    expect((await call("PUT", "/party/card-template", president.token, { design })).statusCode).toBe(204);
    const r = (await call("GET", "/party/card-template", president.token)).json();
    expect(r.design).toMatchObject({ orientation: "vertical", pattern: "waves", qrSide: "back" });
    expect(r.design.fields).toMatchObject({ status: true, since: false, photo: true });
    // Le membre lit le même modèle pour sa carte numérique.
    const mine = (await call("GET", "/members/me/card-design", marie.token)).json();
    expect(mine.design.orientation).toBe("vertical");
    expect(mine.member).toHaveProperty("photoUrl");
    expect(mine.member).toHaveProperty("status");
    const [a] = await owner`select count(*)::int n from audit_log where party_id = ${A} and action = 'settings.card'`;
    expect(a!.n).toBe(1);
  });

  it("refuse un modèle invalide ou une image qui n'est pas un fichier prêt du parti", async () => {
    expect(
      (await call("PUT", "/party/card-template", president.token, { design: { background: { color: "rouge" } } }))
        .statusCode,
    ).toBe(400);
    const bad = { background: { kind: "image", imageFileId: randomUUID() } };
    expect((await call("PUT", "/party/card-template", president.token, { design: bad })).json()).toMatchObject({
      code: "file_not_ready",
    });
  });

  it("exemplaire PDF du modèle enregistré et du brouillon, au format carte et en planche", async () => {
    for (const f of ["cr80", "a4"]) {
      const r = await call("GET", `/party/card-template/sample?format=${f}`, president.token);
      expect(r.headers["content-type"]).toBe("application/pdf");
      expect(r.rawPayload.subarray(0, 4).toString()).toBe("%PDF");
    }
    const draft = await call("POST", "/party/card-template/sample", president.token, {
      design: { pattern: "none" },
      format: "cr80",
    });
    expect(draft.rawPayload.subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("impression des cartes", () => {
  it("imprime les cartes des membres de sa zone, et refuse hors de sa zone", async () => {
    const ok = await call("POST", "/members/cards/print", chef.token, { memberIds: [marie.id], format: "cr80" });
    expect(ok.statusCode).toBe(200);
    expect(ok.rawPayload.subarray(0, 4).toString()).toBe("%PDF");
    const out = await call("POST", "/members/cards/print", chef.token, { memberIds: [marie.id, luc.id], format: "a4" });
    expect(out.statusCode).toBe(403);
    const all = await call("POST", "/members/cards/print", president.token, {
      memberIds: [marie.id, luc.id],
      format: "a4",
    });
    expect(all.statusCode).toBe(200);
    const rows =
      await owner`select metadata from audit_log where party_id = ${A} and action = 'cards.print' order by created_at`;
    expect(rows.map((r) => r.metadata)).toEqual([
      { count: 1, format: "cr80" },
      { count: 2, format: "a4" },
    ]);
  });

  it("un autre parti n'imprime pas les cartes du parti et ne voit pas son modèle", async () => {
    expect((await call("POST", "/members/cards/print", other.token, { memberIds: [marie.id] })).statusCode).toBe(404);
    expect((await call("GET", "/party/card-template", other.token)).json().design.orientation).toBe("horizontal");
  });
});
