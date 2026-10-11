// FIN-01, FIN-12 : paiement mobile vers le compte marchand du parti, avec le faux fournisseur.
// L'état vient toujours du fournisseur : une notification falsifiée ou un montant différent ne soldent rien.
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { PERMISSIONS } from "@civora/shared";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LogEmailSender } from "../src/lib/messaging/email.js";
import { MemoryCredentialStore } from "../src/lib/payments/credentials.js";
import { FakeProvider } from "../src/lib/payments/fake.js";
import { PendingProvider } from "../src/lib/payments/pending.js";
import { hashToken } from "../src/modules/auth/service.js";
import { OnlinePayments } from "../src/modules/money/online.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const B = randomUUID();
const tag = A.slice(0, 8);
const SECRET = "secret-de-test-du-faux-fournisseur";
const fake = new FakeProvider();
const providers = { fake, natcash: new PendingProvider("natcash") };
const credentials = new MemoryCredentialStore({
  "env:FAKE_PARTY_A": { webhookSecret: SECRET },
  "env:NATCASH_PARTY_A": {},
});
const email = new LogEmailSender();
let app: Awaited<ReturnType<typeof buildApp>>;
let plan = "";
const zone = async (code: string) => (await owner`select id from zones where code = ${code}`)[0]!.id as string;

async function member(first: string, party = A) {
  const user = (
    await owner`insert into users (email) values (${`${first}-${randomUUID().slice(0, 6)}-${tag}@example.test`}) returning id`
  )[0]!.id;
  const id = (
    await owner`insert into members (party_id, user_id, member_number, first_name, last_name, zone_id, application_state, joined_at)
    values (${party}, ${user}, ${String(Math.floor(Math.random() * 1e9))}, ${first}, 'Test', ${await zone("HT0114-01")}, 'approved', now())
    returning id`
  )[0]!.id as string;
  const token = randomBytes(32).toString("base64url");
  await owner`insert into sessions (party_id, user_id, member_id, token_hash, expires_at)
    values (${party}, ${user}, ${id}, ${hashToken(token)}, now() + interval '1 day')`;
  return { id, token };
}
async function obligation(memberId: string, periodStart: string) {
  return (
    await owner`insert into dues_obligations (party_id, member_id, plan_id, period_start, due_date, amount)
    values (${A}, ${memberId}, ${plan}, ${periodStart}, ${periodStart}, '250.00') returning id`
  )[0]!.id as string;
}
const call = (method: "GET" | "POST", url: string, token?: string, payload?: object) =>
  app.inject({
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload ? { payload } : {}),
  });
const webhook = (body: object, signature?: string, party = A) => {
  const raw = JSON.stringify(body);
  return app.inject({
    method: "POST",
    url: `/webhooks/fake/${party}`,
    headers: { "content-type": "application/json", "x-fake-signature": signature ?? FakeProvider.sign(SECRET, raw) },
    payload: raw,
  });
};
const checkout = (token: string, obligationIds: string[], provider = "fake", clientRef = randomUUID()) =>
  call("POST", "/payments/checkout", token, { provider, obligationIds, clientRef });

let admin: Awaited<ReturnType<typeof member>>;
let marie: Awaited<ReturnType<typeof member>>;
let paul: Awaited<ReturnType<typeof member>>;
const ob = { jan: "", feb: "", mar: "", apr: "" };
let paymentJan = "";

beforeAll(async () => {
  await owner`insert into parties (id, slug, name) values (${A}, ${"pay-a-" + tag}, 'Parti A'), (${B}, ${"pay-b-" + tag}, 'Parti B')`;
  plan = (
    await owner`insert into dues_plans (party_id, name, amount, currency, periodicity)
    values (${A}, ${JSON.stringify({ fr: "Mensuelle" })}::jsonb, '250.00', 'HTG', 'monthly') returning id`
  )[0]!.id;
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), {
    email,
    paymentProviders: providers,
    credentials,
  });
  await app.ready();
  admin = await member("admin");
  const organ = (
    await owner`insert into organs (party_id, name, kind) values (${A}, 'Bureau', 'bureau') returning id`
  )[0]!.id;
  const post = (
    await owner`insert into posts (party_id, organ_id, title, permissions) values (${A}, ${organ}, 'Président', ${[...PERMISSIONS]}) returning id`
  )[0]!.id;
  await owner`insert into post_holders (party_id, post_id, member_id, starts_at) values (${A}, ${post}, ${admin.id}, now() - interval '1 hour')`;
  marie = await member("marie");
  paul = await member("paul");
  ob.jan = await obligation(marie.id, "2026-01-05");
  ob.feb = await obligation(marie.id, "2026-02-05");
  ob.mar = await obligation(marie.id, "2026-03-05");
  ob.apr = await obligation(marie.id, "2026-04-05");
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  const userIds = (await owner`select user_id from members where party_id in (${A}, ${B})`).map((r) => r.user_id);
  for (const t of [
    "audit_log",
    "sessions",
    "receipts",
    "ledger_entries",
    "dues_obligations",
    "payments",
    "merchant_accounts",
    "dues_plans",
    "post_holders",
    "posts",
    "organs",
    "members",
  ]) {
    await owner.unsafe(`delete from ${t} where party_id in ($1, $2)`, [A, B]);
  }
  await owner`delete from parties where id in (${A}, ${B})`;
  await owner`delete from users where id in ${owner(userIds)}`;
  await owner.end();
  await closeDb();
});

describe("comptes marchands du parti (FIN-12)", () => {
  it("sans compte marchand du parti, aucun paiement mobile n'est possible", async () => {
    expect((await checkout(marie.token, [ob.jan])).json()).toMatchObject({ code: "provider_unavailable" });
  });

  it("seul un responsable national déclare un compte, par référence et jamais par valeur", async () => {
    expect(
      (await call("POST", "/merchant-accounts", marie.token, { provider: "fake", credentialsRef: "env:FAKE_PARTY_A" }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await call("POST", "/merchant-accounts", admin.token, {
          provider: "fake",
          credentialsRef: "client-secret-en-clair",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await call("POST", "/merchant-accounts", admin.token, { provider: "fake", credentialsRef: "env:FAKE_PARTY_A" }))
        .statusCode,
    ).toBe(201);
    const list = (await call("GET", "/merchant-accounts", admin.token)).json().accounts;
    expect(list).toEqual([{ id: expect.any(String), provider: "fake", currency: "HTG", active: true }]);
  });
});

describe("paiement mobile (FIN-01)", () => {
  it("crée un paiement en attente et renvoie le lien du fournisseur", async () => {
    const res = await checkout(marie.token, [ob.jan]);
    expect(res.statusCode).toBe(201);
    expect(res.json().redirectUrl).toContain("fake-pay.invalid");
    paymentJan = res.json().paymentId;
    const [o] = await owner`select paid_at from dues_obligations where id = ${ob.jan}`;
    expect(o?.paid_at).toBeNull();
  });

  it("ne lance pas deux paiements pour la même échéance ; une demande rejouée renvoie la même", async () => {
    expect((await checkout(marie.token, [ob.jan])).json()).toMatchObject({ code: "payment_in_progress" });
    const ref = randomUUID();
    const a = (await checkout(marie.token, [ob.apr], "fake", ref)).json();
    const b = (await checkout(marie.token, [ob.apr], "fake", ref)).json();
    expect(b.paymentId).toBe(a.paymentId);
  });

  it("refuse de payer les échéances d'un autre membre", async () => {
    expect((await checkout(paul.token, [ob.feb])).json()).toMatchObject({ code: "obligation_not_found" });
  });

  it("refuse une notification à la signature falsifiée", async () => {
    expect((await webhook({ orderId: paymentJan }, "0".repeat(64))).statusCode).toBe(401);
  });

  it("une notification authentique ne suffit pas : tant que le fournisseur n'a pas encaissé, rien n'est soldé", async () => {
    expect((await webhook({ orderId: paymentJan })).json()).toEqual({ status: "pending" });
    const [p] = await owner`select status from payments where id = ${paymentJan}`;
    expect(p?.status).toBe("pending");
  });

  it("après encaissement chez le fournisseur, la notification solde le paiement : reçu, journal, échéance payée", async () => {
    fake.complete(paymentJan, "succeeded");
    expect((await webhook({ orderId: paymentJan })).json()).toEqual({ status: "succeeded" });
    const [o] = await owner`select paid_at, payment_id from dues_obligations where id = ${ob.jan}`;
    expect(o?.payment_id).toBe(paymentJan);
    const [r] = await owner`select number from receipts where payment_id = ${paymentJan}`;
    expect(r?.number).toMatch(/^\d{4}-000001$/);
    const [l] = await owner`select amount::text from ledger_entries where payment_id = ${paymentJan}`;
    expect(l?.amount).toBe("250.00");
    expect((await call("GET", `/payments/${paymentJan}/status`, marie.token)).json()).toMatchObject({
      status: "succeeded",
      provider: "fake",
    });
  });

  it("une notification reçue deux fois ne solde qu'une fois", async () => {
    await webhook({ orderId: paymentJan });
    await webhook({ transactionId: `fake-${paymentJan.slice(0, 8)}` });
    const [n] = await owner`select count(*)::int as n from receipts where payment_id = ${paymentJan}`;
    expect(n?.n).toBe(1);
  });

  it("un montant différent chez le fournisseur ne solde rien et alerte le trésorier", async () => {
    const id = (await checkout(marie.token, [ob.feb])).json().paymentId;
    fake.complete(id, "succeeded", "1.00");
    expect((await webhook({ orderId: id })).json()).toEqual({ status: "pending" });
    const [p] = await owner`select status, provider_status from payments where id = ${id}`;
    expect(p).toEqual({ status: "pending", provider_status: "anomaly" });
    const [a] = await owner`select metadata from audit_log where party_id = ${A} and action = 'payment.anomaly'`;
    expect(a?.metadata).toMatchObject({ expected: "250.00", received: "1.00" });
    const [o] = await owner`select paid_at from dues_obligations where id = ${ob.feb}`;
    expect(o?.paid_at).toBeNull();
  });

  it("la vérification périodique solde un paiement dont la notification n'est jamais arrivée", async () => {
    const id = (await checkout(marie.token, [ob.mar])).json().paymentId;
    fake.complete(id, "succeeded");
    const reconciler = new OnlinePayments({ providers, credentials, publicUrl: "http://localhost", log: app.log });
    const out = await reconciler.reconcile(A, 0);
    expect(out.succeeded).toBeGreaterThanOrEqual(1);
    const [p] = await owner`select status from payments where id = ${id}`;
    expect(p?.status).toBe("succeeded");
  });

  it("un paiement refusé libère l'échéance, qui redevient payable", async () => {
    const pending = (
      await owner`select id from payments where party_id = ${A} and status = 'pending' and ${ob.apr} = any(obligation_ids)`
    )[0]!.id;
    fake.complete(pending, "failed");
    expect((await call("POST", `/payments/${pending}/check`, marie.token)).json()).toEqual({ status: "failed" });
    expect((await checkout(marie.token, [ob.apr])).statusCode).toBe(201);
  });

  it("le retour du navigateur relit l'état chez le fournisseur", async () => {
    const res = await call("GET", `/payments/return/${A}/${paymentJan}`);
    expect(res.json()).toEqual({ status: "succeeded" });
  });

  it("un fournisseur sans accès développeur (NatCash) reste indisponible", async () => {
    await call("POST", "/merchant-accounts", admin.token, {
      provider: "natcash",
      credentialsRef: "env:NATCASH_PARTY_A",
    });
    const may = await obligation(marie.id, "2026-05-05");
    expect((await checkout(marie.token, [may], "natcash")).json()).toMatchObject({ code: "provider_unavailable" });
  });

  it("une notification adressée à un autre parti ne trouve pas le paiement", async () => {
    const res = await webhook({ orderId: paymentJan }, undefined, B);
    expect(res.statusCode).toBe(400); // le parti B n'a pas de compte marchand : rien n'est lu
  });
});
