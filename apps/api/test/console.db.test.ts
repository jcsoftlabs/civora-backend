// SOC-10 : console de l'éditeur. Connexion du personnel (code puis double authentification), totaux de la
// plateforme sans aucune donnée de membre, gestion des organisations, rôles propriétaire et support.
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LocalKeyProvider } from "../src/lib/crypto.js";
import { fetchEntitlements } from "../src/lib/entitlements.js";
import { LogEmailSender } from "../src/lib/messaging/email.js";
import { currentStep, totpAt } from "../src/lib/totp.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const tag = randomUUID().slice(0, 8);
const email = new LogEmailSender();
let app: Awaited<ReturnType<typeof buildApp>>;
let ip = 1;
const ownerEmail = `owner-${tag}@example.test`;
const supportEmail = `support-${tag}@example.test`;
const staffIds: string[] = [];
const partyIds: string[] = [];

const call = (method: "GET" | "POST", url: string, token?: string, payload?: object) =>
  app.inject({
    method,
    url,
    remoteAddress: `10.9.0.${ip++ % 250}`,
    headers: token ? { "x-civora-console": token } : {},
    ...(payload ? { payload } : {}),
  });
const lastCode = () => /^(\d{6}) :/.exec(email.sent.at(-1)?.subject ?? "")?.[1] ?? "";

function base32Decode(s: string): Buffer {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/=+$/, "")) bits += A.indexOf(c).toString(2).padStart(5, "0");
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}

/** Connexion complète : code par e-mail, puis double authentification (mise en place au premier passage). */
async function login(address: string) {
  const { challengeId } = (await call("POST", "/console/auth/code", undefined, { email: address })).json();
  const v = (await call("POST", "/console/auth/verify", undefined, { challengeId, code: lastCode() })).json();
  expect(v.mfa).toBe("setup_required");
  const blocked = await call("GET", "/console/overview", v.token);
  expect(blocked.json()).toMatchObject({ code: "mfa_required" });
  const { secret } = (await call("POST", "/console/auth/mfa/setup", v.token)).json();
  const code = totpAt(base32Decode(secret), currentStep());
  expect((await call("POST", "/console/auth/mfa/verify", v.token, { code })).statusCode).toBe(204);
  return v.token as string;
}

let ownerToken = "";
let supportToken = "";
let partyA = "";

beforeAll(async () => {
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), {
    email,
    masterKeys: new LocalKeyProvider([{ id: 1, base64: randomBytes(32).toString("base64") }]),
  });
  await app.ready();
  await owner.begin(async (tx) => {
    await tx`select set_config('app.console', 'on', true)`;
    for (const [address, role] of [
      [ownerEmail, "owner"],
      [supportEmail, "support"],
    ] as const) {
      const [s] =
        await tx`insert into platform_staff (email, name, role) values (${address}, ${role}, ${role}) returning id`;
      staffIds.push(s!.id);
    }
  });
  // Une organisation active avec un membre au nom reconnaissable : il ne doit jamais sortir de la console.
  partyA = randomUUID();
  partyIds.push(partyA);
  await owner`insert into parties (id, slug, name, tier, status) values (${partyA}, ${"console-a-" + tag}, 'Parti Console', 'mouvement', 'active')`;
  const [z] = await owner`select id from zones where code = 'HT0114-01'`;
  await owner`insert into members (party_id, member_number, first_name, last_name, zone_id, application_state, joined_at)
    values (${partyA}, '000001', 'Zéphyrin', 'Secretnom', ${z!.id}, 'approved', now())`;
  await owner`insert into subscriptions (party_id, tier, status, current_period_end)
    values (${partyA}, 'mouvement', 'trial', now() + interval '5 days')`;
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  const slugs = await owner`select id from parties where slug like ${"%" + tag + "%"}`;
  for (const p of [...new Set([...partyIds, ...slugs.map((r) => r.id as string)])]) {
    for (const t of [
      "audit_log",
      "sessions",
      "otp_challenges",
      "subscriptions",
      "post_holders",
      "posts",
      "organs",
      "members",
      "member_statuses",
    ])
      await owner.unsafe(`delete from ${t} where party_id = $1`, [p]);
    await owner`delete from parties where id = ${p}`;
  }
  await owner`delete from users where email like ${"%" + tag + "%"}`;
  for (const t of ["platform_audit_log", "staff_sessions", "staff_challenges"])
    await owner.unsafe(`delete from ${t} where staff_id = any($1::uuid[])`, [staffIds]);
  await owner`delete from platform_audit_log where target_party_id = any(${partyIds}::uuid[])`;
  await owner`delete from platform_staff where id = any(${staffIds}::uuid[])`;
  await owner.end();
  await closeDb();
});

describe("connexion à la console", () => {
  it("une adresse inconnue reçoit la même réponse, sans e-mail", async () => {
    const before = email.sent.length;
    const res = await call("POST", "/console/auth/code", undefined, { email: `inconnu-${tag}@example.test` });
    expect(res.statusCode).toBe(202);
    expect(res.json().challengeId).toBeDefined();
    expect(email.sent.length).toBe(before);
  });

  it("code faux refusé ; code juste, puis double authentification obligatoire", async () => {
    const { challengeId } = (await call("POST", "/console/auth/code", undefined, { email: ownerEmail })).json();
    expect((await call("POST", "/console/auth/verify", undefined, { challengeId, code: "000000" })).statusCode).toBe(
      lastCode() === "000000" ? 200 : 401,
    );
    ownerToken = await login(ownerEmail);
    supportToken = await login(supportEmail);
    expect((await call("GET", "/console/auth/me", ownerToken)).json()).toMatchObject({ role: "owner", mfa: "none" });
  });

  it("une session d'organisation n'ouvre pas la console", async () => {
    const res = await app.inject({ url: "/console/overview", headers: { authorization: `Bearer ${ownerToken}` } });
    expect(res.statusCode).toBe(401);
  });
});

describe("vue d'ensemble et organisations", () => {
  it("donne les totaux de la plateforme, jamais un nom de membre", async () => {
    const res = await call("GET", "/console/overview", ownerToken);
    expect(res.statusCode).toBe(200);
    const o = res.json();
    expect(o.organizations.total).toBeGreaterThanOrEqual(1);
    expect(o.people.members).toBeGreaterThanOrEqual(1);
    expect(o.signupsByWeek).toHaveLength(12);
    expect(o.trialsEndingSoon.map((t: { id: string }) => t.id)).toContain(partyA);
    expect(o.health.database).toBe("ok");
    expect(res.body).not.toContain("Secretnom");
    const list = await call("GET", "/console/organizations", supportToken);
    expect(list.json().organizations.find((x: { id: string }) => x.id === partyA)).toMatchObject({
      tier: "mouvement",
      members: 1,
    });
    expect(list.body).not.toContain("Secretnom");
  });

  it("la fiche donne le contact du fondateur et l'historique de la console", async () => {
    const res = await call("GET", `/console/organizations/${partyA}`, supportToken);
    expect(res.json()).toMatchObject({ id: partyA, founder: { name: "Zéphyrin Secretnom" }, totals: { members: 1 } });
  });
});

describe("gestion des organisations", () => {
  it("le support consulte mais ne change ni formule ni statut", async () => {
    expect(
      (await call("POST", `/console/organizations/${partyA}/tier`, supportToken, { tier: "national" })).statusCode,
    ).toBe(403);
  });

  it("le propriétaire change la formule, prolonge l'essai, suspend puis rétablit", async () => {
    expect(
      (await call("POST", `/console/organizations/${partyA}/tier`, ownerToken, { tier: "national" })).statusCode,
    ).toBe(204);
    expect((await fetchEntitlements(partyA))?.tier).toBe("national");
    const trial = (await call("POST", `/console/organizations/${partyA}/trial`, ownerToken, { days: 30 })).json();
    expect(new Date(trial.endsAt).getTime()).toBeGreaterThan(Date.now() + 30 * 86_400_000);
    expect(
      (
        await call("POST", `/console/organizations/${partyA}/suspension`, ownerToken, {
          suspended: true,
          reason: "Impayé",
        })
      ).statusCode,
    ).toBe(204);
    expect((await fetchEntitlements(partyA))?.suspended).toBe(true);
    await call("POST", `/console/organizations/${partyA}/suspension`, ownerToken, { suspended: false });
    expect((await fetchEntitlements(partyA))?.suspended).toBe(false);
    // L'organisation voit dans son propre journal ce que la plateforme a changé.
    const [a] =
      await owner`select count(*)::int as n from audit_log where party_id = ${partyA} and action like 'platform.%'`;
    expect(a!.n).toBeGreaterThanOrEqual(4);
  });

  it("module Élections réservé aux partis", async () => {
    expect(
      (await call("POST", `/console/organizations/${partyA}/elections`, ownerToken, { months: 6 })).statusCode,
    ).toBe(204);
    await owner`update parties set organization_kind = 'association', elections_module_until = null where id = ${partyA}`;
    expect(
      (await call("POST", `/console/organizations/${partyA}/elections`, ownerToken, { months: 6 })).json(),
    ).toMatchObject({ code: "elections_party_only" });
    await owner`update parties set organization_kind = 'party' where id = ${partyA}`;
  });

  it("crée une organisation à la main : active tout de suite, fondateur invité par e-mail", async () => {
    const res = await call("POST", "/console/organizations", ownerToken, {
      party: { name: "Association de Jacmel", slug: `jacmel-${tag}`, tier: "essentiel", kind: "association" },
      founder: {
        email: `fondatrice-${tag}@example.test`,
        firstName: "Rose",
        lastName: "Michel",
        zoneCode: "HT0114-01",
      },
    });
    expect(res.statusCode).toBe(201);
    partyIds.push(res.json().partyId);
    const [p] = await owner`select status, organization_kind from parties where slug = ${`jacmel-${tag}`}`;
    expect(p).toMatchObject({ status: "active", organization_kind: "association" });
    const invite = email.sent.at(-1)!;
    expect(invite.to).toBe(`fondatrice-${tag}@example.test`);
    expect(invite.text).toContain(`jacmel-${tag}`);
    expect((await call("POST", "/console/organizations", supportToken, {})).statusCode).toBe(403);
  });

  it("active à la main un espace resté en attente", async () => {
    const start = await app.inject({
      method: "POST",
      url: "/parties/signup/start",
      remoteAddress: "10.9.1.1",
      payload: {
        party: { name: "Parti en attente", slug: `attente-${tag}` },
        founder: {
          email: `attente-${tag}@example.test`,
          firstName: "Jean",
          lastName: "Attente",
          zoneCode: "HT0114-01",
        },
      },
    });
    const id = start.json().signupId as string;
    partyIds.push(id);
    expect((await call("POST", `/console/organizations/${id}/activate`, ownerToken)).statusCode).toBe(204);
    const [p] = await owner`select status from parties where id = ${id}`;
    expect(p!.status).toBe("active");
    expect(email.sent.at(-1)!.to).toBe(`attente-${tag}@example.test`);
    expect((await call("POST", `/console/organizations/${id}/activate`, ownerToken)).json()).toMatchObject({
      code: "party_not_pending",
    });
  });
});

describe("équipe et journal", () => {
  it("le propriétaire ajoute un membre du support ; on ne désactive ni soi-même ni le dernier propriétaire", async () => {
    const added = await call("POST", "/console/staff", ownerToken, {
      email: `agent-${tag}@example.test`,
      name: "Agent support",
      role: "support",
    });
    expect(added.statusCode).toBe(201);
    staffIds.push(added.json().id);
    expect(
      (await call("POST", "/console/staff", supportToken, { email: "x@example.test", name: "X", role: "owner" }))
        .statusCode,
    ).toBe(403);
    expect(
      (await call("POST", `/console/staff/${staffIds[0]}/disabled`, ownerToken, { disabled: true })).json(),
    ).toMatchObject({ code: "cannot_disable_self" });
    expect(
      (await call("POST", `/console/staff/${added.json().id}/disabled`, ownerToken, { disabled: true })).statusCode,
    ).toBe(204);
  });

  it("le journal garde chaque action de la console", async () => {
    const entries = (await call("GET", "/console/audit", supportToken)).json().entries as Array<{ action: string }>;
    const actions = entries.map((e) => e.action);
    for (const a of ["console.login", "party.tier", "party.suspend", "party.create", "party.activate", "staff.add"])
      expect(actions).toContain(a);
  });
});
