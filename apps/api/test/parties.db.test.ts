// SOC-01, SOC-03 : création d'un espace parti en libre-service, identité visuelle.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { PERMISSIONS } from "@civora/shared";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LocalKeyProvider } from "../src/lib/crypto.js";
import { LogEmailSender } from "../src/lib/messaging/email.js";
import { LogSmsSender } from "../src/lib/messaging/sms.js";
import { PartyKeys } from "../src/lib/party-keys.js";
import { LocalStorage } from "../src/lib/storage/local.js";
import { AuthService, hashToken } from "../src/modules/auth/service.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const tag = randomUUID().slice(0, 8);
const slug = `horizon-${tag}`;
const email = new LogEmailSender();
const keys = new PartyKeys(new LocalKeyProvider([{ id: 1, base64: randomBytes(32).toString("base64") }]));
const auth = new AuthService({ secret: randomBytes(32), email, sms: new LogSmsSender(), keys });
let app: Awaited<ReturnType<typeof buildApp>>;
let root = "";
let ip = 1;
const created: string[] = [];
const lastCode = () => /: (\d{6})\n/.exec(email.sent.at(-1)?.text ?? "")?.[1] ?? "";
const post = (url: string, payload: object, token?: string) =>
  app.inject({
    method: "POST",
    url,
    payload,
    remoteAddress: `10.3.0.${ip++ % 250}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
const get = (url: string, token?: string) =>
  app.inject({ url, headers: token ? { authorization: `Bearer ${token}` } : {} });
const signup = (s: string, founderEmail: string, extra: object = {}) =>
  post("/parties/signup/start", {
    party: { name: "Parti Horizon", slug: s, brandColor: "#7A2E5C", tier: "mouvement", ...extra },
    founder: { email: founderEmail, firstName: "Jeanne", lastName: "Fondatrice", zoneCode: "HT0114-01" },
  });

let signupId = "";
let challengeId = "";
let founderToken = "";
let partyId = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "civora-parties-"));
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), {
    auth,
    keys,
    email,
    storage: new LocalStorage(root, "http://localhost:4000"),
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await owner`set session_replication_role = replica`;
  const ids = (await owner`select id from parties where slug like ${"%-" + tag}`).map((r) => r.id);
  const userIds = (await owner`select id from users where email like ${"%-" + tag + "@example.test"}`).map((r) => r.id);
  for (const id of ids) {
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
      "files",
      "party_keys",
    ]) {
      await owner.unsafe(`delete from ${t} where party_id = $1`, [id]);
    }
    await owner`delete from parties where id = ${id}`;
  }
  if (userIds.length) await owner`delete from users where id in ${owner(userIds)}`;
  void created;
  await owner.end();
  await closeDb();
  await rm(root, { recursive: true, force: true });
});

describe("adresse de l'espace", () => {
  it("refuse une adresse mal formée ou réservée, accepte une adresse libre", async () => {
    expect((await get("/parties/slug-availability?slug=Mon%20Parti")).json()).toEqual({
      available: false,
      reason: "invalid",
    });
    expect((await get("/parties/slug-availability?slug=admin")).json()).toEqual({
      available: false,
      reason: "reserved",
    });
    expect((await get(`/parties/slug-availability?slug=${slug}`)).json()).toEqual({ available: true });
  });
});

describe("création d'un espace (SOC-01)", () => {
  it("met l'espace en attente et envoie un code au fondateur", async () => {
    const res = await signup(slug, `jeanne-${tag}@example.test`);
    expect(res.statusCode).toBe(202);
    ({ signupId, challengeId } = res.json());
    expect(email.sent.at(-1)?.subject).toContain("Créez l'espace Parti Horizon");
    const [p] = await owner`select status, languages from parties where id = ${signupId}`;
    expect(p).toEqual({ status: "pending", languages: ["fr", "ht"] });
  });

  it("un espace en attente n'existe pas encore : ni profil public, ni connexion, ni adresse disponible", async () => {
    expect((await get(`/parties/${slug}/public`)).statusCode).toBe(404);
    const before = email.sent.length;
    await post("/auth/otp/request", { partySlug: slug, channel: "email", destination: `jeanne-${tag}@example.test` });
    expect(email.sent.length).toBe(before);
    expect((await signup(slug, `autre-${tag}@example.test`)).json()).toMatchObject({ code: "slug_taken" });
  });

  it("refuse un mauvais code", async () => {
    expect((await post("/parties/signup/complete", { signupId, challengeId, code: "000000" })).statusCode).toBe(401);
  });

  it("ouvre l'espace : fondateur 000001, bureau national, président avec tous les droits, essai de 30 jours", async () => {
    const code = /: (\d{6})\n/.exec(email.sent.find((m) => m.subject.includes("Créez l'espace"))!.text)![1]!;
    const res = await post("/parties/signup/complete", { signupId, challengeId, code });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ slug, mfa: "setup_required" });
    founderToken = body.token;
    partyId = signupId;
    const [p] = await owner`select status, activated_at, signup_draft, tier from parties where id = ${partyId}`;
    expect(p).toMatchObject({ status: "active", signup_draft: null, tier: "mouvement" });
    const [m] =
      await owner`select member_number, application_state, first_name from members where party_id = ${partyId}`;
    expect(m).toEqual({ member_number: "000001", application_state: "approved", first_name: "Jeanne" });
    const holders =
      await owner`select p.title, p.permissions from post_holders h join posts p on p.id = h.post_id where h.party_id = ${partyId}`;
    expect(holders).toHaveLength(1);
    expect(holders[0]!.title).toMatch(/^Président/);
    expect([...holders[0]!.permissions].sort()).toEqual([...PERMISSIONS].sort());
    const [vacant] =
      await owner`select count(*)::int as n from posts p where p.party_id = ${partyId} and not exists (select 1 from post_holders h where h.post_id = p.id)`;
    expect(vacant?.n).toBeGreaterThanOrEqual(5);
    const [sub] =
      await owner`select status, current_period_end - now() > interval '29 days' as long from subscriptions where party_id = ${partyId}`;
    expect(sub).toEqual({ status: "trial", long: true });
    const [a] = await owner`select metadata from audit_log where party_id = ${partyId} and action = 'party.create'`;
    expect(a?.metadata).toEqual({ slug, tier: "mouvement" });
  });

  it("le fondateur, administrateur, doit d'abord activer la double authentification", async () => {
    expect((await get("/auth/me", founderToken)).json()).toMatchObject({ mfaPending: true, permissions: [] });
  });

  it("respecte le nombre de langues du palier", async () => {
    const res = await signup(`essentiel-${tag}`, `ess-${tag}@example.test`, {
      tier: "essentiel",
      languages: ["fr", "ht"],
    });
    expect(res.json()).toMatchObject({ code: "quota_site_languages", requiredTier: "mouvement" });
  });

  it("refuse un fondateur qui adhère déjà à un autre parti, et l'espace reste en attente", async () => {
    const s2 = `second-${tag}`;
    const { signupId: id2, challengeId: ch2 } = (await signup(s2, `jeanne-${tag}@example.test`)).json();
    const res = await post("/parties/signup/complete", { signupId: id2, challengeId: ch2, code: lastCode() });
    expect(res.json()).toMatchObject({ code: "already_member_elsewhere" });
    const [p] = await owner`select status from parties where id = ${id2}`;
    expect(p?.status).toBe("pending");
  });

  it("une création abandonnée depuis plus de 24 heures libère son adresse", async () => {
    await owner`update parties set created_at = now() - interval '2 days' where slug = ${`second-${tag}`}`;
    expect((await get(`/parties/slug-availability?slug=second-${tag}`)).json()).toEqual({ available: true });
    expect((await signup(`second-${tag}`, `bis-${tag}@example.test`)).statusCode).toBe(202);
  });
});

describe("identité visuelle (SOC-03)", () => {
  beforeAll(async () => {
    // 2FA considérée validée pour la suite (parcours testé dans auth.db.test.ts).
    await owner`update sessions set mfa_verified_at = now() where token_hash = ${hashToken(founderToken)}`;
  });

  it("profil public : nom, couleur, langues, mode d'adhésion", async () => {
    const res = await get(`/parties/${slug}/public`);
    expect(res.json()).toEqual({
      name: "Parti Horizon",
      slug,
      brandColor: "#7A2E5C",
      brandColorSecondary: null,
      languages: ["fr", "ht"],
      admissionMode: "validation",
      otpChannels: ["email"],
      logoUrl: null,
    });
  });

  it("le président change la couleur et dépose le logo ; le profil public les reflète", async () => {
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/party/branding",
          headers: { authorization: `Bearer ${founderToken}` },
          payload: { brandColor: "#2f5d9e" },
        })
      ).statusCode,
    ).toBe(204);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), randomBytes(500)]);
    const up = (
      await post(
        "/files/uploads",
        { purpose: "party_logo", name: "logo.png", mimeType: "image/png", sizeBytes: png.length },
        founderToken,
      )
    ).json();
    const u = new URL(up.upload.url);
    await app.inject({
      method: "PUT",
      url: u.pathname + u.search,
      headers: { "content-type": "image/png" },
      payload: png,
    });
    await post(`/files/${up.fileId}/complete`, {}, founderToken);
    await app.inject({
      method: "PATCH",
      url: "/party/branding",
      headers: { authorization: `Bearer ${founderToken}` },
      payload: { logoFileId: up.fileId },
    });
    const profile = (await get(`/parties/${slug}/public`)).json();
    expect(profile.brandColor).toBe("#2F5D9E");
    await app.inject({
      method: "PATCH",
      url: "/party/branding",
      headers: { authorization: `Bearer ${founderToken}` },
      payload: { brandColorSecondary: "#c8102e" },
    });
    expect((await get(`/parties/${slug}/public`)).json().brandColorSecondary).toBe("#C8102E");
    expect(profile.logoUrl).toContain("/storage/local/");
    const logo = new URL(profile.logoUrl);
    const shown = await app.inject({ url: logo.pathname + logo.search });
    expect(shown.rawPayload.equals(png)).toBe(true);
    // Le logo s'affiche sur l'adresse du parti (autre site que l'API) : pas de blocage CORP.
    expect(shown.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });

  it("refuse un logo SVG et une couleur mal formée", async () => {
    expect(
      (
        await post(
          "/files/uploads",
          { purpose: "party_logo", name: "logo.svg", mimeType: "image/svg+xml", sizeBytes: 100 },
          founderToken,
        )
      ).json(),
    ).toMatchObject({ code: "file_type_not_allowed" });
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/party/branding",
          headers: { authorization: `Bearer ${founderToken}` },
          payload: { brandColor: "rouge" },
        })
      ).statusCode,
    ).toBe(400);
  });

  it("donne les réglages au back-office : formule, quota de langues, statuts avec leur effectif", async () => {
    const res = await get("/party/settings", founderToken);
    expect(res.statusCode).toBe(200);
    const st = res.json();
    expect(st).toMatchObject({ slug, admissionMode: "validation", languages: ["fr", "ht"] });
    expect(st.siteLanguagesQuota).toBeGreaterThanOrEqual(2);
    expect(st.tier).toBeTruthy();
    expect(st.logoUrl).toContain("/storage/local/");
    // Le fondateur porte le statut créé avec l'espace.
    expect(st.statuses.reduce((n: number, x: { members: number }) => n + x.members, 0)).toBe(1);
    expect((await get("/party/settings")).statusCode).toBe(401);
  });
});
