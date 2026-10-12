// VOT-01 à VOT-07, VOT-09, VOT-10 : scrutins internes sur Postgres, avec deux partis. Liste figée et contestée,
// candidatures, vote secret (aucun lien entre reçu et bulletin), dépouillement après clôture seulement, deux tours,
// question oui ou non, journal vérifiable, procès-verbal, certification et installation de l'élu dans le poste.
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { PERMISSIONS } from "@civora/shared";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LogEmailSender } from "../src/lib/messaging/email.js";
import { hashToken } from "../src/modules/auth/service.js";
import { ballotFingerprint } from "../src/modules/votes/service.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const B = randomUUID();
const tag = A.slice(0, 8);
let app: Awaited<ReturnType<typeof buildApp>>;
const userIds: string[] = [];

const zone = async (code: string) => (await owner`select id from zones where code = ${code}`)[0]!.id as string;

async function member(party: string, first: string, zoneCode: string) {
  const user = (
    await owner`insert into users (email) values (${`${first}-${randomUUID().slice(0, 6)}-${tag}@example.test`}) returning id`
  )[0]!.id;
  userIds.push(user);
  const id = (
    await owner`insert into members (party_id, user_id, member_number, first_name, last_name, zone_id, application_state)
    values (${party}, ${user}, ${String(Math.floor(Math.random() * 1e9))}, ${first}, 'Test', ${await zone(zoneCode)}, 'approved')
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
  )[0]!.id as string;
  await owner`insert into post_holders (party_id, post_id, member_id, starts_at) values (${party}, ${post}, ${memberId}, now() - interval '1 hour')`;
  return post;
}

const call = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, token: string, payload?: object) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
/** Avance le scrutin dans le temps : ouvert, puis clos. */
const openNow = (id: string) =>
  owner`update elections set opens_at = now() - interval '1 minute', closes_at = now() + interval '1 hour' where id = ${id}`;
const closeNow = (id: string) => owner`update elections set closes_at = now() - interval '1 second' where id = ${id}`;
const fr = (s: string) => ({ fr: s });

type M = Awaited<ReturnType<typeof member>>;
let national: M, chef: M, marie: M, paul: M, luc: M, rose: M, other: M;
let presidency = "";

beforeAll(async () => {
  await owner`insert into parties (id, slug, name, tier) values (${A}, ${"vot-a-" + tag}, 'Parti Vote', 'national')`;
  await owner`insert into parties (id, slug, name, tier) values (${B}, ${"vot-b-" + tag}, 'Autre parti', 'national')`;
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), { email: new LogEmailSender() });
  await app.ready();
  national = await member(A, "national", "HT0114-01");
  await holdPost(A, national.id, [...PERMISSIONS], null);
  chef = await member(A, "chef", "HT0114-01");
  await holdPost(A, chef.id, ["votes.manage"], "HT0114");
  marie = await member(A, "marie", "HT0114-01");
  paul = await member(A, "paul", "HT0114-02");
  luc = await member(A, "luc", "HT0311-01");
  rose = await member(A, "rose", "HT0114-02");
  other = await member(B, "autre", "HT0114-01");
  // Poste à pourvoir : présidence de la section, tenue aujourd'hui par Rose.
  presidency = await holdPost(A, rose.id, [], "HT0114");
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  for (const p of [A, B]) {
    for (const t of [
      "audit_log",
      "point_entries",
      "ballots",
      "ballot_receipts",
      "election_results",
      "roll_contests",
      "electoral_rolls",
      "candidates",
      "elections",
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

describe("formules et portée", () => {
  it("Essentiel : un scrutin actif, majorité simple seulement", async () => {
    await owner`update parties set tier = 'essentiel' where id = ${A}`;
    await app.entitlements.invalidate(A);
    const body = {
      kind: "post",
      title: fr("Essai"),
      method: "two_rounds",
      opensAt: inDays(2),
      closesAt: inDays(3),
    };
    const advanced = await call("POST", "/votes/admin", national.token, body);
    expect(advanced.statusCode).toBe(402);
    expect(advanced.json()).toMatchObject({ code: "feature_not_in_plan", requiredTier: "mouvement" });
    expect(
      (
        await call("POST", "/votes/admin", national.token, { ...body, method: "simple_majority", postId: presidency })
      ).json(),
    ).toMatchObject({ code: "feature_not_in_plan" });
    const first = await call("POST", "/votes/admin", national.token, { ...body, method: "simple_majority" });
    expect(first.statusCode).toBe(201);
    const second = await call("POST", "/votes/admin", national.token, { ...body, method: "simple_majority" });
    expect(second.json()).toMatchObject({ code: "quota_internal_elections" });
    await owner`delete from elections where id = ${first.json().id}`;
    await owner`update parties set tier = 'national' where id = ${A}`;
    await app.entitlements.invalidate(A);
  });

  it("un responsable de zone n'organise que dans sa zone ; un scrutin national exige un poste national", async () => {
    const body = { kind: "question", title: fr("Q"), method: "yes_no", opensAt: inDays(2), closesAt: inDays(3) };
    expect((await call("POST", "/votes/admin", chef.token, body)).statusCode).toBe(403);
    expect((await call("POST", "/votes/admin", chef.token, { ...body, zoneCode: "HT03" })).statusCode).toBe(403);
    const ok = await call("POST", "/votes/admin", chef.token, { ...body, zoneCode: "HT0114" });
    expect(ok.statusCode).toBe(201);
    expect((await call("GET", "/votes/admin", chef.token)).json().elections.map((e: { id: string }) => e.id)).toEqual([
      ok.json().id,
    ]);
    // Un autre parti ne voit même pas le scrutin (RLS).
    expect((await call("GET", `/votes/admin/${ok.json().id}`, other.token)).statusCode).toBe(404);
  });

  it("refuse un scrutin incohérent", async () => {
    const r = await call("POST", "/votes/admin", national.token, {
      kind: "question",
      title: fr("Q"),
      method: "simple_majority",
      opensAt: inDays(3),
      closesAt: inDays(2),
    });
    expect(r.statusCode).toBe(400);
  });
});

describe("élection à la présidence de la section (majorité simple)", () => {
  let id = "";
  let marieCand = "";
  let paulCand = "";
  let lucCand = "";
  const codes: string[] = [];

  it("crée le scrutin, ouvre les candidatures, fige la liste de la zone", async () => {
    const r = await call("POST", "/votes/admin", national.token, {
      kind: "post",
      title: fr("Présidence de la section"),
      zoneCode: "HT0114",
      postId: presidency,
      method: "simple_majority",
      opensAt: inDays(5),
      closesAt: inDays(6),
      candidaciesCloseAt: inDays(4),
      contestationsCloseAt: inDays(4),
      eligibility: { combinator: "and", rules: [{ field: "zone", operator: "in", value: ["HT0114-01"] }] },
    });
    expect(r.statusCode).toBe(201);
    id = r.json().id;
    // Pas de candidature avant la publication de la liste.
    expect((await call("POST", `/votes/${id}/candidacy`, marie.token, {})).json()).toMatchObject({
      code: "candidacies_not_open",
    });
    const frozen = await call("POST", `/votes/admin/${id}/roll`, chef.token);
    // Zone HT0114 : national, chef, marie, paul, rose. Luc (HT0311) n'y est pas.
    expect(frozen.json()).toEqual({ registered: 5 });
    expect((await call("POST", `/votes/admin/${id}/roll`, chef.token)).json()).toMatchObject({
      code: "roll_already_frozen",
    });
  });

  it("candidatures en ligne : éligibilité vérifiée, décision du responsable", async () => {
    const m = await call("POST", `/votes/${id}/candidacy`, marie.token, { statement: fr("Pour une section active") });
    expect(m.json()).toMatchObject({ status: "pending" });
    marieCand = m.json().id;
    expect((await call("POST", `/votes/${id}/candidacy`, marie.token, {})).json()).toMatchObject({
      code: "already_candidate",
    });
    // Paul est en HT0114-02 : non éligible.
    expect((await call("POST", `/votes/${id}/candidacy`, paul.token, {})).json()).toMatchObject({
      code: "candidate_not_eligible",
    });
    // Saisie par le responsable : la même règle s'applique.
    expect(
      (
        await call("POST", `/votes/admin/${id}/candidates`, chef.token, { memberId: paul.id, label: fr("Paul") })
      ).json(),
    ).toMatchObject({ code: "candidate_not_eligible" });
    const nat = await call("POST", `/votes/admin/${id}/candidates`, chef.token, {
      memberId: national.id,
      label: fr("National Test"),
    });
    paulCand = nat.json().id;
    const third = await call("POST", `/votes/admin/${id}/candidates`, chef.token, { label: fr("Liste de l'unité") });
    lucCand = third.json().id;
    expect(
      (await call("PATCH", `/votes/admin/${id}/candidates/${marieCand}`, chef.token, { status: "accepted" }))
        .statusCode,
    ).toBe(204);
    await call("PATCH", `/votes/admin/${id}/candidates/${lucCand}`, chef.token, {
      status: "rejected",
      reason: "Dossier incomplet",
    });
  });

  it("liste figée : consultable par les inscrits, contestable avant l'ouverture (VOT-03)", async () => {
    expect((await call("GET", `/votes/${id}/roll`, marie.token)).json().voters).toHaveLength(5);
    expect((await call("GET", `/votes/${id}/roll`, luc.token)).statusCode).toBe(403);
    // Luc signale son omission ; Marie conteste l'inscription de Rose.
    const omission = await call("POST", `/votes/${id}/contests`, luc.token, {
      kind: "missing",
      reason: "Je milite dans cette section",
    });
    expect(omission.statusCode).toBe(201);
    // Luc n'est pas inscrit : il ne conteste pas l'inscription d'autrui.
    expect(
      (
        await call("POST", `/votes/${id}/contests`, luc.token, {
          kind: "ineligible",
          concernedMemberId: rose.id,
          reason: "Ne milite plus",
        })
      ).statusCode,
    ).toBe(403);
    const undue = await call("POST", `/votes/${id}/contests`, marie.token, {
      kind: "ineligible",
      concernedMemberId: rose.id,
      reason: "A quitté la section",
    });
    expect(
      (await call("POST", `/votes/${id}/contests`, marie.token, { kind: "missing", reason: "Moi aussi" })).json(),
    ).toMatchObject({ code: "already_on_roll" });
    await call("PATCH", `/votes/admin/${id}/contests/${omission.json().id}`, chef.token, { status: "accepted" });
    await call("PATCH", `/votes/admin/${id}/contests/${undue.json().id}`, chef.token, {
      status: "rejected",
      note: "Toujours inscrite dans la section",
    });
    expect(
      (
        await call("PATCH", `/votes/admin/${id}/contests/${undue.json().id}`, chef.token, { status: "accepted" })
      ).json(),
    ).toMatchObject({ code: "contest_decided" });
    const d = (await call("GET", `/votes/admin/${id}`, chef.token)).json();
    expect(d.registered).toBe(6);
    expect(d.phase).toBe("preparation");
    expect(d.contests).toHaveLength(2);
  });

  it("un membre approuvé après le gel n'est pas inscrit", async () => {
    const late = await member(A, "tardif", "HT0114-01");
    await openNow(id);
    expect((await call("POST", `/votes/${id}/ballot`, late.token, { candidateIds: [marieCand] })).json()).toMatchObject(
      { code: "not_on_roll" },
    );
    expect((await call("GET", `/votes/${id}`, late.token)).statusCode).toBe(404);
  });

  it("vote secret : un bulletin par inscrit, sans lien avec le reçu (VOT-05)", async () => {
    const member = (await call("GET", `/votes/${id}`, marie.token)).json();
    expect(member.phase).toBe("open");
    // Candidats en lice seulement : la liste rejetée n'apparaît pas.
    expect(member.candidates.map((c: { id: string }) => c.id).sort()).toEqual([marieCand, paulCand].sort());
    expect((await call("POST", `/votes/${id}/ballot`, marie.token, { candidateIds: [lucCand] })).json()).toMatchObject({
      code: "invalid_ballot",
    });
    expect(
      (await call("POST", `/votes/${id}/ballot`, marie.token, { candidateIds: [marieCand, paulCand] })).json(),
    ).toMatchObject({ code: "invalid_ballot" });
    for (const [voter, choice] of [
      [marie, [marieCand]],
      [paul, [marieCand]],
      [luc, [paulCand]],
      [rose, []],
    ] as const) {
      const r = await call(
        "POST",
        `/votes/${id}/ballot`,
        voter.token,
        choice.length ? { candidateIds: choice } : { blank: true },
      );
      expect(r.statusCode).toBe(201);
      expect(r.json().receiptCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      codes.push(r.json().receiptCode);
    }
    expect((await call("POST", `/votes/${id}/ballot`, marie.token, { candidateIds: [paulCand] })).json()).toMatchObject(
      { code: "already_voted" },
    );
    expect((await call("POST", `/votes/${id}/ballot`, other.token, { candidateIds: [marieCand] })).statusCode).toBe(
      404,
    );
    // Le bulletin ne porte ni votant ni heure ; le reçu, l'heure tronquée et jamais le choix.
    const cols = await owner`select column_name from information_schema.columns where table_name = 'ballots'`;
    expect(cols.map((c) => c.column_name).sort()).toEqual(
      ["choice", "election_id", "id", "party_id", "public_hash", "round"].sort(),
    );
    const receipts = await owner`select cast_at from ballot_receipts where election_id = ${id}`;
    for (const r of receipts) expect((r.cast_at as Date).getUTCMinutes()).toBe(0);
    expect((await call("GET", `/votes/${id}`, marie.token)).json().voted).toBe(true);
  });

  it("pas de dépouillement ni de journal avant la clôture", async () => {
    expect((await call("POST", `/votes/admin/${id}/count`, chef.token)).json()).toMatchObject({
      code: "not_closed_yet",
    });
    expect((await call("GET", `/votes/${id}/journal`, marie.token)).json()).toMatchObject({ code: "not_counted" });
  });

  it("dépouille après la clôture, publie le journal vérifiable et le procès-verbal (VOT-06, VOT-09)", async () => {
    await closeNow(id);
    const r = (await call("POST", `/votes/admin/${id}/count`, chef.token)).json();
    expect(r).toMatchObject({ reason: "elected", winners: [marieCand], ballots: 4, blank: 1, validVotes: 3 });
    // Points de vote donnés au dépouillement à chaque votant (GAM-01), jamais à l'heure du vote.
    const pts = await owner`select member_id from point_entries where reference_id = ${id} and action = 'vote'`;
    expect(pts.map((p) => p.member_id).sort()).toEqual([marie.id, paul.id, luc.id, rose.id].sort());
    // Résultats réservés au responsable jusqu'à la certification.
    expect((await call("GET", `/votes/${id}`, marie.token)).json().results).toEqual([]);
    const j = (await call("GET", `/votes/${id}/journal`, paul.token)).json();
    expect(j.hashes).toHaveLength(4);
    for (const c of codes) expect(j.hashes).toContain(ballotFingerprint(id, 1, c));
    expect(j.hashes).toEqual([...j.hashes].sort());
    const pdf = await call("GET", `/votes/admin/${id}/minutes`, chef.token);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("certifie : l'élue est installée dans le poste, le mandat précédent prend fin (VOT-10)", async () => {
    // votes.certify est réservé : le responsable de zone ne l'a pas.
    expect((await call("POST", `/votes/admin/${id}/certify`, chef.token)).statusCode).toBe(403);
    expect((await call("POST", `/votes/admin/${id}/certify`, national.token)).json()).toEqual({ installed: 1 });
    const holders =
      await owner`select member_id, source_election_id, ends_at from post_holders where post_id = ${presidency}`;
    const current = holders.filter((h) => !h.ends_at || (h.ends_at as Date) > new Date());
    expect(current).toEqual([{ member_id: marie.id, source_election_id: id, ends_at: null }]);
    expect((await call("GET", `/votes/${id}`, marie.token)).json()).toMatchObject({ phase: "published" });
    expect((await call("GET", `/votes/${id}`, marie.token)).json().results).toHaveLength(1);
    const audit =
      await owner`select action from audit_log where party_id = ${A} and (target_id = ${id} or target_id = ${presidency})`;
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(["votes.roll.freeze", "votes.count", "votes.certify", "role.change"]),
    );
    expect((await call("POST", `/votes/admin/${id}/certify`, national.token)).json()).toMatchObject({
      code: "not_counted",
    });
  });
});

describe("deux tours et question", () => {
  it("second tour entre les deux premiers quand personne n'a la majorité absolue (VOT-07)", async () => {
    const id = (
      await call("POST", "/votes/admin", national.token, {
        kind: "post",
        title: fr("Secrétariat général"),
        method: "two_rounds",
        opensAt: inDays(2),
        closesAt: inDays(3),
      })
    ).json().id;
    const c = [];
    for (const name of ["Alpha", "Beta", "Gamma"])
      c.push((await call("POST", `/votes/admin/${id}/candidates`, national.token, { label: fr(name) })).json().id);
    await call("POST", `/votes/admin/${id}/roll`, national.token);
    await openNow(id);
    for (const [v, pick] of [
      [national, c[0]],
      [chef, c[0]],
      [marie, c[1]],
      [paul, c[1]],
      [luc, c[2]],
    ] as const)
      await call("POST", `/votes/${id}/ballot`, v.token, { candidateIds: [pick] });
    await closeNow(id);
    const r1 = (await call("POST", `/votes/admin/${id}/count`, national.token)).json();
    expect(r1.reason).toBe("runoff");
    expect([...r1.runoff].sort()).toEqual([c[0], c[1]].sort());
    expect((await call("POST", `/votes/admin/${id}/certify`, national.token)).json()).toMatchObject({
      code: "runoff_pending",
    });
    await call("POST", `/votes/admin/${id}/runoff`, national.token, { opensAt: inDays(1), closesAt: inDays(2) });
    await openNow(id);
    const ballot = (await call("GET", `/votes/${id}`, luc.token)).json();
    expect(ballot.round).toBe(2);
    expect(ballot.voted).toBe(false);
    expect(ballot.candidates.map((x: { id: string }) => x.id).sort()).toEqual([c[0], c[1]].sort());
    expect((await call("POST", `/votes/${id}/ballot`, luc.token, { candidateIds: [c[2]] })).json()).toMatchObject({
      code: "invalid_ballot",
    });
    for (const [v, pick] of [
      [luc, c[1]],
      [marie, c[1]],
      [national, c[0]],
    ] as const)
      expect((await call("POST", `/votes/${id}/ballot`, v.token, { candidateIds: [pick] })).statusCode).toBe(201);
    await closeNow(id);
    const r2 = (await call("POST", `/votes/admin/${id}/count`, national.token)).json();
    expect(r2).toMatchObject({ reason: "elected", winners: [c[1]] });
    const d = (await call("GET", `/votes/admin/${id}`, national.token)).json();
    expect(d.results.map((x: { round: number }) => x.round)).toEqual([1, 2]);
    expect((await call("GET", `/votes/${id}/journal?round=1`, marie.token)).json().hashes).toHaveLength(5);
    expect((await call("GET", `/votes/${id}/journal?round=2`, marie.token)).json().hashes).toHaveLength(3);
  });

  it("question oui ou non avec quorum", async () => {
    const id = (
      await call("POST", "/votes/admin", national.token, {
        kind: "question",
        title: fr("Adopter les nouveaux statuts"),
        method: "yes_no",
        quorumPercent: 50,
        opensAt: inDays(2),
        closesAt: inDays(3),
      })
    ).json().id;
    const d = (await call("GET", `/votes/admin/${id}`, national.token)).json();
    expect(d.candidates.map((x: { label: { fr: string } }) => x.label.fr)).toEqual(["Oui", "Non"]);
    expect(
      (await call("POST", `/votes/admin/${id}/candidates`, national.token, { label: fr("Peut-être") })).json(),
    ).toMatchObject({ code: "question_options_fixed" });
    await call("POST", `/votes/admin/${id}/roll`, national.token);
    await openNow(id);
    await call("POST", `/votes/${id}/ballot`, marie.token, { candidateIds: [d.candidates[0].id] });
    await closeNow(id);
    // 1 votant sur 7 inscrits : quorum non atteint.
    expect((await call("POST", `/votes/admin/${id}/count`, national.token)).json()).toMatchObject({
      reason: "quorum_not_met",
      winners: [],
    });
  });
});
