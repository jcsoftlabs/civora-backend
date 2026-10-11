// ADH-06 (validation, rejet, notation) et ADH-12 (export filtré, limité à la zone, journalisé).
import { randomBytes, randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
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
const tag = A.slice(0, 8);
const email = new LogEmailSender();
const keys = new PartyKeys(new LocalKeyProvider([{ id: 1, base64: randomBytes(32).toString("base64") }]));
let app: Awaited<ReturnType<typeof buildApp>>;
const zoneIds = new Map<string, string>();
const zone = async (code: string) => {
  if (!zoneIds.has(code)) zoneIds.set(code, (await owner`select id from zones where code = ${code}`)[0]!.id);
  return zoneIds.get(code)!;
};

async function member(p: {
  first: string;
  last: string;
  zone: string;
  state?: string;
  locale?: string;
  withUser?: boolean;
}) {
  const user =
    p.withUser === false
      ? null
      : (
          await owner`insert into users (email, locale)
    values (${`${p.first.toLowerCase()}-${randomUUID().slice(0, 6)}-${tag}@example.test`}, ${p.locale ?? "fr"}) returning id`
        )[0]!.id;
  // is_diaspora est déduit de la zone par le service d'adhésion ; la fixture fait de même.
  return (
    await owner`insert into members (party_id, user_id, member_number, first_name, last_name, zone_id, application_state, is_diaspora)
    values (${A}, ${user}, ${String(Math.floor(Math.random() * 1e9))}, ${p.first}, ${p.last}, ${await zone(p.zone)},
            ${p.state ?? "pending"}, ${p.zone.startsWith("DIA")})
    returning id`
  )[0]!.id as string;
}

async function session(permissions: string[], scope: string | null) {
  const id = await member({ first: "Resp", last: "Test", zone: "HT0114-01", state: "approved" });
  const organ = (
    await owner`insert into organs (party_id, name, kind) values (${A}, 'Bureau', 'bureau') returning id`
  )[0]!.id;
  const post = (
    await owner`insert into posts (party_id, organ_id, title, permissions, scope_zone_id)
    values (${A}, ${organ}, 'Poste', ${permissions}, ${scope ? await zone(scope) : null}) returning id`
  )[0]!.id;
  await owner`insert into post_holders (party_id, post_id, member_id, starts_at) values (${A}, ${post}, ${id}, now() - interval '1 hour')`;
  const [m] = await owner`select user_id from members where id = ${id}`;
  const token = randomBytes(32).toString("base64url");
  await owner`insert into sessions (party_id, user_id, member_id, token_hash, expires_at)
    values (${A}, ${m!.user_id}, ${id}, ${hashToken(token)}, now() + interval '1 day')`;
  return token;
}

const call = (method: "GET" | "POST" | "PUT", url: string, token: string, payload?: object) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });

let national = "";
let pvApprover = "";
let nobody = "";
let pvReader = "";
const ids = { pv1: "", pv2: "", nord: "", diaspora: "", injected: "" };

beforeAll(async () => {
  await owner`insert into parties (id, slug, name) values (${A}, ${"val-" + tag}, 'Parti Horizon')`;
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), { keys, email });
  await app.ready();
  national = await session([...PERMISSIONS], null);
  pvApprover = await session(["members.approve", "members.export"], "HT0114");
  nobody = await session([], null);
  pvReader = await session(["members.read"], "HT0114");
  ids.pv1 = await member({ first: "Anne", last: "Pierre", zone: "HT0114-01", locale: "ht" });
  ids.pv2 = await member({ first: "Paul", last: "Jean", zone: "HT0114-02" });
  ids.nord = await member({ first: "Luc", last: "Cap", zone: "HT0311-01" });
  ids.diaspora = await member({ first: "Rose", last: "Miami", zone: "DIA-US-MIA", state: "approved" });
  ids.injected = await member({
    first: "Eve",
    last: '=HYPERLINK("http://x","clic")',
    zone: "HT0114-01",
    state: "approved",
  });
  // Une pièce d'identité chiffrée ne doit jamais apparaître dans un export.
  await owner`insert into member_identities (party_id, member_id, kind, value_encrypted, value_hmac, key_version)
    values (${A}, ${ids.pv1}, 'nif', '\\x00', 'empreinte-0034567890', 1)`;
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  const userIds = (await owner`select user_id from members where party_id = ${A} and user_id is not null`).map(
    (r) => r.user_id,
  );
  for (const t of [
    "audit_log",
    "sessions",
    "dues_obligations",
    "dues_plans",
    "referrals",
    "member_identities",
    "post_holders",
    "posts",
    "organs",
    "members",
  ]) {
    await owner.unsafe(`delete from ${t} where party_id = $1`, [A]);
  }
  await owner`delete from parties where id = ${A}`;
  if (userIds.length) await owner`delete from users where id in ${owner(userIds)}`;
  await owner.end();
  await closeDb();
});

describe("validation des adhésions (ADH-06)", () => {
  it("chaque responsable voit les demandes en attente de sa zone, les plus anciennes d'abord", async () => {
    const pv = (await call("GET", "/applications", pvApprover)).json().applications.map((a: { id: string }) => a.id);
    expect(pv.sort()).toEqual([ids.pv1, ids.pv2].sort());
    const all = (await call("GET", "/applications", national)).json().applications.map((a: { id: string }) => a.id);
    expect(all).toEqual(expect.arrayContaining([ids.pv1, ids.pv2, ids.nord]));
    expect((await call("GET", "/applications", nobody)).statusCode).toBe(403);
  });

  it("note une demande", async () => {
    expect((await call("PUT", `/applications/${ids.pv2}/score`, pvApprover, { score: 72 })).statusCode).toBe(204);
    const list = (await call("GET", "/applications", pvApprover)).json().applications;
    expect(list.find((a: { id: string }) => a.id === ids.pv2).score).toBe(72);
  });

  it("valide une adhésion, prévient le membre dans sa langue et l'inscrit au journal", async () => {
    const before = email.sent.length;
    expect((await call("POST", `/applications/${ids.pv1}/approve`, pvApprover, { score: 90 })).statusCode).toBe(204);
    const [m] =
      await owner`select application_state, joined_at, application_score, member_number from members where id = ${ids.pv1}`;
    expect(m).toMatchObject({ application_state: "approved", application_score: 90 });
    expect(m?.joined_at).not.toBeNull();
    expect(email.sent.length).toBe(before + 1);
    expect(email.sent.at(-1)?.subject).toContain("valide adezyon"); // créole
    expect(email.sent.at(-1)?.text).toContain(m!.member_number);
    expect((await call("POST", `/applications/${ids.pv1}/approve`, pvApprover)).json()).toMatchObject({
      code: "application_already_decided",
    });
  });

  it("rejette sans envoyer le motif, qui reste au journal", async () => {
    await call("POST", `/applications/${ids.pv2}/reject`, pvApprover, {
      reason: "Doublon probable avec une autre fiche",
    });
    expect(email.sent.at(-1)?.text).not.toContain("Doublon");
    const [log] = await owner`select metadata from audit_log where party_id = ${A} and action = 'member.reject'`;
    expect(log?.metadata).toMatchObject({ reason: "Doublon probable avec une autre fiche" });
  });

  it("refuse une décision hors de sa zone", async () => {
    expect((await call("POST", `/applications/${ids.nord}/approve`, pvApprover)).statusCode).toBe(403);
  });
});

describe("export des membres (ADH-12)", () => {
  const exportAs = (token: string, payload: object) => call("POST", "/members/export", token, payload);
  const csvRows = (body: string) =>
    body
      .replace(/^\uFEFF/, "")
      .trim()
      .split("\r\n")
      .map((l) => l.split(";"));

  it("exige la permission d'export", async () => {
    expect((await exportAs(nobody, { format: "csv" })).statusCode).toBe(403);
  });

  it("produit un CSV lisible par Excel en français, limité à la zone de la personne", async () => {
    const res = await exportAs(pvApprover, { format: "csv" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="membres-val-[a-z0-9-]+\.csv"/);
    expect(res.body.startsWith("\uFEFF")).toBe(true);
    const rows = csvRows(res.body);
    expect(rows[0]![0]).toBe("Numéro");
    const names = rows.slice(1).map((r) => r[2]);
    expect(names).toEqual(expect.arrayContaining(["Anne", "Paul", "Eve"]));
    expect(names).not.toContain("Luc"); // Nord : hors de sa zone
    expect(names).not.toContain("Rose"); // diaspora : hors de sa zone
    expect(rows.find((r) => r[2] === "Anne")![5]).toMatch(/^Ouest > Pétion-Ville > .+/);
  });

  it("neutralise les formules et n'exporte jamais de pièce d'identité", async () => {
    const res = await exportAs(national, { format: "csv" });
    expect(res.body).toContain(`"'=HYPERLINK(""http://x"",""clic"")"`);
    expect(res.body).not.toContain("0034567890");
    expect(res.body).not.toContain("empreinte");
  });

  it("applique les filtres, sans jamais dépasser la portée", async () => {
    const approved = csvRows(
      (await exportAs(national, { format: "csv", filters: { state: "approved", diaspora: true } })).body,
    );
    expect(approved.slice(1).map((r) => r[2])).toEqual(["Rose"]);
    // Un responsable de Pétion-Ville qui filtre sur le Nord n'obtient rien.
    const nord = csvRows((await exportAs(pvApprover, { format: "csv", filters: { zoneCode: "HT03" } })).body);
    expect(nord).toHaveLength(1);
  });

  it("produit un classeur Excel et un PDF", async () => {
    const x = await exportAs(national, { format: "xlsx", lang: "ht" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(x.rawPayload as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Membres")!;
    expect(ws.getRow(1).getCell(1).value).toBe("Nimewo");
    expect(ws.rowCount).toBeGreaterThanOrEqual(6);
    const p = await exportAs(national, { format: "pdf" });
    expect(p.headers["content-type"]).toBe("application/pdf");
    expect(p.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("chaque export est au journal, avec filtres et volume, sans donnée de membre", async () => {
    const logs = await owner`select metadata from audit_log where party_id = ${A} and action = 'export.members'`;
    expect(logs.length).toBeGreaterThanOrEqual(5);
    const text = JSON.stringify(logs.map((l) => l.metadata));
    expect(text).toContain('"count"');
    expect(text).not.toContain("Anne");
    expect(text).not.toContain("example.test");
  });
});

describe("liste des membres du back-office", () => {
  type Item = { id: string; firstName: string; lastName: string; parentName: string | null; dues: string[] };
  const list = async (token: string, query = "") => (await call("GET", `/members${query}`, token)).json();
  const names = (r: { items: Item[] }) => r.items.map((i) => i.firstName);

  it("exige members.read et reste dans la zone de la personne", async () => {
    expect((await call("GET", "/members", nobody)).statusCode).toBe(403);
    const pv = await list(pvReader);
    expect(names(pv)).toEqual(expect.arrayContaining(["Anne", "Paul", "Eve"]));
    expect(names(pv)).not.toContain("Luc");
    expect(names(pv)).not.toContain("Rose");
    // Un filtre sur une autre zone ne donne rien de plus.
    expect((await list(pvReader, "?zoneCode=HT03")).items).toHaveLength(0);
  });

  it("cherche par nom, prénom ou numéro, sans interpréter les jokers SQL", async () => {
    expect(names(await list(national, "?q=pierre"))).toEqual(["Anne"]);
    expect(names(await list(national, "?q=anne%20pierre"))).toEqual(["Anne"]);
    const [m] = await owner`select member_number from members where id = ${ids.nord}`;
    expect(names(await list(national, `?q=${m!.member_number}`))).toEqual(["Luc"]);
    expect((await list(national, "?q=%25")).items).toHaveLength(0);
  });

  it("compte chaque onglet d'adhésion et pagine", async () => {
    const all = await list(national, "?limit=2");
    expect(all.items).toHaveLength(2);
    expect(all.total).toBe(all.counts.pending + all.counts.approved + all.counts.rejected);
    const approved = await list(national, "?state=approved&diaspora=true");
    expect(names(approved)).toEqual(["Rose"]);
    expect(approved.total).toBe(1);
    const page2 = await list(national, "?limit=2&page=2");
    expect(page2.items.map((i: Item) => i.id)).not.toContain(all.items[0].id);
  });

  it("donne la commune et les cotisations de l'année, mois par mois", async () => {
    const year = new Date().getUTCFullYear();
    const plan = (
      await owner`insert into dues_plans (party_id, name, amount, currency, periodicity)
      values (${A}, ${JSON.stringify({ fr: "Mensuelle" })}::text::jsonb, 100, 'HTG', 'monthly') returning id`
    )[0]!.id;
    for (const [month, paid] of [
      [1, true],
      [2, false],
    ] as const) {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      await owner`insert into dues_obligations (party_id, member_id, plan_id, period_start, due_date, amount, paid_at)
        values (${A}, ${ids.injected}, ${plan}, ${start}, ${start}, 100, ${paid ? new Date().toISOString() : null})`;
    }
    const eve = (await list(national, "?q=eve")).items[0] as Item;
    expect(eve.parentName).toBe("Pétion-Ville");
    expect(eve.dues).toHaveLength(12);
    expect(eve.dues.slice(0, 2)).toEqual(["paid", new Date() > new Date(`${year}-02-01`) ? "late" : "due"]);
    expect(eve.dues[11]).toBe("none");
  });
});
