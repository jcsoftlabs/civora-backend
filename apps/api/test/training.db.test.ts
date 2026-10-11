// FOR-01 à FOR-04 : formations en modules et chapitres (texte, fichier, YouTube, Vimeo), quiz par module notés
// sans fuite des réponses, progression bloquante, tentatives limitées, formation obligatoire par statut, suivi
// par zone, certificat numéroté au modèle du parti. Sur Postgres, avec deux partis.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { PERMISSIONS } from "@civora/shared";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LogEmailSender } from "../src/lib/messaging/email.js";
import { LocalStorage } from "../src/lib/storage/local.js";
import { hashToken } from "../src/modules/auth/service.js";
import { grade } from "../src/modules/training/service.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const B = randomUUID();
const tag = A.slice(0, 8);
let app: Awaited<ReturnType<typeof buildApp>>;
let root = "";
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

/** Ce que fait le back-office : demander l'envoi, envoyer à l'URL signée, confirmer. */
async function upload(token: string, purpose: string, name: string, mimeType: string, body: Buffer) {
  const ask = (await call("POST", "/files/uploads", token, { purpose, name, mimeType, sizeBytes: body.length })).json();
  const u = new URL(ask.upload.url);
  await app.inject({
    method: "PUT",
    url: u.pathname + u.search,
    headers: { "content-type": mimeType },
    payload: body,
  });
  expect((await call("POST", `/files/${ask.fileId}/complete`, token)).json()).toMatchObject({ status: "ready" });
  return ask.fileId as string;
}
// Vraie image PNG d'un pixel : le PDF doit pouvoir l'intégrer.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const MP4 = Buffer.concat([Buffer.from("00000018667479706d703432", "hex"), randomBytes(2000)]);

const call = (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, token: string, payload?: object) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });

let national: Awaited<ReturnType<typeof member>>;
let pvManager: Awaited<ReturnType<typeof member>>;
let marie: Awaited<ReturnType<typeof member>>;
let paul: Awaited<ReturnType<typeof member>>;
let luc: Awaited<ReturnType<typeof member>>;
let other: Awaited<ReturnType<typeof member>>;
let militant = "";
const course = { id: "", welcome: "", history: "", video: "", organisation: "", rules: "" };

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
  root = await mkdtemp(join(tmpdir(), "civora-training-"));
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), {
    email: new LogEmailSender(),
    storage: new LocalStorage(root, "http://localhost:4000"),
  });
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
      "course_modules",
      "certificate_templates",
      "courses",
      "files",
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
  await rm(root, { recursive: true, force: true });
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

  it("crée une formation, ses modules et chapitres ; on ne publie ni formation vide ni module vide", async () => {
    const r = await call("POST", "/courses", national.token, {
      title: { fr: "Les bases du militant", ht: "Baz militan an" },
      passThresholdPercent: 100,
      maxAttempts: 2,
      mandatoryForStatusIds: [militant],
    });
    expect(r.statusCode).toBe(201);
    course.id = r.json().id;
    const publish = () => call("PATCH", `/courses/${course.id}`, national.token, { published: true });
    expect((await publish()).json()).toMatchObject({ code: "course_without_modules" });

    course.welcome = (
      await call("POST", `/courses/${course.id}/modules`, national.token, { title: { fr: "Bienvenue" } })
    ).json().id;
    course.organisation = (
      await call("POST", `/courses/${course.id}/modules`, national.token, {
        title: { fr: "Organisation du parti" },
        quiz: QUIZ,
      })
    ).json().id;
    expect((await publish()).json()).toMatchObject({ code: "module_without_chapters" });

    course.history = (
      await call("POST", `/modules/${course.welcome}/chapters`, national.token, {
        kind: "text",
        title: { fr: "Notre histoire" },
        body: { fr: "Le parti est né en 2026." },
      })
    ).json().id;
    const yt = await call("POST", `/modules/${course.welcome}/chapters`, national.token, {
      kind: "youtube",
      title: { fr: "Le mot du président" },
      videoUrl: "https://youtu.be/dQw4w9WgXcQ?t=3",
    });
    expect(yt.statusCode).toBe(201);
    const video = await upload(national.token, "training_media", "statuts.mp4", "video/mp4", MP4);
    course.video = (
      await call("POST", `/modules/${course.organisation}/chapters`, national.token, {
        kind: "video",
        title: { fr: "Les statuts en 5 minutes" },
        mediaFileId: video,
      })
    ).json().id;
    expect((await publish()).statusCode).toBe(204);
    expect((await call("POST", "/courses", pvManager.token, { title: { fr: "X" } })).statusCode).toBe(403);

    const detail = (await call("GET", `/courses/${course.id}`, national.token)).json();
    expect(detail.modules.map((m: { chapters: unknown[] }) => m.chapters.length)).toEqual([2, 1]);
    expect(detail.modules[0].chapters[1]).toMatchObject({
      kind: "youtube",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    });
    expect(detail.modules[1].chapters[0].media).toMatchObject({ mimeType: "video/mp4", name: "statuts.mp4" });
  });

  it("refuse un chapitre incohérent et un quiz dont la bonne réponse n'est pas parmi les choix", async () => {
    const add = (body: object) => call("POST", `/modules/${course.welcome}/chapters`, national.token, body);
    const t = { title: { fr: "X" } };
    expect(
      (await add({ ...t, kind: "youtube", videoUrl: "https://evil.example/watch?v=dQw4w9WgXcQ" })).json(),
    ).toMatchObject({ code: "invalid_video_url" });
    expect((await add({ ...t, kind: "youtube", videoUrl: "https://vimeo.com/76979871" })).json()).toMatchObject({
      code: "invalid_video_url",
    });
    expect((await add({ ...t, kind: "vimeo", videoUrl: "https://vimeo.com/76979871" })).statusCode).toBe(201);
    expect((await add({ ...t, kind: "text" })).json()).toMatchObject({ code: "chapter_body_required" });
    expect((await add({ ...t, kind: "video" })).json()).toMatchObject({ code: "chapter_media_required" });
    const image = await upload(national.token, "training_media", "affiche.png", "image/png", PNG);
    expect((await add({ ...t, kind: "video", mediaFileId: image })).json()).toMatchObject({
      code: "chapter_media_kind_mismatch",
    });
    const bad = [{ ...QUIZ[0], correct: ["z"] }];
    expect(
      (await call("POST", `/courses/${course.id}/modules`, national.token, { title: { fr: "X" }, quiz: bad }))
        .statusCode,
    ).toBe(400);
    // Le chapitre Vimeo ajouté pour l'essai est retiré : personne ne l'a vu.
    const detail = (await call("GET", `/courses/${course.id}`, national.token)).json();
    const vimeo = detail.modules[0].chapters.find((c: { kind: string }) => c.kind === "vimeo");
    expect((await call("DELETE", `/chapters/${vimeo.id}`, national.token)).statusCode).toBe(204);
  });

  it("remplacer la vidéo d'un chapitre met l'ancienne à la corbeille", async () => {
    const before = (await call("GET", `/courses/${course.id}`, national.token)).json().modules[1].chapters[0];
    const next = await upload(national.token, "training_media", "statuts-v2.mp4", "video/mp4", MP4);
    expect((await call("PATCH", `/chapters/${course.video}`, national.token, { mediaFileId: next })).statusCode).toBe(
      204,
    );
    const [old] = await owner`select trashed_at from files where id = ${before.mediaFileId}`;
    expect(old!.trashed_at).not.toBeNull();
    const [kept] = await owner`select trashed_at from files where id = ${next}`;
    expect(kept!.trashed_at).toBeNull();
  });

  it("le membre voit la formation, obligatoire pour son statut ; le module suivant reste verrouillé ; jamais les réponses", async () => {
    const list = (await call("GET", "/training", marie.token)).json().courses;
    expect(list.find((c: { id: string }) => c.id === course.id)).toMatchObject({
      mandatory: true,
      moduleCount: 2,
      passedModules: 0,
      completed: false,
    });
    expect((await call("GET", "/training", luc.token)).json().courses[0].mandatory).toBe(false);
    const view = await call("GET", `/training/${course.id}`, marie.token);
    const [welcome, organisation] = view.json().modules;
    expect(welcome).toMatchObject({ locked: false, passed: false, hasQuiz: false });
    expect(welcome.chapters[1].embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(organisation).toMatchObject({ locked: true, hasQuiz: true, quizOpen: false, quiz: null });
    expect(organisation.chapters[0]).toMatchObject({ title: { fr: "Les statuts en 5 minutes" }, media: null });
    expect(view.body).not.toContain('"correct"');
  });

  it("un module verrouillé ne s'ouvre pas ; ses chapitres vus, le module sans quiz est réussi et ouvre le suivant", async () => {
    expect((await call("POST", `/training/chapters/${course.video}/view`, marie.token)).json()).toMatchObject({
      code: "module_locked",
    });
    expect(
      (await call("POST", `/training/modules/${course.organisation}/attempt`, marie.token, { answers: {} })).json(),
    ).toMatchObject({ code: "module_locked" });
    const chapters = (await call("GET", `/training/${course.id}`, marie.token)).json().modules[0].chapters;
    expect((await call("POST", `/training/chapters/${chapters[0].id}/view`, marie.token)).json()).toMatchObject({
      viewed: true,
      modulePassed: false,
    });
    expect((await call("POST", `/training/chapters/${chapters[1].id}/view`, marie.token)).json()).toMatchObject({
      modulePassed: true,
      certificateNumber: null,
    });
    const organisation = (await call("GET", `/training/${course.id}`, marie.token)).json().modules[1];
    expect(organisation).toMatchObject({ locked: false, quizOpen: false, quiz: null });
    expect(organisation.chapters[0].media).toMatchObject({ mimeType: "video/mp4" });
  });

  it("le quiz d'un module s'ouvre quand tous ses chapitres sont vus", async () => {
    expect(
      (await call("POST", `/training/modules/${course.organisation}/attempt`, marie.token, { answers: {} })).json(),
    ).toMatchObject({ code: "chapters_not_viewed" });
    expect((await call("POST", `/training/chapters/${course.video}/view`, marie.token)).json()).toMatchObject({
      modulePassed: false,
      quizOpen: true,
    });
    const view = await call("GET", `/training/${course.id}`, marie.token);
    const organisation = view.json().modules[1];
    expect(organisation.quizOpen).toBe(true);
    expect(organisation.quiz[1]).toMatchObject({ id: "q2", multiple: true });
    expect(view.body).not.toContain('"correct"');
  });

  it("note le quiz au seuil de la formation, sans donner la bonne réponse, dans la limite des tentatives", async () => {
    const attempt = (answers: object) =>
      call("POST", `/training/modules/${course.organisation}/attempt`, marie.token, { answers });
    const first = (await attempt({ q1: ["b"], q2: ["a"] })).json();
    expect(first).toMatchObject({
      scorePercent: 50,
      passed: false,
      threshold: 100,
      wrongQuestionIds: ["q2"],
      attemptsLeft: 1,
    });
    expect(JSON.stringify(first)).not.toContain('"correct"');
    expect((await attempt({ q1: ["a"], q2: ["a", "b"] })).json()).toMatchObject({ passed: false, attemptsLeft: 0 });
    expect((await attempt({ q1: ["b"], q2: ["a", "b"] })).json()).toMatchObject({ code: "attempts_exhausted" });
  });

  it("réussir tous les modules termine la formation et délivre un certificat numéroté", async () => {
    const modules = (await call("GET", `/training/${course.id}`, paul.token)).json().modules;
    for (const m of modules)
      for (const c of m.chapters) await call("POST", `/training/chapters/${c.id}/view`, paul.token);
    const done = (
      await call("POST", `/training/modules/${course.organisation}/attempt`, paul.token, {
        answers: { q1: ["b"], q2: ["b", "a"] },
      })
    ).json();
    const year = new Date().getUTCFullYear();
    expect(done).toMatchObject({ scorePercent: 100, passed: true, certificateNumber: `${year}-000001` });
    expect(
      (
        await call("POST", `/training/modules/${course.organisation}/attempt`, paul.token, { answers: { q1: ["b"] } })
      ).json(),
    ).toMatchObject({ code: "module_already_passed" });
    const list = (await call("GET", "/training", paul.token)).json().courses;
    expect(list.find((c: { id: string }) => c.id === course.id)).toMatchObject({ completed: true, passedModules: 2 });
  });

  it("chaque parti règle son certificat : textes, couleur, logo, signataires avec signature", async () => {
    const empty = (await call("GET", "/certificate-template", national.token)).json();
    expect(empty).toMatchObject({ title: null, showLogo: true, signatories: [] });
    const firstSig = await upload(national.token, "signature", "signature.png", "image/png", PNG);
    const template = {
      title: { fr: "Diplôme du militant", ht: "Diplòm militan" },
      mention: null,
      footer: { fr: "Délivré par le bureau national." },
      accentColor: "#7A2E5C",
      showLogo: false,
      signatories: [
        { name: "Jean Pierre", role: { fr: "Président" }, signatureFileId: firstSig },
        { name: "Rose Michel", role: { fr: "Secrétaire générale" }, signatureFileId: null },
      ],
    };
    expect((await call("PUT", "/certificate-template", national.token, template)).statusCode).toBe(204);
    const saved = (await call("GET", "/certificate-template", national.token)).json();
    expect(saved).toMatchObject({ title: template.title, accentColor: "#7A2E5C", showLogo: false });
    expect(saved.signatories[0].signatureUrl).toContain("/storage/local/");
    expect(saved.signatories[1].signatureUrl).toBeNull();

    const sample = await call("GET", "/certificate-template/sample", national.token);
    expect(sample.headers["content-type"]).toBe("application/pdf");
    expect(sample.rawPayload.toString("latin1")).toContain("/Subtype /Image");

    // Signature remplacée : l'ancienne part à la corbeille.
    const nextSig = await upload(national.token, "signature", "signature-2.png", "image/png", PNG);
    template.signatories[0]!.signatureFileId = nextSig;
    expect((await call("PUT", "/certificate-template", national.token, template)).statusCode).toBe(204);
    const [old] = await owner`select trashed_at from files where id = ${firstSig}`;
    expect(old!.trashed_at).not.toBeNull();

    expect(
      (await call("PUT", "/certificate-template", national.token, { ...template, accentColor: "red" })).statusCode,
    ).toBe(400);
    const video = await upload(national.token, "training_media", "x.mp4", "video/mp4", MP4);
    expect(
      (
        await call("PUT", "/certificate-template", national.token, {
          ...template,
          signatories: [{ name: "X", role: { fr: "Y" }, signatureFileId: video }],
        })
      ).json(),
    ).toMatchObject({ code: "file_not_ready" });
    expect((await call("GET", "/certificate-template", marie.token)).statusCode).toBe(403);
  });

  it("le certificat se télécharge en PDF (formule National), et seulement le sien", async () => {
    const pdf = await call("GET", `/training/${course.id}/certificate`, paul.token);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.rawPayload.toString("latin1")).toContain("/Subtype /Image"); // la signature du président
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

  it("un chapitre vu ou un module commencé ne se supprime pas ; un autre parti ne voit rien", async () => {
    expect((await call("DELETE", `/chapters/${course.history}`, national.token)).json()).toMatchObject({
      code: "chapter_has_views",
    });
    expect((await call("DELETE", `/modules/${course.organisation}`, national.token)).json()).toMatchObject({
      code: "module_has_progress",
    });
    expect((await call("GET", `/training/${course.id}`, other.token)).statusCode).toBe(404);
    expect((await call("GET", "/training", other.token)).json().courses).toEqual([]);
  });
});
