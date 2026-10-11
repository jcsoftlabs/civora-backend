// ORG-01 à ORG-04, SOC-06, SEC-05 : organes rattachés au territoire, profondeur selon le palier, postes libres,
// anti-élévation de privilèges, droits transmis au successeur. Sessions réelles : les droits viennent des postes.
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { PERMISSIONS } from "@civora/shared";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { hashToken } from "../src/modules/auth/service.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const tag = A.slice(0, 8);
let app: Awaited<ReturnType<typeof buildApp>>;
const created = { users: [] as string[] };

async function zoneId(code: string) {
  return (await owner`select id from zones where code = ${code}`)[0]!.id as string;
}

/** Membre approuvé, localisé à Pétion-Ville, avec une session active (2FA validée). */
async function member(label: string, state = "approved") {
  const user = (await owner`insert into users (email) values (${`${label}-${tag}@example.test`}) returning id`)[0]!.id;
  created.users.push(user);
  const id = (
    await owner`insert into members (party_id, user_id, member_number, first_name, last_name, zone_id, application_state)
    values (${A}, ${user}, ${label}, ${label}, 'Test', ${await zoneId("HT0114")}, ${state}) returning id`
  )[0]!.id as string;
  const token = randomBytes(32).toString("base64url");
  await owner`insert into sessions (party_id, user_id, member_id, token_hash, expires_at)
    values (${A}, ${user}, ${id}, ${hashToken(token)}, now() + interval '1 day')`;
  return { id, token };
}

/** Poste attribué directement en base (préparation des acteurs du test). */
async function grant(memberId: string, permissions: string[], scope: string | null) {
  const zone = scope ? await zoneId(scope) : null;
  const organ = (
    await owner`insert into organs (party_id, name, kind, zone_id) values (${A}, ${"Fixture " + randomUUID()}, 'bureau', ${zone})
    returning id`
  )[0]!.id;
  const post = (
    await owner`insert into posts (party_id, organ_id, title, permissions, scope_zone_id)
    values (${A}, ${organ}, 'Fixture', ${permissions}, ${zone}) returning id`
  )[0]!.id;
  await owner`insert into post_holders (party_id, post_id, member_id, starts_at) values (${A}, ${post}, ${memberId}, now() - interval '1 hour')`;
  return { organ: organ as string, post: post as string };
}

const call = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, token: string, payload?: object) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });

let president: Awaited<ReturnType<typeof member>>;
let pvCoordinator: Awaited<ReturnType<typeof member>>;
let simpleMember: Awaited<ReturnType<typeof member>>;
let treasurerA: Awaited<ReturnType<typeof member>>;
let treasurerB: Awaited<ReturnType<typeof member>>;
let pending: Awaited<ReturnType<typeof member>>;

beforeAll(async () => {
  await owner`insert into parties (id, slug, name, tier) values (${A}, ${"org-" + tag}, 'Parti test', 'essentiel')`;
  president = await member("president");
  pvCoordinator = await member("coordpv");
  simpleMember = await member("membre");
  treasurerA = await member("tresA");
  treasurerB = await member("tresB");
  pending = await member("attente", "pending");
  await grant(president.id, [...PERMISSIONS], null);
  await grant(pvCoordinator.id, ["organs.manage", "posts.assign", "members.read", "payments.read"], "HT0114");
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  for (const t of ["audit_log", "sessions", "post_holders", "posts", "organs", "members"]) {
    await owner.unsafe(`delete from ${t} where party_id = $1`, [A]);
  }
  await owner`delete from parties where id = ${A}`;
  await owner`delete from users where id in ${owner(created.users)}`;
  await owner.end();
  await closeDb();
});

describe("organes et territoire (ORG-01, ORG-03)", () => {
  let ouest = "";
  let pv = "";

  it("refuse un organe départemental au palier Essentiel et donne le palier requis", async () => {
    const res = await call("POST", "/organs", president.token, {
      name: "Coordination Ouest",
      kind: "coordination",
      zoneCode: "HT01",
    });
    expect(res.statusCode).toBe(402);
    expect(res.json()).toMatchObject({ code: "zone_level_not_in_plan", requiredTier: "mouvement" });
  });

  it("l'accepte au palier Mouvement, sans redéploiement", async () => {
    await owner`update parties set tier = 'mouvement' where id = ${A}`;
    app.entitlements.invalidate(A);
    const res = await call("POST", "/organs", president.token, {
      name: "Coordination Ouest",
      kind: "coordination",
      zoneCode: "HT01",
    });
    expect(res.statusCode).toBe(201);
    ouest = res.json().id;
  });

  it("rattache une section communale à sa coordination, dans la même zone", async () => {
    const res = await call("POST", "/organs", president.token, {
      name: "Section Pétion-Ville",
      kind: "section",
      zoneCode: "HT0114",
      parentOrganId: ouest,
    });
    expect(res.statusCode).toBe(201);
    pv = res.json().id;
  });

  it("refuse un sous-organe hors de la zone de son parent", async () => {
    const res = await call("POST", "/organs", president.token, {
      name: "Section Cap",
      kind: "section",
      zoneCode: "HT03",
      parentOrganId: ouest,
    });
    expect(res.json()).toMatchObject({ code: "organ_zone_outside_parent" });
  });

  it("garde les sections communales pour le palier National", async () => {
    const res = await call("POST", "/organs", president.token, {
      name: "Comité de section",
      kind: "comite",
      zoneCode: "HT0114-01",
    });
    expect(res.json()).toMatchObject({ code: "zone_level_not_in_plan", requiredTier: "national" });
  });

  it("un responsable de commune ne crée et ne voit que dans sa zone (SEC-05)", async () => {
    expect(
      (await call("POST", "/organs", pvCoordinator.token, { name: "Section Nord", kind: "section", zoneCode: "HT03" }))
        .statusCode,
    ).toBe(403);
    expect((await call("POST", "/organs", pvCoordinator.token, { name: "National", kind: "bureau" })).statusCode).toBe(
      403,
    );
    const list = (await call("GET", "/organs", pvCoordinator.token)).json().organs as Array<{
      id: string;
      zoneCode: string;
    }>;
    expect(list.map((o) => o.id)).toContain(pv);
    expect(list.map((o) => o.id)).not.toContain(ouest);
    expect(list.every((o) => o.zoneCode === "HT0114")).toBe(true);
  });

  it("un membre sans poste ne voit pas les organes", async () => {
    expect((await call("GET", "/organs", simpleMember.token)).statusCode).toBe(403);
  });

  describe("postes (ORG-02, ORG-04)", () => {
    let treasurerPost = "";

    it("un poste prend la zone de son organe par défaut", async () => {
      const res = await call("POST", `/organs/${pv}/posts`, pvCoordinator.token, {
        title: "Trésorier de section",
        permissions: ["payments.read"],
      });
      expect(res.statusCode).toBe(201);
      treasurerPost = res.json().id;
      const [p] =
        await owner`select z.code from posts p join zones z on z.id = p.scope_zone_id where p.id = ${treasurerPost}`;
      expect(p?.code).toBe("HT0114");
    });

    it("refuse une portée plus large que l'organe", async () => {
      const res = await call("POST", `/organs/${pv}/posts`, president.token, {
        title: "Délégué",
        scopeZoneCode: "HT03",
      });
      expect(res.json()).toMatchObject({ code: "post_scope_outside_organ" });
    });

    it("on ne donne que les droits que l'on détient (anti-élévation)", async () => {
      const res = await call("POST", `/organs/${pv}/posts`, pvCoordinator.token, {
        title: "Super poste",
        permissions: ["members.export"],
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: "privilege_escalation" });
    });

    it("refuse une permission inconnue", async () => {
      const res = await call("POST", `/organs/${pv}/posts`, president.token, {
        title: "X",
        permissions: ["tout.faire"],
      });
      expect(res.json()).toMatchObject({ code: "invalid_request" });
    });

    it("un responsable local ne peut pas modifier un poste qui le dépasse", async () => {
      const presidentPost = (
        await owner`select ph.post_id from post_holders ph where ph.member_id = ${president.id}`
      )[0]!.post_id;
      const res = await call("PATCH", `/posts/${presidentPost}`, pvCoordinator.token, { permissions: [] });
      expect(res.statusCode).toBe(403);
    });

    it("le titulaire reçoit les droits du poste dès l'attribution", async () => {
      const res = await call("POST", `/posts/${treasurerPost}/holders`, pvCoordinator.token, {
        memberId: treasurerA.id,
      });
      expect(res.statusCode).toBe(201);
      const me = (await call("GET", "/auth/me", treasurerA.token)).json();
      expect(me.permissions).toEqual(["payments.read"]);
    });

    it("le successeur reprend les droits, le titulaire précédent les perd (ORG-04)", async () => {
      const res = await call("POST", `/posts/${treasurerPost}/holders`, pvCoordinator.token, {
        memberId: treasurerB.id,
      });
      expect(res.json().replaced).toEqual([treasurerA.id]);
      expect((await call("GET", "/auth/me", treasurerA.token)).json().permissions).toEqual([]);
      expect((await call("GET", "/auth/me", treasurerB.token)).json().permissions).toEqual(["payments.read"]);
      const posts = (await call("GET", `/organs/${pv}/posts`, pvCoordinator.token)).json().posts;
      const holders = posts.find((p: { id: string }) => p.id === treasurerPost).holders;
      expect(holders.map((h: { memberId: string }) => h.memberId)).toEqual([treasurerB.id]);
    });

    it("refuse d'attribuer un poste à une adhésion non validée", async () => {
      const res = await call("POST", `/posts/${treasurerPost}/holders`, pvCoordinator.token, { memberId: pending.id });
      expect(res.json()).toMatchObject({ code: "member_not_eligible" });
    });

    it("la fin de mandat retire les droits immédiatement", async () => {
      const holderId = (
        await owner`select id from post_holders where post_id = ${treasurerPost} and ends_at is null`
      )[0]!.id;
      expect(
        (await call("DELETE", `/posts/${treasurerPost}/holders/${holderId}`, pvCoordinator.token)).statusCode,
      ).toBe(204);
      expect((await call("GET", "/auth/me", treasurerB.token)).json().permissions).toEqual([]);
    });

    it("retirer des droits à un poste exige de les détenir", async () => {
      const res = await call("PATCH", `/posts/${treasurerPost}`, pvCoordinator.token, {
        permissions: ["payments.read", "members.read"],
      });
      expect(res.statusCode).toBe(204);
      expect(
        (await call("PATCH", `/posts/${treasurerPost}`, pvCoordinator.token, { permissions: ["finance.ledger"] }))
          .statusCode,
      ).toBe(403);
    });

    it("chaque changement de titulaire et de droits est au journal d'audit", async () => {
      const logs = await owner`select action, count(*)::int as n from audit_log where party_id = ${A} group by action`;
      const byAction = Object.fromEntries(logs.map((l) => [l.action, l.n]));
      expect(byAction["role.change"]).toBe(3); // A, puis B (remplace A), puis fin de mandat de B
      expect(byAction["post.create"]).toBeGreaterThanOrEqual(1);
      expect(byAction["post.update"]).toBe(1);
      expect(byAction["organ.create"]).toBe(2);
    });
  });
});
