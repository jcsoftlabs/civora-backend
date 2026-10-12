// ADH-10 : import de l'historique des cotisations sur un vrai Postgres. Membre retrouvé (numéro, téléphone, nom),
// périodes rattachées aux échéances de sa formule, échéances déjà générées soldées, échéances passées créées
// soldées, jamais d'impayé dans le passé ; sans reçu, ni e-mail, ni points ; reprise sans doublon ; droits par zone ;
// réservé aux formules Mouvement et National ; isolation entre partis.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, withParty } from "@civora/db";
import { addMonths, PERMISSIONS } from "@civora/shared";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LocalKeyProvider } from "../src/lib/crypto.js";
import type { EmailMessage, EmailSender } from "../src/lib/messaging/email.js";
import { PartyKeys } from "../src/lib/party-keys.js";
import { LocalStorage } from "../src/lib/storage/local.js";
import { today } from "../src/lib/today.js";
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
const dues = new DuesService();
let storage: LocalStorage;
let app: Awaited<ReturnType<typeof buildApp>>;
let imports: MemberImportService;
const userIds: string[] = [];

async function member(party: string, first: string, zoneCode: string, extra: { number?: string; phone?: string } = {}) {
  const user = (
    await owner`insert into users (email) values (${`${first}-${randomUUID().slice(0, 6)}-${tag}@example.test`}) returning id`
  )[0]!.id;
  userIds.push(user);
  const id = (
    await owner`insert into members (party_id, user_id, member_number, first_name, last_name, zone_id, application_state, phone_e164, joined_at)
    values (${party}, ${user}, ${extra.number ?? String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}, ${first}, 'Test',
      (select id from zones where code = ${zoneCode}), 'approved', ${extra.phone ?? null}, now() - interval '3 months') returning id`
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
async function upload(party: string, by: string, csv: string) {
  const id = randomUUID();
  const key = `party/${party}/imports/${id}`;
  await storage.put(key, Buffer.from(csv), "text/csv");
  await owner`insert into files (id, party_id, r2_key, name, mime_type, size_bytes, purpose, uploaded_by_member_id, upload_status)
    values (${id}, ${party}, ${key}, 'cahier.csv', 'text/csv', ${Buffer.byteLength(csv)}, 'member_import', ${by}, 'ready')`;
  return id;
}
async function importDues(token: string, by: string, csv: string, party = A) {
  const fileId = await upload(party, by, csv);
  const r = await call("POST", "/member-imports", token, { fileId, kind: "dues" });
  return r;
}

let tresorier: Awaited<ReturnType<typeof member>>;
let local: Awaited<ReturnType<typeof member>>;
let marie: Awaited<ReturnType<typeof member>>;
let jean: Awaited<ReturnType<typeof member>>;
let other: Awaited<ReturnType<typeof member>>;
let plan = "";
const start = addMonths(today(), -2);
const ym = (d: string) => `${d.slice(5, 7)}/${d.slice(0, 4)}`;
let importId = "";

beforeAll(async () => {
  await owner`insert into parties (id, slug, name, tier) values (${A}, ${"hist-a-" + tag}, 'Parti Histoire', 'mouvement'), (${B}, ${"hist-b-" + tag}, 'Petit parti', 'essentiel')`;
  storage = new LocalStorage(await mkdtemp(join(tmpdir(), "civora-hist-")), "http://localhost:4000");
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), { email, keys, storage });
  await app.ready();
  imports = new MemberImportService({
    storage,
    keys,
    identity: new IdentityService(keys),
    dues,
    email,
    partyOrigin: "https://{slug}.civora.test",
  });
  tresorier = await member(A, "tresorier", "HT0114-01");
  await holdPost(A, tresorier.id, [...PERMISSIONS], null);
  local = await member(A, "local", "HT0114-01");
  await holdPost(A, local.id, ["payments.recordCash", "members.read"], "HT0114");
  marie = await member(A, "marie", "HT0114-01", { number: "000777", phone: "+50937001111" });
  jean = await member(A, "jean", "HT0311-01");
  await member(A, "paul", "HT0114-01");
  await member(A, "paul", "HT0114-02");
  other = await member(B, "autre", "HT0114-01");
  await holdPost(B, other.id, [...PERMISSIONS], null);
  plan = (
    await owner`insert into dues_plans (party_id, name, amount, currency, periodicity, is_default)
      values (${A}, ${JSON.stringify({ fr: "Mensuelle" })}::text::jsonb, 500, 'HTG', 'monthly', true) returning id`
  )[0]!.id;
  // Marie est dans civora depuis deux mois : ses échéances sont générées, impayées.
  await withParty(A, (tx) => dues.subscribe(tx, A, marie.id, plan, start));
  await withParty(A, (tx) => dues.subscribe(tx, A, jean.id, plan, start));
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  for (const p of [A, B])
    for (const t of [
      "audit_log",
      "ledger_entries",
      "receipts",
      "point_entries",
      "dues_obligations",
      "payments",
      "dues_subscriptions",
      "dues_plans",
      "member_import_rows",
      "member_imports",
      "files",
      "sessions",
      "post_holders",
      "posts",
      "organs",
      "members",
    ])
      await owner.unsafe(`delete from ${t} where party_id = $1`, [p]).catch(() => undefined);
  await owner`delete from parties where id in (${A}, ${B})`;
  await owner`delete from users where id in ${owner(userIds)}`;
  await owner.end();
  await closeDb();
});

describe("historique des cotisations (ADH-10)", () => {
  it("réservé aux formules Mouvement et National", async () => {
    const r = await importDues(other.token, other.id, "Nom;Montant\nAutre Test;500\n", B);
    expect(r.statusCode).toBe(402);
    expect(r.json()).toMatchObject({ code: "feature_not_in_plan" });
  });

  it("aperçu : membre retrouvé, périodes lues, contrôles", async () => {
    expect(await withParty(A, () => Promise.resolve(true))).toBe(true);
    const before = (await call("GET", `/members/${marie.id}/dues`, tresorier.token)).json();
    expect(before.upToDate).toBe(false);
    const csv = [
      "N° de membre;Nom et prénom;Téléphone;Montant;Devise;Date;Période;Mode;Reçu",
      `777;;;1 500;HTG;${start.split("-").reverse().join("/")};${ym(start)}-${ym(addMonths(start, 2))};Espèces;R-0012`,
      `;;3700 1111;6000;gourdes;10/01/2025;2025;MonCash;`,
      `000777;;;500;HTG;${start.split("-").reverse().join("/")};${ym(start)};;`,
      `;Inconnu Personne;;500;;12/02/2025;février 2025;;`,
      `;Paul Test;;500;;12/02/2025;février 2025;;`,
      `777;;;400;HTG;15/03/2024;mars 2024;;`,
      `777;;;20;USD;15/04/2024;avril 2024;;`,
      `777;;;500;;20/05/2024;;;`,
    ].join("\n");
    const r = await importDues(tresorier.token, tresorier.id, csv);
    expect(r.statusCode).toBe(201);
    importId = r.json().id;
    const got = (await call("GET", `/member-imports/${importId}`, tresorier.token)).json();
    expect(got.kind).toBe("dues");
    expect(got.settings.mapping).toEqual({
      memberNumber: 0,
      fullName: 1,
      phone: 2,
      amount: 3,
      currency: 4,
      paidAt: 5,
      period: 6,
      method: 7,
      receiptRef: 8,
    });
    const s = (
      await call("PUT", `/member-imports/${importId}/settings`, tresorier.token, { mapping: got.settings.mapping })
    ).json();
    expect(s).toMatchObject({ rows: 8, valid: 4, duplicates: 1 });
    expect(s.errors).toEqual({ member_not_found: 1, member_ambiguous: 1, currency_mismatch: 1 });
    expect(s.warnings).toEqual({ amount_mismatch: 1, period_from_date: 1 });
    expect(s.totals).toEqual({ HTG: "8400.00" });
    const rows = (await call("GET", `/member-imports/${importId}/rows`, tresorier.token)).json().rows;
    const row = (line: number) => rows.find((x: { line: number }) => x.line === line);
    expect(row(2).payment.periods).toHaveLength(3);
    expect(row(3).payment.periods).toHaveLength(12);
    expect(row(4).duplicate.reason).toBe("file");
  });

  it("exécution : échéances générées soldées, passées créées soldées, aucun impayé dans le passé", async () => {
    expect((await call("POST", `/member-imports/${importId}/run`, tresorier.token)).statusCode).toBe(202);
    expect(await imports.process(A)).toEqual({ rows: 8, imports: 1 });
    const imp = (await call("GET", `/member-imports/${importId}`, tresorier.token)).json();
    expect(imp.report.result).toEqual({ created: 4, skipped: 4 });

    const after = (await call("GET", `/members/${marie.id}/dues`, tresorier.token)).json();
    expect(after.upToDate).toBe(true);
    const [o] = await owner`select count(*) filter (where paid_at is not null)::int paid,
        count(*) filter (where paid_at is null and due_date < ${start})::int past_unpaid
      from dues_obligations where member_id = ${marie.id}`;
    // 3 échéances générées + 12 mois de 2025 + mars et mai 2024.
    expect(o).toEqual({ paid: 17, past_unpaid: 0 });
    const pays =
      await owner`select amount::text, currency, provider, provider_ref, confirmed_at::date::text d, cardinality(obligation_ids)::int n
      from payments where party_id = ${A} order by confirmed_at`;
    expect(pays.map((p) => [p.amount, p.provider, p.n])).toEqual([
      ["400.00", "history", 1],
      ["500.00", "history", 1],
      ["6000.00", "history", 12],
      ["1500.00", "history", 3],
    ]);
    expect(pays.at(-1)!.provider_ref).toBe("R-0012");
    const [l] =
      await owner`select count(*)::int n, min(occurred_at)::date::text first from ledger_entries where party_id = ${A}`;
    expect(l).toEqual({ n: 4, first: "2024-03-15" });
    // Ni reçu civora, ni points, ni e-mail.
    const [side] =
      await owner`select (select count(*)::int from receipts where party_id = ${A}) r, (select count(*)::int from point_entries where party_id = ${A}) p`;
    expect(side).toEqual({ r: 0, p: 0 });
    expect(sent).toEqual([]);
    const [a] =
      await owner`select count(*)::int n from audit_log where party_id = ${A} and action = 'dues.history.import'`;
    expect(a!.n).toBe(1);
  });

  it("rejouer ne paie rien deux fois ; une période déjà payée est écartée", async () => {
    expect(await imports.process(A)).toEqual({ rows: 0, imports: 0 });
    const r = await importDues(
      tresorier.token,
      tresorier.id,
      "N° de membre;Montant;Date;Période\n777;500;10/01/2025;janvier 2025\n",
    );
    const id = r.json().id;
    const got = (await call("GET", `/member-imports/${id}`, tresorier.token)).json();
    const s = (
      await call("PUT", `/member-imports/${id}/settings`, tresorier.token, { mapping: got.settings.mapping })
    ).json();
    expect(s.errors).toEqual({ already_paid: 1 });
    expect((await call("POST", `/member-imports/${id}/run`, tresorier.token)).json()).toMatchObject({
      code: "import_nothing_to_do",
    });
  });

  it("un trésorier de commune n'importe que pour sa commune", async () => {
    const r = await importDues(
      local.token,
      local.id,
      `Nom et prénom;Montant;Période\nJean Test;500;mars 2025\nMarie Test;500;mars 2023\n`,
    );
    const id = r.json().id;
    const got = (await call("GET", `/member-imports/${id}`, local.token)).json();
    const s = (
      await call("PUT", `/member-imports/${id}/settings`, local.token, { mapping: got.settings.mapping })
    ).json();
    expect(s.errors).toEqual({ zone_outside_scope: 1 });
    // L'historique d'un autre ne se lit pas ; les imports de membres non plus sans members.import.
    expect((await call("GET", `/member-imports/${importId}`, local.token)).statusCode).toBe(404);
  });

  it("un autre parti ne voit rien", async () => {
    expect((await call("GET", `/member-imports/${importId}`, other.token)).statusCode).toBe(404);
  });
});
