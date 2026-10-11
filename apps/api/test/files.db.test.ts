// Stockage des fichiers : envoi par URL signée, vérification après envoi, lecture réservée, médias de publication.
// Stockage local (même parcours que R2) dans un dossier temporaire.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LogEmailSender } from "../src/lib/messaging/email.js";
import { LocalStorage } from "../src/lib/storage/local.js";
import { hashToken } from "../src/modules/auth/service.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const tag = A.slice(0, 8);
let root = "";
let storage: LocalStorage;
let app: Awaited<ReturnType<typeof buildApp>>;
const zone = async (code: string) => (await owner`select id from zones where code = ${code}`)[0]!.id as string;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), randomBytes(1000)]);

async function member(first: string, zoneCode: string, permissions: string[] = [], scope: string | null = null) {
  const user = (
    await owner`insert into users (email) values (${`${first}-${randomUUID().slice(0, 6)}-${tag}@example.test`}) returning id`
  )[0]!.id;
  const id = (
    await owner`insert into members (party_id, user_id, member_number, first_name, last_name, zone_id, application_state)
    values (${A}, ${user}, ${String(Math.floor(Math.random() * 1e9))}, ${first}, 'Test', ${await zone(zoneCode)}, 'approved') returning id`
  )[0]!.id as string;
  if (permissions.length) {
    const organ = (
      await owner`insert into organs (party_id, name, kind) values (${A}, 'Bureau', 'bureau') returning id`
    )[0]!.id;
    const post = (
      await owner`insert into posts (party_id, organ_id, title, permissions, scope_zone_id)
      values (${A}, ${organ}, 'Poste', ${permissions}, ${scope ? await zone(scope) : null}) returning id`
    )[0]!.id;
    await owner`insert into post_holders (party_id, post_id, member_id, starts_at) values (${A}, ${post}, ${id}, now() - interval '1 hour')`;
  }
  const token = randomBytes(32).toString("base64url");
  await owner`insert into sessions (party_id, user_id, member_id, token_hash, expires_at) values (${A}, ${user}, ${id}, ${hashToken(token)}, now() + interval '1 day')`;
  return { id, token };
}
const call = (method: "GET" | "POST" | "PUT", url: string, token: string, payload?: object) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });
/** Ce que fait l'application : envoyer le fichier à l'URL signée, avec l'en-tête signé. */
const upload = (url: string, body: Buffer, contentType: string) => {
  const u = new URL(url);
  return app.inject({
    method: "PUT",
    url: u.pathname + u.search,
    headers: { "content-type": contentType },
    payload: body,
  });
};
const fetchUrl = (url: string) => {
  const u = new URL(url);
  return app.inject({ method: "GET", url: u.pathname + u.search });
};

let marie: Awaited<ReturnType<typeof member>>;
let paul: Awaited<ReturnType<typeof member>>;
let pvManager: Awaited<ReturnType<typeof member>>;
let nordManager: Awaited<ReturnType<typeof member>>;
let publisher: Awaited<ReturnType<typeof member>>;
let photoId = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "civora-files-"));
  storage = new LocalStorage(root, "http://localhost:4000");
  await owner`insert into parties (id, slug, name) values (${A}, ${"files-" + tag}, 'Parti test')`;
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), { email: new LogEmailSender(), storage });
  await app.ready();
  marie = await member("marie", "HT0114-01");
  paul = await member("paul", "HT0114-01");
  pvManager = await member("chefpv", "HT0114-01", ["members.read"], "HT0114");
  nordManager = await member("chefnord", "HT0311-01", ["members.read"], "HT03");
  publisher = await member("editeur", "HT0114-01", ["publications.manage"], null);
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  const userIds = (await owner`select user_id from members where party_id = ${A}`).map((r) => r.user_id);
  for (const t of ["audit_log", "sessions", "publications", "post_holders", "posts", "organs", "members", "files"]) {
    await owner.unsafe(`delete from ${t} where party_id = $1`, [A]);
  }
  await owner`delete from parties where id = ${A}`;
  await owner`delete from users where id in ${owner(userIds)}`;
  await owner.end();
  await closeDb();
  await rm(root, { recursive: true, force: true });
});

const ask = (token: string, body: object) => call("POST", "/files/uploads", token, body);

describe("envoi d'une photo de membre (ADH-01)", () => {
  it("refuse un type ou une taille non admis", async () => {
    expect(
      (
        await ask(marie.token, { purpose: "member_photo", name: "x.pdf", mimeType: "application/pdf", sizeBytes: 100 })
      ).json(),
    ).toMatchObject({ code: "file_type_not_allowed" });
    expect(
      (
        await ask(marie.token, {
          purpose: "member_photo",
          name: "x.png",
          mimeType: "image/png",
          sizeBytes: 6 * 1024 * 1024,
        })
      ).statusCode,
    ).toBe(413);
  });

  it("envoie le fichier à l'URL signée, puis l'API le vérifie et l'accepte", async () => {
    const res = (
      await ask(marie.token, {
        purpose: "member_photo",
        name: "marie.png",
        mimeType: "image/png",
        sizeBytes: PNG.length,
      })
    ).json();
    photoId = res.fileId;
    expect(res.upload).toMatchObject({ method: "PUT", headers: { "content-type": "image/png" } });
    expect((await upload(res.upload.url, PNG, "image/jpeg")).statusCode).toBe(403); // autre type que celui signé
    expect((await upload(res.upload.url, PNG, "image/png")).statusCode).toBe(200);
    expect((await call("POST", `/files/${photoId}/complete`, marie.token)).json()).toEqual({
      fileId: photoId,
      status: "ready",
    });
    const [f] = await owner`select r2_key, upload_status from files where id = ${photoId}`;
    expect(f?.r2_key).toBe(`party/${A}/members/${photoId}`);
  });

  it("refuse un fichier jamais reçu, ou différent de ce qui était annoncé, et le supprime", async () => {
    const missing = (
      await ask(marie.token, { purpose: "member_photo", name: "a.png", mimeType: "image/png", sizeBytes: 10 })
    ).json();
    expect((await call("POST", `/files/${missing.fileId}/complete`, marie.token)).json()).toMatchObject({
      code: "file_not_received",
    });
    const other = (
      await ask(marie.token, { purpose: "member_photo", name: "b.png", mimeType: "image/png", sizeBytes: 10 })
    ).json();
    await upload(other.upload.url, PNG, "image/png"); // plus gros qu'annoncé
    expect((await call("POST", `/files/${other.fileId}/complete`, marie.token)).json()).toMatchObject({
      code: "file_mismatch",
    });
    expect(await storage.head(`party/${A}/members/${other.fileId}`)).toBeNull();
  });

  it("un autre membre ne peut pas finaliser ni utiliser le fichier de Marie", async () => {
    expect((await call("POST", `/files/${photoId}/complete`, paul.token)).statusCode).toBe(404);
    expect((await call("PUT", "/members/me/photo", paul.token, { fileId: photoId })).json()).toMatchObject({
      code: "file_not_ready",
    });
  });

  it("devient la photo du membre ; lecture par le membre et par un responsable de sa zone seulement", async () => {
    expect((await call("PUT", "/members/me/photo", marie.token, { fileId: photoId })).statusCode).toBe(204);
    expect((await call("GET", "/members/me", marie.token)).json().photoFileId).toBe(photoId);
    const own = (await call("GET", `/files/${photoId}/url`, marie.token)).json();
    const got = await fetchUrl(own.url);
    expect(got.statusCode).toBe(200);
    expect(got.rawPayload.equals(PNG)).toBe(true);
    expect((await call("GET", `/files/${photoId}/url`, pvManager.token)).statusCode).toBe(200);
    expect((await call("GET", `/files/${photoId}/url`, nordManager.token)).statusCode).toBe(403);
    expect((await call("GET", `/files/${photoId}/url`, paul.token)).statusCode).toBe(403);
  });

  it("une URL modifiée ou expirée ne donne rien", async () => {
    const { url } = (await call("GET", `/files/${photoId}/url`, marie.token)).json();
    expect((await fetchUrl(url.replace(/sig=[0-9a-f]+/, `sig=${"0".repeat(64)}`))).statusCode).toBe(403);
    const key = `party/${A}/members/${photoId}`;
    const past = Math.floor(Date.now() / 1000) - 10;
    expect(
      (
        await fetchUrl(
          `http://localhost:4000/storage/local/${encodeURIComponent(key)}?exp=${past}&sig=${storage.sign("GET", key, past)}`,
        )
      ).statusCode,
    ).toBe(403);
  });

  it("une nouvelle photo envoie l'ancienne à la corbeille", async () => {
    const res = (
      await ask(marie.token, { purpose: "member_photo", name: "new.png", mimeType: "image/png", sizeBytes: PNG.length })
    ).json();
    await upload(res.upload.url, PNG, "image/png");
    await call("POST", `/files/${res.fileId}/complete`, marie.token);
    await call("PUT", "/members/me/photo", marie.token, { fileId: res.fileId });
    const [old] = await owner`select trashed_at from files where id = ${photoId}`;
    expect(old?.trashed_at).not.toBeNull();
    expect((await call("GET", `/files/${photoId}/url`, marie.token)).statusCode).toBe(404);
  });
});

describe("médias des publications (COM-01)", () => {
  it("seul un éditeur envoie des médias ; un album les montre dans le fil, avec des URL signées", async () => {
    expect(
      (await ask(marie.token, { purpose: "publication_media", name: "a.png", mimeType: "image/png", sizeBytes: 10 }))
        .statusCode,
    ).toBe(403);
    const img = (
      await ask(publisher.token, {
        purpose: "publication_media",
        name: "rassemblement.png",
        mimeType: "image/png",
        sizeBytes: PNG.length,
      })
    ).json();
    await upload(img.upload.url, PNG, "image/png");
    const pending = (
      await ask(publisher.token, {
        purpose: "publication_media",
        name: "pas-envoye.png",
        mimeType: "image/png",
        sizeBytes: 10,
      })
    ).json();
    expect(
      (
        await call("POST", "/publications", publisher.token, {
          kind: "album",
          title: { fr: "Album" },
          mediaFileIds: [img.fileId],
        })
      ).json(),
    ).toMatchObject({ code: "file_not_ready" });
    await call("POST", `/files/${img.fileId}/complete`, publisher.token);
    expect(
      (
        await call("POST", "/publications", publisher.token, {
          kind: "album",
          title: { fr: "Album" },
          mediaFileIds: [pending.fileId],
        })
      ).json(),
    ).toMatchObject({ code: "file_not_ready" });
    const pub = (
      await call("POST", "/publications", publisher.token, {
        kind: "album",
        title: { fr: "Album du rassemblement" },
        mediaFileIds: [img.fileId],
      })
    ).json();
    await call("POST", `/publications/${pub.id}/publish`, publisher.token);
    const item = (await call("GET", "/feed", paul.token)).json().items.find((i: { id: string }) => i.id === pub.id);
    expect(item.media).toHaveLength(1);
    expect(item.media[0]).toMatchObject({ id: img.fileId, mimeType: "image/png" });
    expect((await fetchUrl(item.media[0].url)).rawPayload.equals(PNG)).toBe(true);
  });

  it("accepte un podcast audio jusqu'à 100 Mo", async () => {
    const res = await ask(publisher.token, {
      purpose: "publication_media",
      name: "episode.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: 80 * 1024 * 1024,
    });
    expect(res.statusCode).toBe(201);
  });
});
