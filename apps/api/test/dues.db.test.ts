// FIN-03, FIN-05 : formules de cotisation, quota du palier, souscriptions, échéances et relevé du membre.
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { PERMISSIONS } from "@civora/shared";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LogEmailSender } from "../src/lib/messaging/email.js";
import { today } from "../src/lib/today.js";
import { hashToken } from "../src/modules/auth/service.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const tag = A.slice(0, 8);
let app: Awaited<ReturnType<typeof buildApp>>;
const zone = async (code: string) => (await owner`select id from zones where code = ${code}`)[0]!.id as string;

async function member(first: string, zoneCode: string, state = "approved") {
  const user = (
    await owner`insert into users (email) values (${`${first}-${randomUUID().slice(0, 6)}-${tag}@example.test`}) returning id`
  )[0]!.id;
  const id = (
    await owner`insert into members (party_id, user_id, member_number, first_name, last_name, zone_id, application_state, joined_at)
    values (${A}, ${user}, ${String(Math.floor(Math.random() * 1e9))}, ${first}, 'Test', ${await zone(zoneCode)}, ${state},
            ${state === "approved" ? new Date() : null}) returning id`
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
    values (${A}, ${organ}, 'Poste', ${permissions}, ${scope ? await zone(scope) : null}) returning id`
  )[0]!.id;
  await owner`insert into post_holders (party_id, post_id, member_id, starts_at) values (${A}, ${post}, ${memberId}, now() - interval '1 hour')`;
}
const call = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, token: string, payload?: object) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });

let president: Awaited<ReturnType<typeof member>>;
let pvTreasurer: Awaited<ReturnType<typeof member>>;
let marie: Awaited<ReturnType<typeof member>>;
let nordMember: Awaited<ReturnType<typeof member>>;
const plans = { standard: "", diaspora: "", fixed: "" };

beforeAll(async () => {
  await owner`insert into parties (id, slug, name, tier) values (${A}, ${"dues-" + tag}, 'Parti test', 'essentiel')`;
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), { email: new LogEmailSender() });
  await app.ready();
  president = await member("president", "HT0114-01");
  await holdPost(president.id, [...PERMISSIONS], null);
  pvTreasurer = await member("tresorier", "HT0114-01");
  await holdPost(pvTreasurer.id, ["dues.manage", "payments.read", "members.approve"], "HT0114");
  marie = await member("marie", "HT0114-01", "pending");
  nordMember = await member("luc", "HT0311-01");
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  const userIds = (await owner`select user_id from members where party_id = ${A}`).map((r) => r.user_id);
  for (const t of [
    "audit_log",
    "sessions",
    "dues_obligations",
    "dues_subscriptions",
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

describe("formules de cotisation (FIN-03)", () => {
  it("un responsable national crée une formule ; un trésorier local, non", async () => {
    const body = {
      name: { fr: "Cotisation annuelle", ht: "Kotizasyon chak ane" },
      amount: "500.00",
      periodicity: "annual",
      isDefault: true,
    };
    expect((await call("POST", "/dues/plans", pvTreasurer.token, body)).statusCode).toBe(403);
    const res = await call("POST", "/dues/plans", president.token, body);
    expect(res.statusCode).toBe(201);
    plans.standard = res.json().id;
  });

  it("valide montants et dates sans flottant", async () => {
    const base = { name: { fr: "X" }, periodicity: "monthly" };
    expect((await call("POST", "/dues/plans", president.token, { ...base, amount: "0" })).statusCode).toBe(400);
    expect((await call("POST", "/dues/plans", president.token, { ...base, amount: "10.555" })).statusCode).toBe(400);
    expect(
      (await call("POST", "/dues/plans", president.token, { ...base, amount: "10", dueRule: "fixed" })).statusCode,
    ).toBe(400);
    expect(
      (
        await call("POST", "/dues/plans", president.token, {
          ...base,
          amount: "10",
          dueRule: "fixed",
          fixedDueDay: "02-30",
        })
      ).statusCode,
    ).toBe(400);
  });

  it("limite le palier Essentiel à 2 formules actives", async () => {
    const res = await call("POST", "/dues/plans", president.token, {
      name: { fr: "Diaspora" },
      amount: "50",
      currency: "USD",
      periodicity: "annual",
    });
    plans.diaspora = res.json().id;
    const third = await call("POST", "/dues/plans", president.token, {
      name: { fr: "Fixe" },
      amount: "1000",
      periodicity: "annual",
      dueRule: "fixed",
      fixedDueDay: "01-31",
    });
    expect(third.statusCode).toBe(402);
    expect(third.json()).toMatchObject({ code: "quota_dues_plans", requiredTier: "mouvement" });
  });

  it("une formule désactivée libère une place", async () => {
    await call("PATCH", `/dues/plans/${plans.diaspora}`, president.token, { active: false });
    const res = await call("POST", "/dues/plans", president.token, {
      name: { fr: "Fixe" },
      amount: "1000",
      periodicity: "annual",
      dueRule: "fixed",
      fixedDueDay: "01-31",
    });
    expect(res.statusCode).toBe(201);
    plans.fixed = res.json().id;
    const visible = (await call("GET", "/dues/plans", nordMember.token)).json().plans.map((p: { id: string }) => p.id);
    expect(visible).not.toContain(plans.diaspora); // un membre ne voit que les formules actives
  });
});

describe("échéances (FIN-05)", () => {
  it("un membre validé suit la formule par défaut, due dès son adhésion", async () => {
    expect((await call("POST", `/applications/${marie.id}/approve`, pvTreasurer.token)).statusCode).toBe(204);
    const st = (await call("GET", "/members/me/dues", marie.token)).json();
    expect(st.obligations).toHaveLength(1);
    expect(st.obligations[0]).toMatchObject({
      planId: plans.standard,
      dueDate: today(),
      amount: "500.00",
      currency: "HTG",
      state: "due",
    });
    expect(st).toMatchObject({ upToDate: true, outstanding: { HTG: "500.00" } });
  });

  it("la génération est idempotente", async () => {
    const first = (await call("POST", "/dues/generate", president.token, {})).json().created;
    const second = (await call("POST", "/dues/generate", president.token, {})).json().created;
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBe(0);
  });

  it("date fixe : la période en cours à l'adhésion, puis chaque 31 janvier ; le retard se voit", async () => {
    // Souscription ancienne, posée en base pour simuler un membre inscrit depuis 2025.
    await owner`insert into dues_subscriptions (party_id, member_id, plan_id, starts_on)
      values (${A}, ${nordMember.id}, ${plans.fixed}, '2025-06-10')`;
    await call("POST", "/dues/generate", president.token, { until: "2026-12-31" });
    const st = (await call("GET", "/members/me/dues", nordMember.token)).json();
    const due = st.obligations.map((o: { periodStart: string; dueDate: string }) => [o.periodStart, o.dueDate]);
    expect(due.slice(0, 2)).toEqual([
      ["2025-01-31", "2025-06-10"],
      ["2026-01-31", "2026-01-31"],
    ]);
    expect(st.obligations[0].state).toBe("late");
    expect(st.upToDate).toBe(false);
    expect(st.outstanding.HTG).toBe(
      `${(1000 * st.obligations.filter((o: { state: string }) => o.state !== "upcoming").length).toFixed(2)}`,
    );
  });

  it("un trésorier de la zone attribue une formule ; hors de sa zone, il ne peut pas", async () => {
    expect(
      (
        await call("POST", `/members/${nordMember.id}/dues-subscriptions`, pvTreasurer.token, {
          planId: plans.standard,
        })
      ).statusCode,
    ).toBe(403);
    expect((await call("GET", `/members/${nordMember.id}/dues`, pvTreasurer.token)).statusCode).toBe(403);
    expect((await call("GET", `/members/${marie.id}/dues`, pvTreasurer.token)).statusCode).toBe(200);
  });

  it("un nouveau montant ne touche que les échéances futures non payées", async () => {
    await owner`insert into dues_obligations (party_id, member_id, plan_id, period_start, due_date, amount)
      values (${A}, ${marie.id}, ${plans.standard}, '2099-01-01', '2099-01-01', '500.00')`;
    expect(
      (await call("PATCH", `/dues/plans/${plans.standard}`, president.token, { amount: "750.00" })).statusCode,
    ).toBe(204);
    const rows =
      await owner`select due_date::text, amount::text from dues_obligations where member_id = ${marie.id} order by due_date`;
    expect(rows).toEqual([
      { due_date: today(), amount: "500.00" },
      { due_date: "2099-01-01", amount: "750.00" },
    ]);
  });

  it("la fin d'une souscription retire les échéances futures, garde l'historique", async () => {
    expect(
      (await call("DELETE", `/members/${marie.id}/dues-subscriptions/${plans.standard}`, pvTreasurer.token)).statusCode,
    ).toBe(204);
    const rows = await owner`select due_date::text from dues_obligations where member_id = ${marie.id}`;
    expect(rows.map((r) => r.due_date)).toEqual([today()]);
  });

  it("chaque changement de formule est au journal", async () => {
    const logs = await owner`select action from audit_log where party_id = ${A} and action like 'dues.%'`;
    const actions = logs.map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["dues.plan.create", "dues.plan.update", "dues.unsubscribe"]));
  });
});
