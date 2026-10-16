// NFR-01 : synchronisation des opérations faites hors ligne. Un même lot rejoué deux fois n'a qu'un effet, l'ordre
// d'arrivée ne change rien, un UUID ne sert qu'à son membre, et un parti ne voit jamais les opérations d'un autre.
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

async function member(party: string, first: string) {
  const user = (await owner`insert into users (email) values (${`${first}-${tag}@example.test`}) returning id`)[0]!.id;
  userIds.push(user);
  const zone = (await owner`select id from zones where code = 'HT0114-01'`)[0]!.id;
  const id = (
    await owner`insert into members (party_id, user_id, member_number, first_name, last_name, zone_id, application_state)
    values (${party}, ${user}, ${String(Math.floor(Math.random() * 1e9))}, ${first}, 'Test', ${zone}, 'approved') returning id`
  )[0]!.id as string;
  const token = randomBytes(32).toString("base64url");
  await owner`insert into sessions (party_id, user_id, member_id, token_hash, expires_at)
    values (${party}, ${user}, ${id}, ${hashToken(token)}, now() + interval '1 day')`;
  return { id, token };
}

const call = (method: "GET" | "POST" | "PATCH", url: string, token: string, payload?: object) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });
const sync = (token: string, operations: object[]) =>
  call("POST", "/sync", token, { deviceId: "iphone-essai-1", operations });

let national: Awaited<ReturnType<typeof member>>;
let marie: Awaited<ReturnType<typeof member>>;
let paul: Awaited<ReturnType<typeof member>>;
let other: Awaited<ReturnType<typeof member>>;
let courseId = "";
let chapters: string[] = [];

beforeAll(async () => {
  await owner`insert into parties (id, slug, name, tier) values (${A}, ${"sync-a-" + tag}, 'Parti Sync', 'national'),
    (${B}, ${"sync-b-" + tag}, 'Autre parti', 'national')`;
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), { email: new LogEmailSender() });
  await app.ready();
  national = await member(A, "national");
  const organ = (
    await owner`insert into organs (party_id, name, kind) values (${A}, 'Bureau', 'bureau') returning id`
  )[0]!.id;
  const post = (
    await owner`insert into posts (party_id, organ_id, title, permissions) values (${A}, ${organ}, 'Président', ${[...PERMISSIONS]}) returning id`
  )[0]!.id;
  await owner`insert into post_holders (party_id, post_id, member_id, starts_at) values (${A}, ${post}, ${national.id}, now() - interval '1 hour')`;
  marie = await member(A, "marie");
  paul = await member(A, "paul");
  other = await member(B, "autre");

  courseId = (await call("POST", "/courses", national.token, { title: { fr: "Bases" } })).json().id;
  const mod = (
    await call("POST", `/courses/${courseId}/modules`, national.token, { title: { fr: "Bienvenue" } })
  ).json().id;
  chapters = [];
  for (const title of ["Notre histoire", "Nos valeurs"]) {
    chapters.push(
      (
        await call("POST", `/modules/${mod}/chapters`, national.token, {
          kind: "text",
          title: { fr: title },
          body: { fr: "Texte." },
        })
      ).json().id,
    );
  }
  expect((await call("PATCH", `/courses/${courseId}`, national.token, { published: true })).statusCode).toBe(204);
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  for (const p of [A, B]) {
    for (const t of [
      "sync_operations",
      "audit_log",
      "course_completions",
      "lesson_attempts",
      "lessons",
      "course_modules",
      "courses",
      "sessions",
      "post_holders",
      "posts",
      "organs",
      "members",
    ]) {
      await owner.unsafe(`delete from ${t} where party_id = $1`, [p]);
    }
    await owner`delete from parties where id = ${p}`;
  }
  await owner`delete from users where id in ${owner(userIds)}`;
  await owner.end();
  await closeDb();
});

const views = async (memberId: string) =>
  Number(
    (await owner`select count(*) as n from lesson_attempts where party_id = ${A} and member_id = ${memberId}`)[0]!.n,
  );

describe("synchronisation hors ligne (NFR-01)", () => {
  it("applique les opérations du téléphone ; le même lot rejoué n'a pas de second effet", async () => {
    const ops = [
      {
        id: randomUUID(),
        kind: "training.chapter.view",
        payload: { chapterId: chapters[1] },
        createdAt: "2026-10-15T14:02:00Z",
      },
      {
        id: randomUUID(),
        kind: "training.chapter.view",
        payload: { chapterId: chapters[0] },
        createdAt: "2026-10-15T14:00:00Z",
      },
    ];
    const first = await sync(marie.token, ops);
    expect(first.statusCode).toBe(200);
    // Appliquées dans l'ordre d'origine : le dernier chapitre vu complète la formation.
    const results = first.json().results;
    expect(results.map((r: { id: string }) => r.id)).toEqual([ops[1]!.id, ops[0]!.id]);
    expect(results.every((r: { status: string }) => r.status === "applied")).toBe(true);
    expect(results[1].result).toMatchObject({ viewed: true, modulePassed: true });
    expect(await views(marie.id)).toBe(2);

    // Coupure après l'envoi : le téléphone renvoie le même lot, dans un autre ordre.
    const again = await sync(marie.token, [ops[0]!, ops[1]!]);
    expect(again.json().results).toEqual(results);
    expect(await views(marie.id)).toBe(2);
    const course = (await call("GET", `/training/${courseId}`, marie.token)).json();
    expect(course.completion.number).toMatch(/^\d{4}-\d{6}$/);
  });

  it("refuse une opération inconnue ou mal formée sans bloquer les autres", async () => {
    const good = {
      id: randomUUID(),
      kind: "training.chapter.view",
      payload: { chapterId: chapters[0] },
      createdAt: new Date(),
    };
    const res = await sync(paul.token, [
      { id: randomUUID(), kind: "presence.unknown", payload: {}, createdAt: new Date() },
      { id: randomUUID(), kind: "training.chapter.view", payload: { chapterId: "pas-un-uuid" }, createdAt: new Date() },
      { id: randomUUID(), kind: "training.chapter.view", payload: { chapterId: randomUUID() }, createdAt: new Date() },
      good,
    ]);
    const byId = Object.fromEntries(res.json().results.map((r: { id: string }) => [r.id, r]));
    expect(byId[good.id]).toMatchObject({ status: "applied" });
    expect(Object.values(byId).filter((r) => (r as { status: string }).status === "rejected")).toHaveLength(3);
    expect(
      Object.values(byId)
        .map((r) => (r as { code?: string }).code)
        .sort(),
    ).toEqual(["invalid_operation", "invalid_operation", "not_found", undefined]);
  });

  it("un UUID n'ouvre rien à un autre membre, et un autre parti ne voit pas l'opération", async () => {
    const id = randomUUID();
    await sync(marie.token, [
      { id, kind: "training.chapter.view", payload: { chapterId: chapters[0] }, createdAt: new Date() },
    ]);
    const stolen = await sync(paul.token, [
      { id, kind: "training.chapter.view", payload: { chapterId: chapters[0] }, createdAt: new Date() },
    ]);
    expect(stolen.json().results[0]).toEqual({ id, status: "rejected", code: "operation_conflict" });
    // Partie B : même UUID, autre parti. La RLS empêche de lire l'opération de A ; la clé primaire, elle, refuse
    // le doublon : l'opération est rejetée sans rien révéler.
    const cross = await sync(other.token, [
      { id, kind: "training.chapter.view", payload: { chapterId: chapters[0] }, createdAt: new Date() },
    ]);
    expect(cross.statusCode).toBe(200);
    expect(cross.json().results[0]).toEqual({ id, status: "rejected", code: "operation_conflict" });
    const rows = await owner`select party_id from sync_operations where id = ${id}`;
    expect(rows.map((r) => r.party_id)).toEqual([A]);
  });

  it("refuse un lot sans session ou trop gros", async () => {
    expect((await app.inject({ method: "POST", url: "/sync", payload: {} })).statusCode).toBe(401);
    const big = Array.from({ length: 51 }, () => ({
      id: randomUUID(),
      kind: "training.chapter.view",
      payload: { chapterId: chapters[0] },
      createdAt: new Date(),
    }));
    expect((await sync(marie.token, big)).statusCode).toBe(400);
  });
});
