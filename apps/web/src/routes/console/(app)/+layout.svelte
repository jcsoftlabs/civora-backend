<!--
  Coque de la console de l'éditeur (SOC-10) : rail sombre (vue d'ensemble, organisations, équipe, journal),
  personne connectée et rôle, rappel de ce que la console ne voit pas. Même grammaire que le back-office.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import { translator } from "$lib/i18n";
  import type { LayoutData } from "./$types";

  let { data, children }: { data: LayoutData & { locale: "fr" | "ht" }; children: Snippet } = $props();
  const t = $derived(translator(data.locale));
  const nav = $derived([
    { href: resolve("/console/(app)"), label: t("con.nav.overview"), exact: true },
    { href: resolve("/console/(app)/organisations"), label: t("con.nav.orgs"), exact: false },
    ...(data.staff.role === "owner"
      ? [{ href: resolve("/console/(app)/equipe"), label: t("con.nav.staff"), exact: false }]
      : []),
    { href: resolve("/console/(app)/journal"), label: t("con.nav.audit"), exact: false },
  ]);
  const current = (href: string, exact: boolean) =>
    exact ? page.url.pathname === href : page.url.pathname.startsWith(href);
</script>

<svelte:head>
  <title>{t("con.name")}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="shell">
  <aside class="rail">
    <p class="brand"><span class="mark" aria-hidden="true"></span>{t("con.name")}</p>
    <nav aria-label={t("con.nav.label")}>
      {#each nav as n (n.href)}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a href={n.href} aria-current={current(n.href, n.exact) ? "page" : undefined}>{n.label}</a>
      {/each}
    </nav>
    <div class="who">
      <p class="name">{data.staff.name}</p>
      <p class="role">{t(data.staff.role === "owner" ? "con.role.owner" : "con.role.support")}</p>
      <form method="POST" action="/console/deconnexion">
        <button type="submit">{t("con.logout")}</button>
      </form>
    </div>
  </aside>
  <div class="content">
    {@render children()}
    <p class="privacy">{t("con.privacy")}</p>
  </div>
</div>

<style>
  .shell {
    min-height: 100dvh;
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    background: var(--c-paper);
  }
  .rail {
    position: sticky;
    top: 0;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    gap: var(--s-8);
    padding: var(--s-6) var(--s-4);
    background: var(--c-rail);
    color: var(--c-surface);
  }
  .brand {
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    font: 600 var(--fs-16) / 1 var(--font-display);
  }
  .mark {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2.5px solid var(--c-accent);
    box-shadow:
      inset 0 0 0 2.5px var(--c-rail),
      inset 0 0 0 5px var(--c-accent);
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  nav a {
    min-height: 44px;
    display: flex;
    align-items: center;
    padding: 0 var(--s-3);
    border-radius: var(--r-md);
    color: color-mix(in srgb, var(--c-surface) 75%, transparent);
    text-decoration: none;
    font-weight: 500;
  }
  nav a:hover {
    background: rgb(255 255 255 / 6%);
    color: var(--c-surface);
  }
  nav a[aria-current="page"] {
    background: var(--c-paper);
    color: var(--c-ink);
  }
  .who {
    margin-top: auto;
    padding-top: var(--s-4);
    border-top: 1px solid rgb(255 255 255 / 12%);
  }
  .who p {
    margin: 0;
  }
  .name {
    font-weight: 600;
  }
  .role {
    font-size: var(--fs-13);
    color: var(--c-accent-bright);
  }
  .who button {
    min-height: 40px;
    margin-top: var(--s-2);
    padding: 0;
    border: 0;
    background: none;
    color: color-mix(in srgb, var(--c-surface) 70%, transparent);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
    font: 500 var(--fs-13) / 1 var(--font-ui);
  }
  .content {
    min-width: 0;
    padding: var(--s-8) var(--s-8) var(--s-10);
  }
  .privacy {
    margin: var(--s-10) 0 0;
    max-width: 60em;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  nav a:focus-visible,
  .who button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  @media (max-width: 860px) {
    .shell {
      grid-template-columns: minmax(0, 1fr);
    }
    .rail {
      position: static;
      height: auto;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--s-3);
    }
    nav {
      flex-direction: row;
      flex-wrap: wrap;
    }
    .who {
      margin: 0 0 0 auto;
      padding: 0;
      border: 0;
    }
    .content {
      padding: var(--s-5) var(--s-4) var(--s-8);
    }
  }
</style>
