// ADH-07 à ADH-09 : import d'un fichier de membres sur un vrai Postgres. Aperçu (mise en forme, zones, doublons
// dans le fichier et dans la base), décisions, exécution par le worker sans doublon ni reprise, pièces d'identité
// jamais en clair, fichier supprimé à la fin, périmètre territorial, invitations, isolation entre partis.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, withParty } from "@civora/db";
import { PERMISSIONS } from "@civora/shared";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LocalKeyProvider } from "../src/lib/crypto.js";
import { LogEmailSender, type EmailMessage, type EmailSender } from "../src/lib/messaging/email.js";
import { PartyKeys } from "../src/lib/party-keys.js";
import { LocalStorage } from "../src/lib/storage/local.js";
import { hashToken } from "../src/modules/auth/service.js";
import { DuesService } from "../src/modules/dues/service.js";
import { IdentityService } from "../src/modules/members/identity.js";
import { MemberImportService } from "../src/modules/members/import/service.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const B = randomUUID();
const tag = A.slice(0, 8);
const keys = new PartyKeys(new LocalKeyProvider([{ id: 1, base64: randomBytes(32).toString("base64") }]));
const sent: EmailMessage[] = [];
const email: EmailSender = { send: async (m) => void sent.push(m) };
let storage: LocalStorage;
let app: Awaited<ReturnType<typeof buildApp>>;
let imports: MemberImportService;
const identity = new IdentityService(keys);
const userIds: string[] = [];
const NIN = "0034567890";

async function member(party: string, first: string, zoneCode: string, extra: { phone?: string; birth?: string } = {}) {
  const user = (await owner`insert into users (email) values (${`${first}-${tag}@example.test`}) returning id`)[0]!.id;
  userIds.push(user);
  const id = (
    await owner`insert into members (party_id, user_id, member_number, first_name, last_name, zone_id, application_state, phone_e164, birth_date)
    values (${party}, ${user}, ${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}, ${first}, 'Test',
      (select id from zones where code = ${zoneCode}), 'approved', ${extra.phone ?? null}, ${extra.birth ?? null}) returning id`
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

/** Fichier CSV déposé par `by` : ligne de fichiers prête et contenu dans le stockage local. */
async function upload(party: string, by: string, csv: string) {
  const id = randomUUID();
  const key = `party/${party}/imports/${id}`;
  await storage.put(key, Buffer.from(csv), "text/csv");
  await owner`insert into files (id, party_id, r2_key, name, mime_type, size_bytes, purpose, uploaded_by_member_id, upload_status)
    values (${id}, ${party}, ${key}, 'membres.csv', 'text/csv', ${Buffer.byteLength(csv)}, 'member_import', ${by}, 'ready')`;
  return { id, key };
}

let national: Awaited<ReturnType<typeof member>>;
let chef: Awaited<ReturnType<typeof member>>;
let marie: Awaited<ReturnType<typeof member>>;
let luc: Awaited<ReturnType<typeof member>>;
let other: Awaited<ReturnType<typeof member>>;
let commune = "";
let section1 = "";
let section2 = "";
let farCommune = "";
let farSection = "";

beforeAll(async () => {
  await owner`insert into parties (id, slug, name, tier) values (${A}, ${"imp-a-" + tag}, 'Parti Import', 'national'), (${B}, ${"imp-b-" + tag}, 'Autre parti', 'national')`;
  storage = new LocalStorage(await mkdtemp(join(tmpdir(), "civora-import-")), "http://localhost:4000");
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), {
    email: new LogEmailSender(),
    keys,
    storage,
  });
  await app.ready();
  imports = new MemberImportService({
    storage,
    keys,
    identity,
    dues: new DuesService(),
    email,
    partyOrigin: "https://{slug}.civora.test",
  });
  national = await member(A, "national", "HT0114-01");
  await holdPost(A, national.id, [...PERMISSIONS], null);
  chef = await member(A, "chef", "HT0114-01");
  await holdPost(A, chef.id, ["members.import", "members.read"], "HT0114");
  marie = await member(A, "marie", "HT0114-01", { phone: "+50937000001" });
  luc = await member(A, "luc", "HT0114-02", { birth: "1985-06-01" });
  await withParty(A, (tx) => identity.store(tx, A, luc.id, "nin", NIN));
  other = await member(B, "autre", "HT0114-01");
  await holdPost(B, other.id, [...PERMISSIONS], null);
  const z = await owner<
    { code: string; name: string }[]
  >`select code, name from zones where code in ('HT0114', 'HT0114-01', 'HT0114-02', 'HT0311', 'HT0311-01')`;
  const name = (c: string) => z.find((r) => r.code === c)!.name;
  [commune, section1, section2, farCommune, farSection] = [
    name("HT0114"),
    name("HT0114-01"),
    name("HT0114-02"),
    name("HT0311"),
    name("HT0311-01"),
  ];
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  for (const p of [A, B])
    for (const t of [
      "audit_log",
      "member_import_rows",
      "member_imports",
      "files",
      "member_identities",
      "dues_schedules",
      "sessions",
      "post_holders",
      "posts",
      "organs",
      "members",
      "party_keys",
    ])
      await owner.unsafe(`delete from ${t} where party_id = $1`, [p]).catch(() => undefined);
  await owner`delete from parties where id in (${A}, ${B})`;
  await owner`delete from users where id in ${owner(userIds)} or email like ${"%-" + tag + "@import.test"}`;
  await owner.end();
  await closeDb();
});

const csv = () =>
  [
    "Prénom;Nom;Téléphone;Courriel;Date de naissance;CIN;Commune;Section communale;Ville diaspora;Pays",
    `Rose;Delva;3712 0001;rose-${tag}@import.test;12/04/1991;;${commune};${section1};;`,
    `Jean;Baptiste;;;;;Kafou-${tag};1re section;;`,
    `;Sans Prénom;3712 0002;;;;${commune};${section1};;`,
    `MARIE;TEST;3700 0001;;14/03/1990;;${commune};${section2};;`,
    `Lucien;Doublon;;;;${NIN};${commune};${section2};;`,
    `Luc;Test;;;01/06/1985;;${commune};${section2};;`,
    `Rose;Delva;3712 0001;;;;${commune};${section1};;`,
    `Paul;Pierre;12;;;;${commune};${section1};;`,
    `Nadia;Exil;+1 305 555 0101;;;;;;Miami;USA`,
    `Ana;Ailleurs;;autre-${tag}@example.test;;;${commune};${section1};;`,
    `Max;Loin;;;;;${farCommune};${farSection};;`,
  ].join("\n");
const MAPPING = {
  firstName: 0,
  lastName: 1,
  phone: 2,
  email: 3,
  birthDate: 4,
  nin: 5,
  commune: 6,
  section: 7,
  city: 8,
  country: 9,
};
let importId = "";
let fileKey = "";

describe("import des membres (ADH-07, ADH-08)", () => {
  it("démarre depuis un fichier déposé : en-têtes, premières lignes, colonnes reconnues", async () => {
    const f = await upload(A, national.id, csv());
    fileKey = f.key;
    const r = await call("POST", "/member-imports", national.token, { fileId: f.id });
    expect(r.statusCode).toBe(201);
    importId = r.json().id;
    const got = (await call("GET", `/member-imports/${importId}`, national.token)).json();
    expect(got.state).toBe("mapping");
    expect(got.table.rows).toBe(11);
    expect(got.settings.mapping).toEqual(MAPPING);
    // Le fichier d'un autre responsable ne se démarre pas.
    expect((await call("POST", "/member-imports", chef.token, { fileId: f.id })).statusCode).toBe(404);
  });

  it("aperçu : erreurs, avertissements, zones inconnues, doublons du fichier et de la base", async () => {
    const r = await call("PUT", `/member-imports/${importId}/settings`, national.token, { mapping: MAPPING });
    expect(r.statusCode).toBe(200);
    const s = r.json();
    expect(s).toMatchObject({ rows: 11, duplicates: 4, duplicatesInFile: 1 });
    expect(s.errors).toEqual({ zone_unknown: 1, name_missing: 1 });
    expect(s.warnings).toEqual({ phone_invalid: 1 });
    expect(s.unknownZones).toEqual([
      expect.objectContaining({ count: 1, label: `Kafou-${tag} / 1re section`, example: 3 }),
    ]);
    expect(s.quota).toBeNull();

    const dups = (await call("GET", `/member-imports/${importId}/rows?kind=duplicates`, national.token)).json();
    const byLine = Object.fromEntries(
      dups.rows.map((x: { line: number; duplicate: { reason: string } }) => [x.line, x.duplicate.reason]),
    );
    expect(byLine).toEqual({ 5: "phone", 6: "identity", 7: "name_birth", 8: "file" });
    expect(dups.rows.find((x: { line: number }) => x.line === 5).duplicate.member.name).toBe("marie Test");
    expect(dups.rows.every((x: { decision: string }) => x.decision === "skip")).toBe(true);
  });

  it("la pièce d'identité n'apparaît jamais en clair : ni réponse, ni ligne figée, ni rapport", async () => {
    for (const url of [`/member-imports/${importId}/rows`, `/member-imports/${importId}/report.csv`])
      expect((await call("GET", url, national.token)).body).not.toContain(NIN);
    const [row] =
      await owner`select data::text as d from member_import_rows where import_id = ${importId} and line = 6`;
    expect(row!.d).not.toContain(NIN);
    expect(row!.d).toContain("sealed");
  });

  it("une zone inconnue se corrige une fois pour toutes ses lignes", async () => {
    const s = (await call("GET", `/member-imports/${importId}`, national.token)).json().report.summary;
    const s2 = (
      await call("PUT", `/member-imports/${importId}/settings`, national.token, {
        mapping: MAPPING,
        zoneFixes: { [s.unknownZones[0].key]: "HT0114-02" },
      })
    ).json();
    expect(s2.errors).toEqual({ name_missing: 1 });
    expect(s2.unknownZones).toEqual([]);
  });

  it("un responsable de commune n'importe que dans sa commune", async () => {
    const f = await upload(A, chef.id, csv());
    const id = (await call("POST", "/member-imports", chef.token, { fileId: f.id })).json().id;
    const s = (await call("PUT", `/member-imports/${id}/settings`, chef.token, { mapping: MAPPING })).json();
    // Max (Saint-Marc) et Nadia (Miami) sont hors de sa commune.
    expect(s.errors.zone_outside_scope).toBe(2);
    // Il ne voit pas l'import du national.
    expect((await call("GET", `/member-imports/${importId}`, chef.token)).statusCode).toBe(404);
  });

  it("fusion choisie ligne par ligne ; une ligne bloquée reste rejetée", async () => {
    const merge = await call("POST", `/member-imports/${importId}/decisions`, national.token, {
      decision: "merge",
      lines: [5, 4],
    });
    expect(merge.json()).toEqual({ updated: 1 });
    const create = await call("POST", `/member-imports/${importId}/decisions`, national.token, {
      decision: "create",
      lines: [6],
    });
    expect(create.json()).toEqual({ updated: 0 }); // doublon de la base : fusion ou rejet seulement
  });

  it("exécution par le worker : membres validés, fusion sans rien écraser, fichier supprimé, audit", async () => {
    expect((await call("POST", `/member-imports/${importId}/run`, national.token)).statusCode).toBe(202);
    expect(
      (await call("PUT", `/member-imports/${importId}/settings`, national.token, { mapping: MAPPING })).statusCode,
    ).toBe(409);
    const done = await imports.process(A);
    expect(done).toEqual({ rows: 11, imports: 1 });
    const imp = (await call("GET", `/member-imports/${importId}`, national.token)).json();
    expect(imp.state).toBe("done");
    // Rose, Jean (zone corrigée), Paul (sans téléphone), Nadia, Ana, Max ; Marie fusionnée ; 4 écartées.
    expect(imp.report.result).toEqual({ created: 6, merged: 1, skipped: 4 });

    const created =
      await owner`select first_name, last_name, phone_e164, application_state, is_diaspora, residence_country, user_id, member_number
      from members where party_id = ${A} and first_name in ('Rose', 'Jean', 'Paul', 'Nadia', 'Ana', 'Max') order by first_name`;
    expect(created.map((m) => m.first_name)).toEqual(["Ana", "Jean", "Max", "Nadia", "Paul", "Rose"]);
    expect(created.every((m) => m.application_state === "approved" && /^\d{6}$/.test(m.member_number))).toBe(true);
    expect(created.find((m) => m.first_name === "Rose")!.phone_e164).toBe("+50937120001");
    expect(created.find((m) => m.first_name === "Paul")!.phone_e164).toBeNull();
    expect(created.find((m) => m.first_name === "Nadia")).toMatchObject({ is_diaspora: true, residence_country: "US" });
    // Ana : l'adresse appartient à un membre d'une autre organisation ; fiche sans compte, signalée.
    expect(created.find((m) => m.first_name === "Ana")!.user_id).toBeNull();
    const [ana] = await owner`select issues from member_import_rows where import_id = ${importId} and line = 11`;
    expect(ana!.issues).toContain("email_in_use");

    // Marie : le téléphone du fichier ne remplace pas le sien ; la date de naissance manquante est complétée.
    const [m] = await owner`select phone_e164, birth_date::text from members where id = ${marie.id}`;
    expect(m).toEqual({ phone_e164: "+50937000001", birth_date: "1990-03-14" });

    // Le fichier (pièces d'identité en clair) est supprimé du stockage et mis à la corbeille.
    expect(await storage.read(fileKey)).toBeNull();
    const [audits] =
      await owner`select count(*)::int n from audit_log where party_id = ${A} and action in ('members.import.start', 'members.import')`;
    expect(audits!.n).toBe(2);
  });

  it("rejouer le worker ne recrée rien", async () => {
    expect(await imports.process(A)).toEqual({ rows: 0, imports: 0 });
    const [n] = await owner`select count(*)::int n from members where party_id = ${A} and first_name = 'Rose'`;
    expect(n!.n).toBe(1);
  });

  it("un import interrompu reprend sans rejouer les lignes déjà traitées", async () => {
    const f = await upload(
      A,
      national.id,
      `Prénom;Nom;Commune;Section\nAlix;Reprise;${commune};${section1}\nBéa;Reprise;${commune};${section1}\n`,
    );
    const id = (await call("POST", "/member-imports", national.token, { fileId: f.id })).json().id;
    await call("PUT", `/member-imports/${id}/settings`, national.token, {
      mapping: { firstName: 0, lastName: 1, commune: 2, section: 3 },
    });
    await call("POST", `/member-imports/${id}/run`, national.token);
    // Le worker s'est arrêté après la première ligne, puis l'import est resté « running ».
    await owner`update member_import_rows set result = 'created' where import_id = ${id} and line = 2`;
    await owner`update member_imports set state = 'running', updated_at = now() - interval '1 hour' where id = ${id}`;
    expect(await imports.process(A)).toEqual({ rows: 1, imports: 1 });
    const names = await owner`select first_name from members where party_id = ${A} and last_name = 'Reprise'`;
    expect(names.map((r) => r.first_name)).toEqual(["Béa"]);
  });

  it("rapport des lignes à reprendre en CSV, dans la langue de la personne", async () => {
    const r = await app.inject({
      method: "GET",
      url: `/member-imports/${importId}/report.csv`,
      headers: { authorization: `Bearer ${national.token}`, "accept-language": "fr" },
    });
    expect(r.headers["content-type"]).toContain("text/csv");
    expect(r.body).toContain("Prénom ou nom manquant");
    expect(r.body).toContain("Adresse déjà utilisée, fiche créée sans compte");
  });
});

describe("invitations des membres importés (ADH-09)", () => {
  it("par e-mail, envoyées une seule fois par le worker", async () => {
    const r = await call("POST", `/member-imports/${importId}/invitations`, national.token);
    expect(r.json()).toEqual({ queued: 1 });
    expect(await imports.sendInvites(A)).toEqual({ sent: 1 });
    expect(sent.at(-1)).toMatchObject({
      to: `rose-${tag}@import.test`,
      subject: "Parti Import : votre espace de membre",
    });
    expect(sent.at(-1)!.text).toContain(`https://imp-a-${tag}.civora.test`);
    expect(await imports.sendInvites(A)).toEqual({ sent: 0 });
  });

  it("liens WhatsApp prérédigés pour les membres qui ont un téléphone", async () => {
    const r = (await call("GET", `/member-imports/${importId}/whatsapp?lang=ht`, national.token)).json();
    expect(r.total).toBe(2);
    const rose = r.links.find((l: { name: string }) => l.name === "Rose Delva");
    expect(rose.url).toMatch(/^https:\/\/wa\.me\/50937120001\?text=Bonjou%20Rose/);
  });
});

describe("isolation (SEC-01)", () => {
  it("un autre parti ne voit ni l'import ni ses lignes", async () => {
    expect((await call("GET", `/member-imports/${importId}`, other.token)).statusCode).toBe(404);
    expect((await call("GET", `/member-imports/${importId}/rows`, other.token)).statusCode).toBe(404);
    expect((await call("GET", "/member-imports", other.token)).json().imports).toEqual([]);
  });
});
