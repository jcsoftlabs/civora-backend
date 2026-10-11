// FIN-10 : paiement en espèces saisi par un trésorier, reçu numéroté, journal des recettes, idempotence.
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LogEmailSender } from "../src/lib/messaging/email.js";
import { hashToken } from "../src/modules/auth/service.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const tag = A.slice(0, 8);
const email = new LogEmailSender();
const year = new Date().getUTCFullYear();
let app: Awaited<ReturnType<typeof buildApp>>;
let plan = "";
const zone = async (code: string) => (await owner`select id from zones where code = ${code}`)[0]!.id as string;

async function member(first: string, zoneCode: string, locale = "fr") {
  const user = (
    await owner`insert into users (email, locale) values (${`${first}-${randomUUID().slice(0, 6)}-${tag}@example.test`}, ${locale})
    returning id`
  )[0]!.id;
  const id = (
    await owner`insert into members (party_id, user_id, member_number, first_name, last_name, zone_id, application_state, joined_at)
    values (${A}, ${user}, ${String(Math.floor(Math.random() * 1e9))}, ${first}, 'Joseph', ${await zone(zoneCode)}, 'approved', now())
    returning id`
  )[0]!.id as string;
  const token = randomBytes(32).toString("base64url");
  await owner`insert into sessions (party_id, user_id, member_id, token_hash, expires_at)
    values (${A}, ${user}, ${id}, ${hashToken(token)}, now() + interval '1 day')`;
  return { id, token };
}
async function holdPost(memberId: string, permissions: string[], scope: string | null) {
  const organ = (
    await owner`insert into organs (party_id, name, kind) values (${A}, 'Bureau', 'bureau') returning id`
  )[0]!.id;
  const post = (
    await owner`insert into posts (party_id, organ_id, title, permissions, scope_zone_id)
    values (${A}, ${organ}, 'Trésorier', ${permissions}, ${scope ? await zone(scope) : null}) returning id`
  )[0]!.id;
  await owner`insert into post_holders (party_id, post_id, member_id, starts_at) values (${A}, ${post}, ${memberId}, now() - interval '1 hour')`;
}
async function obligation(memberId: string, periodStart: string, amount = "250.00") {
  return (
    await owner`insert into dues_obligations (party_id, member_id, plan_id, period_start, due_date, amount)
    values (${A}, ${memberId}, ${plan}, ${periodStart}, ${periodStart}, ${amount}) returning id`
  )[0]!.id as string;
}
const call = (method: "GET" | "POST", url: string, token: string, payload?: object) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });

let treasurer: Awaited<ReturnType<typeof member>>;
let nordTreasurer: Awaited<ReturnType<typeof member>>;
let marie: Awaited<ReturnType<typeof member>>;
let paul: Awaited<ReturnType<typeof member>>;
const ob = { jan: "", feb: "", mar: "", paul: "" };
let firstReceipt = "";

beforeAll(async () => {
  await owner`insert into parties (id, slug, name) values (${A}, ${"cash-" + tag}, 'Parti Horizon')`;
  plan = (
    await owner`insert into dues_plans (party_id, name, amount, currency, periodicity)
    values (${A}, ${JSON.stringify({ fr: "Cotisation mensuelle", ht: "Kotizasyon chak mwa" })}::jsonb, '250.00', 'HTG', 'monthly') returning id`
  )[0]!.id;
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), { email });
  await app.ready();
  treasurer = await member("tresorier", "HT0114-01");
  await holdPost(treasurer.id, ["payments.recordCash", "payments.read"], "HT0114");
  nordTreasurer = await member("tresnord", "HT0311-01");
  await holdPost(nordTreasurer.id, ["payments.recordCash", "payments.read"], "HT03");
  marie = await member("marie", "HT0114-02", "ht");
  paul = await member("paul", "HT0114-01");
  ob.jan = await obligation(marie.id, "2026-01-05");
  ob.feb = await obligation(marie.id, "2026-02-05");
  ob.mar = await obligation(marie.id, "2026-03-05");
  ob.paul = await obligation(paul.id, "2026-01-05");
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  const userIds = (await owner`select user_id from members where party_id = ${A}`).map((r) => r.user_id);
  for (const t of [
    "audit_log",
    "sessions",
    "receipts",
    "ledger_entries",
    "dues_obligations",
    "payments",
    "dues_plans",
    "post_holders",
    "posts",
    "organs",
    "members",
  ]) {
    await owner.unsafe(`delete from ${t} where party_id = $1`, [A]);
  }
  await owner`delete from parties where id = ${A}`;
  await owner`delete from users where id in ${owner(userIds)}`;
  await owner.end();
  await closeDb();
});

const pay = (token: string, body: object) =>
  call("POST", "/payments/cash", token, { currency: "HTG", clientRef: randomUUID(), ...body });

describe("paiement en espèces (FIN-10)", () => {
  it("encaisse deux mois, émet un reçu numéroté et prévient le membre dans sa langue", async () => {
    const res = await pay(treasurer.token, { memberId: marie.id, obligationIds: [ob.jan, ob.feb], amount: "500.00" });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.receiptNumber).toBe(`${year}-000001`);
    firstReceipt = body.receiptId;
    const paid =
      await owner`select count(*)::int as n from dues_obligations where id in (${ob.jan}, ${ob.feb}) and paid_at is not null and payment_id = ${body.paymentId}`;
    expect(paid[0]?.n).toBe(2);
    expect(email.sent.at(-1)?.subject).toContain(`resi peman nimewo ${year}-000001`);
    expect(email.sent.at(-1)?.text).toContain("500,00 HTG");
    expect(email.sent.at(-1)?.text).toContain("lajan kach");
  });

  it("écrit la recette au journal, dans la zone du membre, et audite la saisie", async () => {
    const [l] =
      await owner`select direction, category, amount::text, currency from ledger_entries where party_id = ${A}`;
    expect(l).toEqual({ direction: "in", category: "cotisation", amount: "500.00", currency: "HTG" });
    const [a] = await owner`select metadata from audit_log where party_id = ${A} and action = 'payment.cash.record'`;
    expect(a?.metadata).toMatchObject({ amount: "500.00", receipt: `${year}-000001` });
  });

  it("une saisie renvoyée (même clientRef) n'est enregistrée qu'une fois", async () => {
    const clientRef = randomUUID();
    const sent = email.sent.length;
    const first = (
      await pay(treasurer.token, { memberId: marie.id, obligationIds: [ob.mar], amount: "250", clientRef })
    ).json();
    const again = (
      await pay(treasurer.token, { memberId: marie.id, obligationIds: [ob.mar], amount: "250", clientRef })
    ).json();
    expect(again).toEqual(first);
    expect(first.receiptNumber).toBe(`${year}-000002`);
    expect(email.sent.length).toBe(sent + 1);
    const [n] = await owner`select count(*)::int as n from payments where party_id = ${A}`;
    expect(n?.n).toBe(2);
  });

  it("refuse un montant différent, une échéance déjà payée ou d'un autre membre, une autre devise", async () => {
    expect(
      (await pay(treasurer.token, { memberId: paul.id, obligationIds: [ob.paul], amount: "200" })).json(),
    ).toMatchObject({ code: "amount_mismatch" });
    expect(
      (await pay(treasurer.token, { memberId: marie.id, obligationIds: [ob.jan], amount: "250" })).json(),
    ).toMatchObject({ code: "obligation_already_paid" });
    expect(
      (await pay(treasurer.token, { memberId: marie.id, obligationIds: [ob.paul], amount: "250" })).json(),
    ).toMatchObject({ code: "obligation_not_found" });
    expect(
      (
        await pay(treasurer.token, { memberId: paul.id, obligationIds: [ob.paul], amount: "250", currency: "USD" })
      ).json(),
    ).toMatchObject({ code: "currency_mismatch" });
  });

  it("un trésorier d'une autre zone ne peut pas encaisser", async () => {
    expect(
      (await pay(nordTreasurer.token, { memberId: paul.id, obligationIds: [ob.paul], amount: "250" })).statusCode,
    ).toBe(403);
  });

  it("deux trésoriers qui encaissent la même échéance au même instant : un seul paiement passe", async () => {
    const [a, b] = await Promise.all([
      pay(treasurer.token, { memberId: paul.id, obligationIds: [ob.paul], amount: "250" }),
      pay(treasurer.token, { memberId: paul.id, obligationIds: [ob.paul], amount: "250" }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    const [n] = await owner`select count(*)::int as n from payments where member_id = ${paul.id}`;
    expect(n?.n).toBe(1);
  });

  it("la même saisie envoyée deux fois au même instant ne crée qu'un paiement", async () => {
    const extra = await obligation(paul.id, "2026-02-05");
    const clientRef = randomUUID();
    const [a, b] = await Promise.all([
      pay(treasurer.token, { memberId: paul.id, obligationIds: [extra], amount: "250", clientRef }),
      pay(treasurer.token, { memberId: paul.id, obligationIds: [extra], amount: "250", clientRef }),
    ]);
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect(a.json()).toEqual(b.json());
  });

  it("le membre est à jour après paiement", async () => {
    const st = (await call("GET", "/members/me/dues", marie.token)).json();
    expect(st.outstanding).toEqual({});
    expect(st.obligations.every((o: { state: string }) => o.state === "paid")).toBe(true);
  });
});

describe("reçus et historique", () => {
  it("le membre lit son reçu et le télécharge en PDF ; un trésorier d'une autre zone, non", async () => {
    const r = (await call("GET", `/receipts/${firstReceipt}`, marie.token)).json();
    expect(r).toMatchObject({
      number: `${year}-000001`,
      amount: "500.00",
      provider: "cash",
      recordedBy: "tresorier Joseph",
    });
    expect(r.lines).toHaveLength(2);
    const pdf = await call("GET", `/receipts/${firstReceipt}/pdf`, marie.token);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    expect((await call("GET", `/receipts/${firstReceipt}`, nordTreasurer.token)).statusCode).toBe(403);
  });

  it("l'historique des paiements suit la portée de la zone", async () => {
    const pv = (await call("GET", "/payments", treasurer.token)).json().payments;
    expect(pv.length).toBe(4);
    expect((await call("GET", "/payments", nordTreasurer.token)).json().payments).toHaveLength(0);
    const own = (await call("GET", `/payments?memberId=${marie.id}`, marie.token)).json().payments;
    expect(own.map((p: { receiptNumber: string }) => p.receiptNumber).sort()).toEqual([
      `${year}-000001`,
      `${year}-000002`,
    ]);
    expect((await call("GET", "/payments", marie.token)).statusCode).toBe(403);
  });

  it("le journal donne le nom du membre et se filtre ; les chiffres du mois suivent la zone", async () => {
    const cash = (await call("GET", "/payments?provider=cash&status=succeeded", treasurer.token)).json().payments;
    expect(cash.length).toBeGreaterThan(0);
    expect(cash.every((p: { provider: string; firstName: string }) => p.provider === "cash" && p.firstName)).toBe(true);
    const oldest = cash.at(-1).createdAt;
    expect(
      (await call("GET", `/payments?before=${encodeURIComponent(oldest)}`, treasurer.token)).json().payments,
    ).toHaveLength(0);

    const sum = (await call("GET", "/payments/summary", treasurer.token)).json();
    const htg = sum.currentMonth.find((r: { currency: string }) => r.currency === "HTG");
    expect(Number(htg.total)).toBeGreaterThan(0);
    expect(htg.count).toBe(cash.length);
    expect(sum.members.upToDate + sum.members.late).toBeGreaterThan(0);
    const nord = (await call("GET", "/payments/summary", nordTreasurer.token)).json();
    expect(nord.currentMonth).toEqual([]);
    expect((await call("GET", "/payments/summary", marie.token)).statusCode).toBe(403);
  });
});

describe("date du reçu", () => {
  it("à l'heure d'Haïti, sur 12 heures : un soir en Haïti n'est pas le lendemain", async () => {
    const { issuedAt } = await import("../src/modules/money/receipt-pdf.js");
    expect(issuedAt("2026-10-12T01:41:00.000Z")).toBe("11 octobre 2026 à 9:41 PM");
    expect(issuedAt("2026-01-15T14:05:00.000Z")).toBe("15 janvier 2026 à 9:05 AM");
  });
});
