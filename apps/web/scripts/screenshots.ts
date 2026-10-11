// Captures du back-office pour le site commercial (SOC-12), en français et en créole, à partir du jeu de
// démonstration local (`pnpm db:demo`, puis `pnpm dev`). Usage : pnpm --filter @civora/web screenshots
// Les images vont dans static/marketing/<langue>/<écran>.jpg.
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";

const root = resolve(import.meta.dirname, "../../..");
const { slug, token } = JSON.parse(readFileSync(resolve(root, ".demo-session.json"), "utf8")) as {
  slug: string;
  token: string;
};
const host = `${slug}.localhost`;
const base = `http://${host}:5173`;

/** Écran, adresse, et réglage éventuel avant la capture. */
const SHOTS: Array<{
  name: string;
  path: string | ((p: Page) => Promise<string>);
  prepare?: (p: Page) => Promise<void>;
}> = [
  { name: "dashboard", path: "/admin" },
  { name: "members", path: "/admin/membres" },
  {
    name: "member",
    path: async (p) => {
      await p.goto(`${base}/admin/membres`);
      const href = await p.locator("a[href*='m=']").first().getAttribute("href");
      return href ?? "/admin/membres";
    },
  },
  { name: "dues", path: "/admin/cotisations" },
  { name: "events", path: "/admin/evenements" },
  { name: "organs", path: "/admin/organes" },
  {
    name: "push",
    path: "/admin/communication?vue=notifications&notifier",
    // Message rempli : l'aperçu du téléphone montre une vraie notification.
    prepare: async (p) => {
      await p.fill("input[name=titleFr]", "Congrès national 2026");
      await p.fill("input[name=titleHt]", "Kongrè nasyonal 2026");
      await p.fill(
        "textarea[name=bodyFr]",
        "Les inscriptions sont ouvertes : réservez votre place dans l'application.",
      );
      await p.fill("textarea[name=bodyHt]", "Enskripsyon yo louvri : rezève plas ou nan aplikasyon an.");
      // Le panneau revient en haut : l'aperçu du téléphone doit être visible.
      await p.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        for (const el of document.querySelectorAll<HTMLElement>("*")) if (el.scrollTop > 0) el.scrollTop = 0;
      });
    },
  },
  {
    name: "training",
    path: async (p) => {
      await p.goto(`${base}/admin/formation`);
      return (
        (await p.locator("a[href^='/admin/formation/']:not([href$='certificat'])").first().getAttribute("href")) ??
        "/admin/formation"
      );
    },
  },
  {
    // Résultats de l'élection certifiée : participation, voix, élu coché sur le bulletin.
    name: "votes",
    path: async (p) => {
      await p.goto(`${base}/admin/votes`);
      const href = await p
        .locator("a.ballot")
        .filter({ hasText: /Coordination|Kowòdinasyon/ })
        .first()
        .getAttribute("href");
      return href ? `${href}?onglet=resultats` : "/admin/votes";
    },
  },
];

const only = process.argv.slice(2);
// CHROMIUM_PATH : un Chromium déjà installé, si la version attendue par Playwright manque.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const lang of ["fr", "ht"] as const) {
  const dir = resolve(root, "apps/web/static/marketing", lang);
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 750 },
    deviceScaleFactor: 2,
    locale: lang === "ht" ? "ht-HT" : "fr-FR",
    reducedMotion: "reduce",
  });
  await context.addCookies([
    { name: "civora_session", value: token, domain: host, path: "/", httpOnly: true, sameSite: "Lax" },
    { name: "lang", value: lang, domain: host, path: "/", sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  for (const shot of SHOTS) {
    if (only.length && !only.includes(shot.name)) continue;
    const path = typeof shot.path === "string" ? shot.path : await shot.path(page);
    await page.goto(new URL(path, page.url().startsWith("http") ? page.url() : base).href, {
      waitUntil: "networkidle",
    });
    await shot.prepare?.(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(dir, `${shot.name}.jpg`), type: "jpeg", quality: 82 });
    console.log(`${lang}/${shot.name}.jpg  ${path}`);
  }
  await context.close();
}
await browser.close();
