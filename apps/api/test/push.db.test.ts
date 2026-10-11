// COM-02 : notifications push ciblées, envoyées par le worker, dans la langue de chacun.
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { PERMISSIONS } from "@civora/shared";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LogEmailSender } from "../src/lib/messaging/email.js";
import { LogPushSender } from "../src/lib/messaging/push.js";
import { hashToken } from "../src/modules/auth/service.js";
import { PushService } from "../src/modules/communication/push.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const tag = A.slice(0, 8);
const sender = new LogPushSender();
const push = new PushService(sender);
let app: Awaited<ReturnType<typeof buildApp>>;
const zone = async (code: string) => (await owner`select id from zones where code = ${code}`)[0]!.id as string;

async function member(
  first: string,
  zoneCode: string,
  opts: { locale?: string; state?: string; diaspora?: boolean } = {},
) {
  const user = (
    await owner`insert into users (email, locale) values (${`${first}-${randomUUID().slice(0, 6)}-${tag}@example.test`}, ${opts.locale ?? "fr"})
    returning id`
  )[0]!.id;
  const id = (
    await owner`insert into members (party_id, user_id, member_number, first_name, last_name, zone_id, application_state, is_diaspora)
    values (${A}, ${user}, ${String(Math.floor(Math.random() * 1e9))}, ${first}, 'Test', ${await zone(zoneCode)}, ${opts.state ?? "approved"},
            ${opts.diaspora ?? false}) returning id`
  )[0]!.id as string;
  const token = randomBytes(32).toString("base64url");
  await owner`insert into sessions (party_id, user_id, member_id, token_hash, expires_at)
    values (${A}, ${user}, ${id}, ${hashToken(token)}, now() + interval '1 day')`;
  return { id, token, device: `fcm-${first}-${randomUUID()}` };
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
const call = (method: "GET" | "POST" | "DELETE", url: string, token: string, payload?: object) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });

const people = {} as Record<
  "national" | "chef" | "marie" | "anne" | "luc" | "rose" | "pending",
  Awaited<ReturnType<typeof member>>
>;
const campaigns: Record<string, string> = {};

beforeAll(async () => {
  await owner`insert into parties (id, slug, name) values (${A}, ${"push-" + tag}, 'Parti test')`;
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), {
    email: new LogEmailSender(),
    push: sender,
  });
  await app.ready();
  people.national = await member("national", "HT0114-01");
  await holdPost(people.national.id, [...PERMISSIONS], null);
  people.chef = await member("chef", "HT0114-01");
  await holdPost(people.chef.id, ["outreach.send"], "HT0114");
  people.marie = await member("marie", "HT0114-02");
  people.anne = await member("anne", "HT0114-01", { locale: "ht" });
  people.luc = await member("luc", "HT0311-01");
  people.rose = await member("rose", "DIA-US-MIA", { diaspora: true });
  people.pending = await member("attente", "HT0114-01", { state: "pending" });
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  const userIds = (await owner`select user_id from members where party_id = ${A}`).map((r) => r.user_id);
  for (const t of [
    "audit_log",
    "sessions",
    "push_devices",
    "outreach_campaigns",
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

describe("appareils", () => {
  it("chaque membre enregistre son téléphone", async () => {
    for (const p of Object.values(people)) {
      expect((await call("POST", "/devices", p.token, { token: p.device, platform: "android" })).statusCode).toBe(204);
    }
    // Un jeton invalide (application désinstallée) chez Luc.
    await call("POST", "/devices", people.luc.token, { token: `invalid-${randomUUID()}`, platform: "android" });
    const [n] = await owner`select count(*)::int as n from push_devices where party_id = ${A}`;
    expect(n?.n).toBe(8);
  });
});

describe("portée d'une audience", () => {
  it("compte les membres validés visés et ceux qui ont un téléphone, dans la portée de la personne", async () => {
    const pv = await call("POST", "/audience/estimate", people.chef.token, { audience: { zoneCodes: ["HT0114"] } });
    // national, chef, marie, anne ; la demande en attente n'est pas comptée.
    expect(pv.json()).toEqual({ members: 4, reachable: 4 });
    const dia = await call("POST", "/audience/estimate", people.national.token, { audience: { diaspora: true } });
    expect(dia.json()).toEqual({ members: 1, reachable: 1 });
    expect((await call("POST", "/audience/estimate", people.chef.token, { audience: null })).json()).toMatchObject({
      code: "audience_outside_scope",
    });
  });
});

describe("campagnes push (COM-02)", () => {
  const msg = {
    title: { fr: "Rassemblement samedi", ht: "Rasanbleman samdi" },
    body: { fr: "Rendez-vous à 9 h", ht: "Randevou a 9 è" },
  };

  it("un responsable de commune ne vise que sa commune", async () => {
    expect((await call("POST", "/outreach/push", people.chef.token, msg)).json()).toMatchObject({
      code: "audience_outside_scope",
    });
    const res = await call("POST", "/outreach/push", people.chef.token, {
      ...msg,
      audience: { zoneCodes: ["HT0114"] },
    });
    expect(res.statusCode).toBe(201);
    campaigns.pv = res.json().id;
    campaigns.later = (
      await call("POST", "/outreach/push", people.national.token, {
        ...msg,
        scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
      })
    ).json().id;
  });

  it("le worker envoie aux seuls membres validés de la zone, chacun dans sa langue", async () => {
    const out = await push.dispatchDue(A);
    expect(out).toMatchObject({ campaigns: 1 });
    const fr = sender.sent.find((s) => s.message.title === "Rassemblement samedi")!;
    const ht = sender.sent.find((s) => s.message.title === "Rasanbleman samdi")!;
    expect(new Set(fr.tokens)).toEqual(new Set([people.national.device, people.chef.device, people.marie.device]));
    expect(ht.tokens).toEqual([people.anne.device]);
    const all = sender.sent.flatMap((s) => s.tokens);
    expect(all).not.toContain(people.luc.device); // Nord
    expect(all).not.toContain(people.rose.device); // diaspora
    expect(all).not.toContain(people.pending.device); // adhésion en attente
    const [c] = await owner`select status, sent_count from outreach_campaigns where id = ${campaigns.pv!}`;
    expect(c).toEqual({ status: "sent", sent_count: 4 });
  });

  it("n'envoie jamais deux fois, ni avant l'heure prévue", async () => {
    const before = sender.sent.length;
    expect((await push.dispatchDue(A)).campaigns).toBe(0);
    expect(sender.sent.length).toBe(before);
  });

  it("retire les appareils que FCM déclare invalides", async () => {
    await call("POST", "/outreach/push", people.national.token, { ...msg, audience: { zoneCodes: ["HT03"] } });
    await push.dispatchDue(A);
    const [n] = await owner`select count(*)::int as n from push_devices where member_id = ${people.luc.id}`;
    expect(n?.n).toBe(1);
  });

  it("annule une campagne programmée, pas une campagne déjà envoyée", async () => {
    expect((await call("POST", `/outreach/${campaigns.pv!}/cancel`, people.chef.token)).json()).toMatchObject({
      code: "campaign_not_cancellable",
    });
    expect((await call("POST", `/outreach/${campaigns.later}/cancel`, people.chef.token)).statusCode).toBe(403);
    expect((await call("POST", `/outreach/${campaigns.later}/cancel`, people.national.token)).statusCode).toBe(204);
  });

  it("chaque responsable ne voit que ses campagnes ; l'envoi est au journal", async () => {
    const list = (await call("GET", "/outreach", people.chef.token)).json().campaigns.map((c: { id: string }) => c.id);
    expect(list).toEqual([campaigns.pv]);
    const [a] =
      await owner`select metadata from audit_log where party_id = ${A} and action = 'outreach.push.sent' and target_id = ${campaigns.pv!}`;
    expect(a?.metadata).toMatchObject({ sent: 4, failed: 0 });
  });
});
