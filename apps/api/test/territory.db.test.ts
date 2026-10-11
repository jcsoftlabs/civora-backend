// SOC-05 : lecture publique du référentiel territorial.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }));
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

const get = async (url: string) => {
  const res = await app.inject({ url });
  return { status: res.statusCode, body: res.json() };
};

describe("GET /zones", () => {
  it("donne les deux racines sans connexion : Haïti et Diaspora", async () => {
    const { status, body } = await get("/zones");
    expect(status).toBe(200);
    const codes = body.zones.map((z: { code: string }) => z.code);
    expect(codes).toEqual(expect.arrayContaining(["HT", "DIA"]));
  });

  it("donne les 10 départements avec leur nom créole", async () => {
    const { body } = await get("/zones?parent=HT");
    expect(body.zones).toHaveLength(10);
    expect(body.zones).toContainEqual(
      expect.objectContaining({ code: "HT01", name: "Ouest", nameHt: "Lwès", level: "departement", hasChildren: true }),
    );
  });

  it("répond 404 pour un parent inconnu et 400 pour un code mal formé", async () => {
    expect((await get("/zones?parent=HT99")).status).toBe(404);
    expect((await get("/zones?parent=';drop")).status).toBe(400);
  });
});

describe("GET /zones/search", () => {
  it("trouve une commune sans tenir compte des accents ni de la casse", async () => {
    const { body } = await get("/zones/search?q=petion");
    expect(body.zones[0]).toMatchObject({ code: "HT0114", name: "Pétion-Ville", level: "commune" });
  });

  it("cherche aussi par le nom créole", async () => {
    const { body } = await get("/zones/search?q=petyonvil");
    expect(body.zones.map((z: { code: string }) => z.code)).toContain("HT0114");
  });

  it("limite la recherche à un niveau et à une zone", async () => {
    const { body } = await get("/zones/search?q=section&level=section_communale&within=HT0111");
    expect(body.zones.length).toBeGreaterThan(0);
    expect(body.zones.every((z: { code: string }) => z.code.startsWith("HT0111-"))).toBe(true);
  });

  it("trouve les villes de la diaspora", async () => {
    const { body } = await get("/zones/search?q=montreal");
    expect(body.zones[0]).toMatchObject({ code: "DIA-CA-MTL", level: "diaspora_ville" });
  });
});

describe("GET /zones/:code", () => {
  it("donne la zone et son fil d'Ariane", async () => {
    const { body } = await get("/zones/HT0111-01");
    expect(body.zone).toMatchObject({ code: "HT0111-01", level: "section_communale" });
    expect(body.ancestors.map((z: { code: string }) => z.code)).toEqual(["HT", "HT01", "HT0111"]);
  });
});
