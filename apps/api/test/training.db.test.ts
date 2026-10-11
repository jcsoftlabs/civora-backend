// FOR-01 à FOR-04 : formations séquentielles, quiz notés sans fuite des réponses, tentatives limitées,
// formation obligatoire par statut, suivi par zone, certificat numéroté. Sur Postgres, avec deux partis.
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { PERMISSIONS } from "@civora/shared";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { hashToken } from "../src/modules/auth/service.js";
import { grade } from "../src/modules/training/service.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const B = randomUUID();
const tag = A.slice(0, 8);
let app: Awaited<ReturnType<typeof buildApp>>;
const userIds: string[] = [];

const zone = async (code: string) => (await owner`select id from zones where code = ${code}`)[0]!.id as string;

async function member(party: string, first: string, zoneCode: string, statusId: string | null = null) {
  const user = (
    await owner`insert into users (email) values (${`${first}-${randomUUID().slice(0, 6)}-${tag}@example.test`}) returning id`
  )[0]!.id;
  userIds.push(user);
  const id = (
    await owner`insert into members (party_id, user_id, member_number, first_name, last_name, zone_id, application_state, status_id)
    values (${party}, ${user}, ${String(Math.floor(Math.random() * 1e9))}, ${first}, 'Test', ${await zone(zoneCode)}, 'approved', ${statusId})
    returning id`
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
    values (${party}, ${organ}, 'Poste', ${permissions}, ${scope ? await zone(scope) : null}) returning id`
  )[0]!.id;
  await owner`insert into post_holders (party_id, post_id, member_id, starts_at) values (${party}, ${post}, ${memberId}, now() - interval '1 hour')`;
}

const call = (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, token: string, payload?: object) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });

let national: Awaited<ReturnType<typeof member>>;
let pvManager: Awaited<ReturnType<typeof member>>;
let marie: Awaited<ReturnType<typeof member>>;
let paul: Awaited<ReturnType<typeof member>>;
let luc: Awaited<ReturnType<typeof member>>;
let other: Awaited<ReturnType<typeof member>>;
let militant = "";
const course: { id: string; intro: string; quiz: string } = { id: "", intro: "", quiz: "" };

const QUIZ = [
  {
    id: "q1",
    question: { fr: "Combien de départements compte Haïti ?", ht: "Konbyen depatman Ayiti genyen ?" },
    choices: [
      { id: "a", text: { fr: "9" } },
      { id: "b", text: { fr: "10" } },
    ],
    correct: ["b"],
  },
  {
    id: "q2",
    question: { fr: "Qui vote au congrès ?" },
    choices: [
      { id: "a", text: { fr: "Les délégués" } },
      { id: "b", text: { fr: "Les membres à jour" } },
      { id: "c", text: { fr: "Personne" } },
    ],
    correct: ["a", "b"],
  },
];

beforeAll(async () => {
  await owner`insert into parties (id, slug, name, tier) values (${A}, ${"for-a-" + tag}, 'Parti Formation', 'national')`;
  await owner`insert into parties (id, slug, name, tier) values (${B}, ${"for-b-" + tag}, 'Autre parti', 'national')`;
  militant = (
    await owner`insert into member_statuses (party_id, label, rank) values (${A}, ${JSON.stringify({ fr: "Militant" })}::text::jsonb, 10) returning id`
  )[0]!.id;
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }));
  await app.ready();
  national = await member(A, "national", "HT0114-01");
  await holdPost(A, national.id, [...PERMISSIONS], null);
  pvManager = await member(A, "chef", "HT0114-01");
  await holdPost(A, pvManager.id, ["training.manage"], "HT0114");
  marie = await member(A, "marie", "HT0114-01", militant);
  paul = await member(A, "paul", "HT0114-02", militant);
  luc = await member(A, "luc", "HT0311-01");
  other = await member(B, "autre", "HT0114-01");
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  for (const p of [A, B]) {
    for (const t of [
      "audit_log",
      "course_completions",
      "lesson_attempts",
      "lessons",
      "courses",
      "sessions",
      "post_holders",
      "posts",
      "organs",
      "members",
      "member_statuses",
    ]) {
      await owner.unsafe(`delete from ${t} where party_id = $1`, [p]);
    }
    await owner`delete from parties where id = ${p}`;
  }
  await owner`delete from users where id in ${owner(userIds)}`;
  await owner.end();
  await closeDb();
});

describe("note d'un quiz", () => {
  it("une question n'est juste que si tous les bons choix, et eux seuls, sont cochés", () => {
    expect(grade(QUIZ, { q1: ["b"], q2: ["a", "b"] })).toEqual({ scorePercent: 100, wrongQuestionIds: [] });
    expect(grade(QUIZ, { q1: ["b"], q2: ["a"] })).toEqual({ scorePercent: 50, wrongQuestionIds: ["q2"] });
    expect(grade(QUIZ, { q1: ["a", "b"] }).wrongQuestionIds).toEqual(["q1", "q2"]);
  });
});

describe("formations (FOR-01 à FOR-04)", () => {
  it("la formation n'est pas dans la formule Essentiel", async () => {
    await owner`update parties set tier = 'essentiel' where id = ${A}`;
    const res = await call("GET", "/courses", national.token);
    expect(res.statusCode).toBe(402);
    await owner`update parties set tier = 'national' where id = ${A}`;
    await app.entitlements.invalidate(A);
  });

  it("crée une formation, ses leçons et son quiz ; on ne publie pas une formation vide", async () => {
    const r = await call("POST", "/courses", national.token, {
      title: { fr: "Les bases du militant", ht: "Baz militan an" },
      passThresholdPercent: 100,
      maxAttempts: 2,
      mandatoryForStatusIds: [militant],
    });
    expect(r.statusCode).toBe(201);
    course.id = r.json().id;
    expect((await call("PATCH", `/courses/${course.id}`, national.token, { published: true })).json()).toMatchObject({
      code: "course_without_lessons",
    });
    course.intro = (
      await call("POST", `/courses/${course.id}/lessons`, national.token, {
        kind: "text",
        title: { fr: "Notre histoire" },
        body: { fr: "Le parti est né en 2026." },
      })
    ).json().id;
    course.quiz = (
      await call("POST", `/courses/${course.id}/lessons`, national.token, {
        kind: "text",
        title: { fr: "Quiz d'organisation" },
        quiz: QUIZ,
      })
    ).json().id;
    expect((await call("PATCH", `/courses/${course.id}`, national.token, { published: true })).statusCode).toBe(204);
    expect((await call("POST", "/courses", pvManager.token, { title: { fr: "X" } })).statusCode).toBe(403);
  });

  it("refuse un quiz dont la bonne réponse n'est pas parmi les choix", async () => {
    const bad = [{ ...QUIZ[0], correct: ["z"] }];
    const res = await call("POST", `/courses/${course.id}/lessons`, national.token, {
      kind: "text",
      title: { fr: "X" },
      quiz: bad,
    });
    expect(res.statusCode).toBe(400);
  });

  it("le membre voit la formation, obligatoire pour son statut ; la suite reste verrouillée ; jamais les réponses", async () => {
    const list = (await call("GET", "/training", marie.token)).json().courses;
    expect(list.find((c: { id: string }) => c.id === course.id)).toMatchObject({
      mandatory: true,
      lessonCount: 2,
      passedLessons: 0,
      completed: false,
    });
    expect((await call("GET", "/training", luc.token)).json().courses[0].mandatory).toBe(false);
    const view = await call("GET", `/training/${course.id}`, marie.token);
    const [intro, quiz] = view.json().lessons;
    expect(intro).toMatchObject({ locked: false, passed: false });
    expect(quiz).toMatchObject({ locked: true, quiz: null, body: null });
    expect(view.body).not.toContain('"correct"');
  });

  it("une leçon verrouillée ne se passe pas ; une leçon lue ouvre la suivante, sans fuite des réponses", async () => {
    expect(
      (await call("POST", `/training/lessons/${course.quiz}/attempt`, marie.token, { answers: {} })).json(),
    ).toMatchObject({
      code: "lesson_locked",
    });
    expect((await call("POST", `/training/lessons/${course.intro}/read`, marie.token)).json()).toMatchObject({
      passed: true,
    });
    const view = await call("GET", `/training/${course.id}`, marie.token);
    const quiz = view.json().lessons[1];
    expect(quiz.locked).toBe(false);
    expect(quiz.quiz[1]).toMatchObject({ id: "q2", multiple: true });
    expect(view.body).not.toContain('"correct"');
  });

  it("note le quiz au seuil de la formation, sans donner la bonne réponse, dans la limite des tentatives", async () => {
    const first = (
      await call("POST", `/training/lessons/${course.quiz}/attempt`, marie.token, { answers: { q1: ["b"], q2: ["a"] } })
    ).json();
    expect(first).toMatchObject({
      scorePercent: 50,
      passed: false,
      threshold: 100,
      wrongQuestionIds: ["q2"],
      attemptsLeft: 1,
    });
    expect(JSON.stringify(first)).not.toContain('"correct"');
    const second = (
      await call("POST", `/training/lessons/${course.quiz}/attempt`, marie.token, {
        answers: { q1: ["a"], q2: ["a", "b"] },
      })
    ).json();
    expect(second).toMatchObject({ passed: false, attemptsLeft: 0 });
    expect(
      (
        await call("POST", `/training/lessons/${course.quiz}/attempt`, marie.token, {
          answers: { q1: ["b"], q2: ["a", "b"] },
        })
      ).json(),
    ).toMatchObject({ code: "attempts_exhausted" });
  });

  it("réussir toutes les leçons termine la formation et délivre un certificat numéroté", async () => {
    await call("POST", `/training/lessons/${course.intro}/read`, paul.token);
    const done = (
      await call("POST", `/training/lessons/${course.quiz}/attempt`, paul.token, {
        answers: { q1: ["b"], q2: ["b", "a"] },
      })
    ).json();
    const year = new Date().getUTCFullYear();
    expect(done).toMatchObject({ scorePercent: 100, passed: true, certificateNumber: `${year}-000001` });
    expect(
      (await call("POST", `/training/lessons/${course.quiz}/attempt`, paul.token, { answers: { q1: ["b"] } })).json(),
    ).toMatchObject({ code: "lesson_already_passed" });
    const list = (await call("GET", "/training", paul.token)).json().courses;
    expect(list.find((c: { id: string }) => c.id === course.id)).toMatchObject({ completed: true, passedLessons: 2 });
  });

  it("le certificat se télécharge en PDF (formule National), et seulement le sien", async () => {
    const pdf = await call("GET", `/training/${course.id}/certificate`, paul.token);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    expect((await call("GET", `/training/${course.id}/certificate`, marie.token)).statusCode).toBe(404);
    await owner`update parties set tier = 'mouvement' where id = ${A}`;
    await app.entitlements.invalidate(A);
    expect((await call("GET", `/training/${course.id}/certificate`, paul.token)).statusCode).toBe(402);
    await owner`update parties set tier = 'national' where id = ${A}`;
    await app.entitlements.invalidate(A);
  });

  it("suit la formation obligatoire par zone, dans la portée de la personne (FOR-03)", async () => {
    const all = (await call("GET", `/courses/${course.id}/progress`, national.token)).json();
    // Obligatoire pour les militants : Marie (commencée) et Paul (terminée) ; Luc n'est pas concerné.
    expect(all.zone).toMatchObject({ target: 2, completed: 1, started: 1 });
    expect(all.mandatory).toBe(true);
    const pv = (await call("GET", `/courses/${course.id}/progress?zone=HT0114`, pvManager.token)).json();
    expect(pv.children.find((c: { code: string }) => c.code === "HT0114-02")).toMatchObject({
      target: 1,
      completed: 1,
    });
    expect((await call("GET", `/courses/${course.id}/progress`, pvManager.token)).statusCode).toBe(403);
  });

  it("une leçon déjà suivie ne se supprime pas ; un autre parti ne voit rien", async () => {
    expect((await call("DELETE", `/lessons/${course.intro}`, national.token)).json()).toMatchObject({
      code: "lesson_has_attempts",
    });
    expect((await call("GET", `/training/${course.id}`, other.token)).statusCode).toBe(404);
    expect((await call("GET", "/training", other.token)).json().courses).toEqual([]);
  });
});
