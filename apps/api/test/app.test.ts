// SEC-08 : liste blanche des origines (REST et temps réel), en-têtes de sécurité, erreurs sans détail technique,
// journaux sans données personnelles.
import { Writable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import Fastify from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { loggerOptions, stripQuery } from "../src/lib/logger.js";

const ALLOWED = "http://localhost:5173";
const config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", API_ALLOWED_ORIGINS: ALLOWED });

describe("configuration", () => {
  it("refuse l'origine joker", () => {
    expect(() => loadConfig({ API_ALLOWED_ORIGINS: "*" })).toThrow(/jamais \*/);
  });
  it("refuse une origine avec chemin", () => {
    expect(() => loadConfig({ API_ALLOWED_ORIGINS: "https://a.civora.app/admin" })).toThrow();
  });
  it("accepte une liste séparée par des virgules", () => {
    const c = loadConfig({ API_ALLOWED_ORIGINS: "https://a.civora.app, https://b.civora.app" });
    expect(c.API_ALLOWED_ORIGINS).toEqual(["https://a.civora.app", "https://b.civora.app"]);
  });
});

describe("API HTTP", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => {
    app = await buildApp(config);
    app.get("/boom", async () => {
      throw new Error("détail interne : connexion à 10.0.0.3 refusée");
    });
    await app.ready();
  });
  afterAll(() => app.close());

  it("répond sur /health", async () => {
    const res = await app.inject({ url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("renvoie les en-têtes CORS à une origine autorisée", async () => {
    const res = await app.inject({ url: "/health", headers: { origin: ALLOWED } });
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("ne renvoie aucun en-tête CORS à une origine inconnue", async () => {
    const res = await app.inject({ url: "/health", headers: { origin: "https://evil.example" } });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("refuse une origine qui ne fait que contenir une origine autorisée", async () => {
    const res = await app.inject({ url: "/health", headers: { origin: `${ALLOWED}.evil.example` } });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("pose les en-têtes de sécurité", async () => {
    const res = await app.inject({ url: "/health" });
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("renvoie un code stable sur 404", async () => {
    const res = await app.inject({ url: "/inconnu" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: "not_found" });
  });

  it("ne divulgue aucun détail technique sur 500", async () => {
    const res = await app.inject({ url: "/boom" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ code: "internal_error", requestId: expect.any(String) });
    expect(res.body).not.toContain("10.0.0.3");
  });
});

describe("temps réel", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let url: string;
  beforeAll(async () => {
    app = await buildApp(config);
    app.get("/ws-test", { websocket: true }, (socket) => socket.send("ok"));
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    url = `ws://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/ws-test`;
  });
  afterAll(() => app.close());

  const connect = (origin?: string) =>
    new Promise<string>((resolve) => {
      const ws = new WebSocket(url, origin ? { origin } : {});
      ws.on("message", (m) => (resolve(String(m)), ws.close()));
      ws.on("unexpected-response", (_req, res) => resolve(`refus ${res.statusCode}`));
      ws.on("error", () => resolve("erreur"));
    });

  it("accepte une origine autorisée", async () => {
    expect(await connect(ALLOWED)).toBe("ok");
  });
  it("refuse une origine inconnue", async () => {
    expect(await connect("https://evil.example")).toBe("refus 403");
  });
});

describe("journaux", () => {
  it("retire la chaîne de requête", () => {
    expect(stripQuery("/members?phone=50937000000")).toBe("/members");
  });

  it("masque les en-têtes d'authentification et les champs sensibles", async () => {
    const lines: string[] = [];
    const stream = new Writable({ write: (chunk, _e, cb) => (lines.push(String(chunk)), cb()) });
    const app = Fastify({ logger: { ...loggerOptions("info"), stream } });
    app.get("/x", async (req) => {
      req.log.info({ member: { phoneE164: "+50937000000", nin: "0012345678" } }, "test");
      return {};
    });
    await app.inject({ url: "/x?phone=50937000000", headers: { authorization: "Bearer secret-token" } });
    await app.close();
    const all = lines.join("\n");
    expect(all).not.toContain("50937000000");
    expect(all).not.toContain("0012345678");
    expect(all).not.toContain("secret-token");
    expect(all).toContain("[masqué]");
  });
});

describe("adresse IP de la personne (SEC-09)", () => {
  const SECRET = "s".repeat(40);
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => {
    app = await buildApp(
      loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", WEB_SERVER_SECRET: SECRET, TRUST_PROXY_HOPS: "1" }),
    );
    app.get("/ip", async (req) => ({ ip: req.clientIp }));
    await app.ready();
  });
  afterAll(() => app.close());
  const ip = async (headers: Record<string, string>) =>
    (await app.inject({ url: "/ip", remoteAddress: "10.0.0.9", headers })).json().ip;

  it("retient l'adresse ajoutée par le proxy, pas celle que le client prétend", async () => {
    expect(await ip({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" })).toBe("203.0.113.7");
  });
  it("accepte l'adresse transmise par le serveur web avec le secret partagé", async () => {
    expect(await ip({ "x-civora-web": SECRET, "x-civora-client-ip": "198.51.100.4" })).toBe("198.51.100.4");
  });
  it("ignore l'en-tête sans le bon secret ou avec une adresse invalide", async () => {
    expect(await ip({ "x-civora-web": "x".repeat(40), "x-civora-client-ip": "198.51.100.4" })).toBe("10.0.0.9");
    expect(await ip({ "x-civora-client-ip": "198.51.100.4" })).toBe("10.0.0.9");
    expect(await ip({ "x-civora-web": SECRET, "x-civora-client-ip": "pas une ip" })).toBe("10.0.0.9");
  });
  it("exige le secret partagé en production", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/WEB_SERVER_SECRET/);
  });
});
