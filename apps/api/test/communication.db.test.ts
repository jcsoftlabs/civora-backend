// COM-01 (publications ciblées) et ENG-03 (agenda, inscriptions) : chacun ne voit que ce qui le vise,
// chacun ne publie que dans sa zone.
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { PERMISSIONS } from "@civora/shared";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LogEmailSender } from "../src/lib/messaging/email.js";
import { hashToken } from "../src/modules/auth/service.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const tag = A.slice(0, 8);
let app: Awaited<ReturnType<typeof buildApp>>;
const zone = async (code: string) => (await owner`select id from zones where code = ${code}`)[0]!.id as string;

async function member(first: string, zoneCode: string, extra: { statusId?: string; diaspora?: boolean } = {}) {
  const user = (
    await owner`insert into users (email) values (${`${first}-${randomUUID().slice(0, 6)}-${tag}@example.test`}) returning id`
  )[0]!.id;
  const id = (
    await owner`insert into members (party_id, user_id, member_number, first_name, last_name, zone_id, application_state, status_id, is_diaspora)
    values (${A}, ${user}, ${String(Math.floor(Math.random() * 1e9))}, ${first}, 'Test', ${await zone(zoneCode)}, 'approved',
            ${extra.statusId ?? null}, ${extra.diaspora ?? false}) returning id`
  )[0]!.id as string;
  const token = randomBytes(32).toString("base64url");
  await owner`insert into sessions (party_id, user_id, member_id, token_hash, expires_at)
    values (${A}, ${user}, ${id}, ${hashToken(token)}, now() + interval '1 day')`;
  return { id, token };
}
async function holdPost(memberId: string, permissions: string[], scope: string | null) {
  const organ = (
    await owner`insert into organs (party_id, name, kind) values (${A}, 'Fixture', 'bureau') returning id`
  )[0]!.id;
  const post = (
    await owner`insert into posts (party_id, organ_id, title, permissions, scope_zone_id)
    values (${A}, ${organ}, 'Poste', ${permissions}, ${scope ? await zone(scope) : null}) returning id`
  )[0]!.id;
  await owner`insert into post_holders (party_id, post_id, member_id, starts_at) values (${A}, ${post}, ${memberId}, now() - interval '1 hour')`;
}
const call = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, token: string, payload?: object) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });

let national: Awaited<ReturnType<typeof member>>;
let pvChief: Awaited<ReturnType<typeof member>>;
let marie: Awaited<ReturnType<typeof member>>;
let paul: Awaited<ReturnType<typeof member>>;
let luc: Awaited<ReturnType<typeof member>>;
let rose: Awaited<ReturnType<typeof member>>;
let militant = "";
let bureau = "";
const pub: Record<string, string> = {};

async function publish(token: string, key: string, body: object, at?: string) {
  const res = await call("POST", "/publications", token, { kind: "announcement", title: { fr: key }, ...body });
  expect(res.statusCode).toBe(201);
  pub[key] = res.json().id;
  expect((await call("POST", `/publications/${pub[key]}/publish`, token, at ? { at } : {})).statusCode).toBe(204);
}
const feedTitles = async (token: string) =>
  ((await call("GET", "/feed", token)).json().items as Array<{ title: { fr: string } }>).map((i) => i.title.fr).sort();

beforeAll(async () => {
  await owner`insert into parties (id, slug, name) values (${A}, ${"com-" + tag}, 'Parti test')`;
  militant = (
    await owner`insert into member_statuses (party_id, label, rank) values (${A}, ${JSON.stringify({ fr: "Militant" })}::jsonb, 1) returning id`
  )[0]!.id;
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), { email: new LogEmailSender() });
  await app.ready();
  national = await member("national", "HT0114-01");
  await holdPost(national.id, [...PERMISSIONS], null);
  pvChief = await member("chefpv", "HT0114-01");
  await holdPost(pvChief.id, ["publications.manage", "events.manage"], "HT0114");
  marie = await member("marie", "HT0114-02", { statusId: militant });
  paul = await member("paul", "HT0114-01");
  luc = await member("luc", "HT0311-01");
  rose = await member("rose", "DIA-US-MIA", { diaspora: true });
  bureau = (
    await owner`insert into organs (party_id, name, kind) values (${A}, 'Bureau politique', 'bureau') returning id`
  )[0]!.id;
  await owner`insert into organ_members (party_id, organ_id, member_id) values (${A}, ${bureau}, ${marie.id})`;
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  const userIds = (await owner`select user_id from members where party_id = ${A}`).map((r) => r.user_id);
  for (const t of [
    "audit_log",
    "sessions",
    "event_registrations",
    "events",
    "publications",
    "organ_members",
    "post_holders",
    "posts",
    "organs",
    "members",
    "member_statuses",
  ]) {
    await owner.unsafe(`delete from ${t} where party_id = $1`, [A]);
  }
  await owner`delete from parties where id = ${A}`;
  await owner`delete from users where id in ${owner(userIds)}`;
  await owner.end();
  await closeDb();
});

describe("publications ciblées (COM-01)", () => {
  it("un responsable de commune ne publie que dans sa commune", async () => {
    const all = await call("POST", "/publications", pvChief.token, { kind: "news", title: { fr: "X" } });
    expect(all.json()).toMatchObject({ code: "audience_outside_scope" });
    const nord = await call("POST", "/publications", pvChief.token, {
      kind: "news",
      title: { fr: "X" },
      audience: { zoneCodes: ["HT03"] },
    });
    expect(nord.json()).toMatchObject({ code: "audience_outside_scope" });
    await publish(pvChief.token, "Pétion-Ville", { audience: { zoneCodes: ["HT0114"] } });
  });

  it("le national publie pour tous, la diaspora, un statut ou un organe, maintenant ou plus tard", async () => {
    await publish(national.token, "Tout le parti", {});
    await publish(national.token, "Diaspora", { audience: { diaspora: true } });
    await publish(national.token, "Militants", { audience: { statusIds: [militant] } });
    await publish(national.token, "Bureau", { audience: { organIds: [bureau] } });
    await publish(national.token, "Plus tard", {}, new Date(Date.now() + 86_400_000).toISOString());
    await call("POST", "/publications", national.token, { kind: "news", title: { fr: "Brouillon" } });
  });

  it("chaque membre ne voit que ce qui le vise ; ni brouillon ni publication programmée", async () => {
    expect(await feedTitles(marie.token)).toEqual(["Bureau", "Militants", "Pétion-Ville", "Tout le parti"].sort());
    expect(await feedTitles(paul.token)).toEqual(["Pétion-Ville", "Tout le parti"].sort());
    expect(await feedTitles(luc.token)).toEqual(["Tout le parti"]);
    expect(await feedTitles(rose.token)).toEqual(["Diaspora", "Tout le parti"].sort());
  });

  it("chaque article est signé du nom de la personne qui l'a rédigé", async () => {
    const items = (await call("GET", "/feed", paul.token)).json().items as Array<{
      title: { fr: string };
      author: string;
    }>;
    expect(Object.fromEntries(items.map((i) => [i.title.fr, i.author]))).toEqual({
      "Pétion-Ville": "chefpv Test",
      "Tout le parti": "national Test",
    });
  });

  it("un responsable local ne modifie pas une publication nationale et ne liste que les siennes", async () => {
    expect(
      (await call("PATCH", `/publications/${pub["Tout le parti"]}`, pvChief.token, { title: { fr: "Pirate" } }))
        .statusCode,
    ).toBe(403);
    const mine = (await call("GET", "/publications", pvChief.token))
      .json()
      .publications.map((p: { id: string }) => p.id);
    expect(mine).toEqual([pub["Pétion-Ville"]]);
    expect((await call("GET", "/publications", marie.token)).statusCode).toBe(403);
  });

  it("une publication retirée disparaît du fil", async () => {
    await call("POST", `/publications/${pub["Militants"]}/unpublish`, national.token);
    expect(await feedTitles(marie.token)).not.toContain("Militants");
  });
});

describe("agenda et inscriptions (ENG-03)", () => {
  const soon = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
  const ev: Record<string, string> = {};
  const titles = async (token: string) =>
    ((await call("GET", "/events", token)).json().events as Array<{ title: { fr: string } }>)
      .map((e) => e.title.fr)
      .sort();

  it("crée les événements dans sa zone, pas au-delà", async () => {
    expect(
      (
        await call("POST", "/events", pvChief.token, {
          kind: "congres",
          title: { fr: "X" },
          startsAt: soon(24),
          endsAt: soon(26),
        })
      ).statusCode,
    ).toBe(403);
    const r = await call("POST", "/events", pvChief.token, {
      kind: "rassemblement",
      title: { fr: "Rassemblement de Pétion-Ville" },
      startsAt: soon(48),
      endsAt: soon(50),
      zoneCode: "HT0114",
      address: "Place Saint-Pierre",
      capacity: 1,
    });
    expect(r.statusCode).toBe(201);
    ev.rally = r.json().id;
    ev.congress = (
      await call("POST", "/events", national.token, {
        kind: "congres",
        title: { fr: "Congrès national" },
        startsAt: soon(72),
        endsAt: soon(80),
      })
    ).json().id;
    ev.bureau = (
      await call("POST", "/events", national.token, {
        kind: "reunion",
        title: { fr: "Réunion du bureau" },
        startsAt: soon(30),
        endsAt: soon(31),
        organId: bureau,
      })
    ).json().id;
  });

  it("être membre d'un autre organe ne donne pas accès aux réunions du bureau", async () => {
    const other = (
      await owner`insert into organs (party_id, name, kind) values (${A}, 'Commission jeunesse', 'commission') returning id`
    )[0]!.id;
    await owner`insert into organ_members (party_id, organ_id, member_id) values (${A}, ${other}, ${paul.id})`;
    expect(await titles(paul.token)).not.toContain("Réunion du bureau");
  });

  it("l'agenda de chacun suit sa zone et ses organes", async () => {
    expect(await titles(marie.token)).toEqual(
      ["Congrès national", "Rassemblement de Pétion-Ville", "Réunion du bureau"].sort(),
    );
    expect(await titles(paul.token)).toEqual(["Congrès national", "Rassemblement de Pétion-Ville"].sort());
    expect(await titles(luc.token)).toEqual(["Congrès national"]);
  });

  it("inscription dans la limite des places, sans doublon", async () => {
    expect((await call("POST", `/events/${ev.rally}/registration`, marie.token)).statusCode).toBe(204);
    expect((await call("POST", `/events/${ev.rally}/registration`, marie.token)).statusCode).toBe(204);
    expect((await call("POST", `/events/${ev.rally}/registration`, paul.token)).json()).toMatchObject({
      code: "event_full",
    });
    const rally = (await call("GET", "/events", paul.token))
      .json()
      .events.find((e: { id: string }) => e.id === ev.rally);
    expect(rally).toMatchObject({ registered: 1, placesLeft: 0, isRegistered: false });
  });

  it("un membre hors de la zone ne s'inscrit pas à un événement qu'il ne voit pas", async () => {
    expect((await call("POST", `/events/${ev.rally}/registration`, luc.token)).statusCode).toBe(404);
  });

  it("le responsable voit les inscrits ; un désistement libère la place", async () => {
    const list = (await call("GET", `/events/${ev.rally}/registrations`, pvChief.token)).json().registrations;
    expect(list.map((r: { memberId: string }) => r.memberId)).toEqual([marie.id]);
    expect((await call("GET", `/events/${ev.rally}/registrations`, marie.token)).statusCode).toBe(403);
    expect((await call("DELETE", `/events/${ev.rally}/registration`, marie.token)).statusCode).toBe(204);
    expect((await call("POST", `/events/${ev.rally}/registration`, paul.token)).statusCode).toBe(204);
  });

  it("le responsable retrouve les événements de sa zone, avec le nombre d'inscrits", async () => {
    const pv = (await call("GET", "/events/manage", pvChief.token)).json().events;
    expect(pv.map((e: { id: string }) => e.id)).toEqual([ev.rally]);
    expect(pv[0]).toMatchObject({ zoneCode: "HT0114", registered: 1 });
    const all = (await call("GET", "/events/manage", national.token)).json().events.map((e: { id: string }) => e.id);
    expect(all).toEqual(expect.arrayContaining([ev.rally, ev.congress, ev.bureau]));
    expect((await call("GET", "/events/manage?period=past", national.token)).json().events).toEqual([]);
    expect((await call("GET", "/events/manage", marie.token)).statusCode).toBe(403);
  });

  it("modifie un événement de sa zone ; la capacité ne passe pas sous les inscrits", async () => {
    expect(
      (await call("PATCH", `/events/${ev.rally}`, pvChief.token, { address: "Place Boyer", capacity: 50 })).statusCode,
    ).toBe(204);
    const [row] = await owner`select address, capacity from events where id = ${ev.rally!}`;
    expect(row).toMatchObject({ address: "Place Boyer", capacity: 50 });
    expect((await call("PATCH", `/events/${ev.congress}`, pvChief.token, { address: "X" })).statusCode).toBe(403);
    await owner`insert into event_registrations (party_id, event_id, member_id) values (${A}, ${ev.rally!}, ${luc.id})`;
    expect((await call("PATCH", `/events/${ev.rally}`, pvChief.token, { capacity: 1 })).json()).toMatchObject({
      code: "capacity_below_registered",
    });
    await owner`delete from event_registrations where event_id = ${ev.rally!} and member_id = ${luc.id}`;
  });

  it("deux inscriptions simultanées pour la dernière place : une seule passe", async () => {
    const id = (
      await call("POST", "/events", national.token, {
        kind: "formation",
        title: { fr: "Atelier" },
        startsAt: soon(5),
        endsAt: soon(6),
        capacity: 1,
      })
    ).json().id;
    const [a, b] = await Promise.all([
      call("POST", `/events/${id}/registration`, marie.token),
      call("POST", `/events/${id}/registration`, luc.token),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([204, 409]);
  });
});
