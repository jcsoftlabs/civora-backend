// Tâches de fond : génération des échéances, vérification des paiements, isolement des erreurs par parti,
// et un aller-retour réel dans la file pg-boss.
import { randomUUID } from "node:crypto";
import PgBoss from "pg-boss";
import pino from "pino";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { createJobServices, FakeProvider, loadConfig, MemoryCredentialStore } from "@civora/api/jobs";
import { generateDues, reconcilePayments } from "../src/jobs.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const log = pino({ level: "silent" });
const fake = new FakeProvider();
const services = createJobServices(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), log, {
  providers: { fake },
  credentials: new MemoryCredentialStore({ "env:FAKE_WORKER": { webhookSecret: "x" } }),
});
const A = randomUUID();
const B = randomUUID();
const tag = A.slice(0, 8);
const ids = { member: "", plan: "", payment: "", memberB: "", paymentB: "" };

async function seedParty(party: string, credentialsRef: string) {
  await owner`insert into parties (id, slug, name) values (${party}, ${"wk-" + party.slice(0, 8)}, 'Parti')`;
  const zone = (await owner`select id from zones where code = 'HT0114-01'`)[0]!.id;
  const member = (
    await owner`insert into members (party_id, member_number, first_name, last_name, zone_id, application_state, joined_at)
    values (${party}, '1', 'Marie', 'Test', ${zone}, 'approved', now()) returning id`
  )[0]!.id as string;
  const plan = (
    await owner`insert into dues_plans (party_id, name, amount, currency, periodicity)
    values (${party}, ${JSON.stringify({ fr: "Mensuelle" })}::jsonb, '100.00', 'HTG', 'monthly') returning id`
  )[0]!.id as string;
  await owner`insert into dues_subscriptions (party_id, member_id, plan_id, starts_on) values (${party}, ${member}, ${plan}, current_date - 40)`;
  const merchant = (
    await owner`insert into merchant_accounts (party_id, provider, credentials_ref, currency)
    values (${party}, 'fake', ${credentialsRef}, 'HTG') returning id`
  )[0]!.id;
  const obligation = (
    await owner`insert into dues_obligations (party_id, member_id, plan_id, period_start, due_date, amount)
    values (${party}, ${member}, ${plan}, '2020-01-01', '2020-01-01', '100.00') returning id`
  )[0]!.id;
  const payment = (
    await owner`insert into payments (party_id, member_id, kind, provider, merchant_account_id, idempotency_key,
      amount, currency, status, obligation_ids, created_at)
    values (${party}, ${member}, 'dues', 'fake', ${merchant}, ${"wk:" + randomUUID()}, '100.00', 'HTG', 'pending', ${[obligation]},
            now() - interval '10 minutes') returning id`
  )[0]!.id as string;
  await fake.createCheckout({}, { orderId: payment, amount: "100.00", currency: "HTG", returnUrl: "x" });
  return { member, plan, payment };
}

beforeAll(async () => {
  const a = await seedParty(A, "env:FAKE_WORKER");
  ids.member = a.member;
  ids.payment = a.payment;
  // Parti B : identifiants marchands introuvables, son erreur ne doit pas bloquer le parti A.
  const b = await seedParty(B, "env:ABSENT");
  ids.paymentB = b.payment;
  fake.complete(a.payment, "succeeded");
  fake.complete(b.payment, "succeeded");
});

afterAll(async () => {
  await owner`set session_replication_role = replica`;
  for (const t of [
    "audit_log",
    "receipts",
    "ledger_entries",
    "dues_obligations",
    "payments",
    "merchant_accounts",
    "dues_subscriptions",
    "dues_plans",
    "members",
  ]) {
    await owner.unsafe(`delete from ${t} where party_id in ($1, $2)`, [A, B]);
  }
  await owner`delete from parties where id in (${A}, ${B})`;
  await owner.end();
  await closeDb();
});

describe("dues.generate", () => {
  it("génère les échéances de chaque parti, puis plus rien au second passage", async () => {
    const first = await generateDues.run(services, log);
    expect(first.created).toBeGreaterThanOrEqual(2);
    const [n] = await owner`select count(*)::int as n from dues_obligations where member_id = ${ids.member}`;
    expect(n?.n).toBeGreaterThanOrEqual(2);
    const second = await generateDues.run(services, log);
    const [m] = await owner`select count(*)::int as n from dues_obligations where member_id = ${ids.member}`;
    expect(m?.n).toBe(n?.n);
    expect(second.errors).toBe(0);
  });
});

describe("payments.reconcile", () => {
  it("solde les paiements encaissés ; l'échec d'un parti n'arrête pas les autres", async () => {
    const out = await reconcilePayments.run(services, log);
    const [a] = await owner`select status from payments where id = ${ids.payment}`;
    const [b] = await owner`select status from payments where id = ${ids.paymentB}`;
    expect(a?.status).toBe("succeeded");
    expect(b?.status).toBe("pending"); // identifiants absents : réessayé au prochain passage
    expect(out.succeeded).toBeGreaterThanOrEqual(1);
    expect(out.parties).toBeGreaterThanOrEqual(2);
  });
});

describe("file pg-boss", () => {
  it("chaque job du worker a sa file créée par les migrations", async () => {
    const { JOB_QUEUES } = await import("@civora/shared");
    const { JOBS } = await import("../src/jobs.js");
    expect(JOBS.map((j) => j.name).sort()).toEqual([...JOB_QUEUES].sort());
  });

  it("exécute un job envoyé dans la file, avec le rôle applicatif et sans droit de structure", async () => {
    const queue = `test.${tag}`;
    // La file de test est créée par le propriétaire, comme le font les migrations.
    const admin = new PgBoss({
      connectionString: process.env.DATABASE_URL_MIGRATOR ?? "",
      schema: "pgboss",
      supervise: false,
      schedule: false,
    });
    await admin.start();
    await admin.createQueue(queue);
    const boss = new PgBoss({ connectionString: process.env.DATABASE_URL ?? "", schema: "pgboss", migrate: false });
    await boss.start();
    const done = new Promise<unknown>((resolve) => {
      void boss.work(queue, async ([job]) => resolve(job?.data));
    });
    await boss.send(queue, { hello: "civora" });
    expect(await done).toEqual({ hello: "civora" });
    await boss.stop({ graceful: false, wait: true });
    // Les jobs terminés restent rattachés à la file : on les retire avant de supprimer la file de test.
    await owner`delete from pgboss.job where name = ${queue}`;
    await admin.deleteQueue(queue);
    await admin.stop({ graceful: false, wait: true });
  });
});
