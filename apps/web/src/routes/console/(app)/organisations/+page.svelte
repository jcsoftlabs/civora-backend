<!--
  Organisations de la plateforme (SOC-10) : recherche, filtres (statut, type, formule), tableau avec effectifs,
  activité et abonnement ; chaque ligne mène à la fiche. Le propriétaire crée une organisation à la main.
-->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { Badge } from "@civora/ui";
  import { partyFormat } from "$lib/datetime";
  import { translator, type MessageKey } from "$lib/i18n";
  import { bytes, num } from "$lib/console/format";
  import type { PageData } from "./$types";

  let { data }: { data: PageData & { locale: "fr" | "ht" } } = $props();
  const t = $derived(translator(data.locale));
  const tk = (k: string) => t(k as MessageKey);
  const date = partyFormat({ day: "numeric", month: "short", year: "numeric" });
  let q = $derived(data.filters.q);
  const owner = $derived(page.data.staff?.role === "owner");

  const rows = $derived(
    data.organizations.filter((o) => {
      const needle = q.trim().toLowerCase();
      if (needle && !o.name.toLowerCase().includes(needle) && !o.slug.includes(needle)) return false;
      if (data.filters.statut && o.status !== data.filters.statut) return false;
      if (data.filters.type && o.kind !== data.filters.type) return false;
      if (data.filters.formule && o.tier !== data.filters.formule) return false;
      return true;
    }),
  );
  /** Change un filtre dans l'adresse (partageable, gardé au retour). */
  function setFilter(key: string, value: string) {
    const u = new URL(page.url);
    if (value) u.searchParams.set(key, value);
    else u.searchParams.delete(key);
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    goto(`${resolve("/console/(app)/organisations")}${u.search}`, {
      replaceState: true,
      keepFocus: true,
      noScroll: true,
    });
  }
  const subTone = (s: string | undefined) =>
    s === "active"
      ? "success"
      : s === "trial"
        ? "accent"
        : s === "suspended" || s === "past_due"
          ? "danger"
          : "neutral";
</script>

<header class="head">
  <h1>{t("con.orgs.title")} <span class="count">{num(data.organizations.length)}</span></h1>
  {#if owner}
    <a class="btn" href={resolve("/console/(app)/organisations/nouvelle")}>{t("con.orgs.create")}</a>
  {/if}
</header>

<div class="filters">
  <input
    class="search"
    type="search"
    placeholder={t("con.orgs.search")}
    aria-label={t("con.orgs.search")}
    bind:value={q}
    onchange={() => setFilter("q", q)}
  />
  <label>
    <span>{t("con.orgs.status")}</span>
    <select value={data.filters.statut} onchange={(e) => setFilter("statut", e.currentTarget.value)}>
      <option value="">{t("con.orgs.all")}</option>
      <option value="active">{t("con.status.active")}</option>
      <option value="pending">{t("con.status.pending")}</option>
    </select>
  </label>
  <label>
    <span>{t("con.orgs.col.kind")}</span>
    <select value={data.filters.type} onchange={(e) => setFilter("type", e.currentTarget.value)}>
      <option value="">{t("con.orgs.all")}</option>
      {#each ["party", "association", "ngo", "union"] as k (k)}<option value={k}>{tk(`create.kind.${k}`)}</option
        >{/each}
    </select>
  </label>
  <label>
    <span>{t("con.orgs.col.tier")}</span>
    <select value={data.filters.formule} onchange={(e) => setFilter("formule", e.currentTarget.value)}>
      <option value="">{t("con.orgs.all")}</option>
      {#each ["essentiel", "mouvement", "national"] as k (k)}<option value={k}>{tk(`plan.${k}`)}</option>{/each}
    </select>
  </label>
</div>

{#if data.organizations.length === 0}
  <p class="empty">{t("con.orgs.empty")}</p>
{:else if rows.length === 0}
  <p class="empty">{t("con.orgs.noMatch")}</p>
{:else}
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th scope="col">{t("con.orgs.col.org")}</th>
          <th scope="col">{t("con.orgs.col.kind")}</th>
          <th scope="col">{t("con.orgs.col.tier")}</th>
          <th scope="col">{t("con.orgs.col.sub")}</th>
          <th scope="col" class="end">{t("con.orgs.col.members")}</th>
          <th scope="col" class="end">{t("con.orgs.col.active")}</th>
          <th scope="col" class="end">{t("con.org.storage")}</th>
          <th scope="col">{t("con.orgs.col.last")}</th>
          <th scope="col">{t("con.orgs.col.created")}</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as o (o.id)}
          <tr>
            <th scope="row">
              <a href={resolve("/console/(app)/organisations/[id]", { id: o.id })}>{o.name}</a>
              <span class="slug">{o.slug}</span>
            </th>
            <td>{tk(`create.kind.${o.kind}`)}</td>
            <td>{tk(`plan.${o.tier}`)}</td>
            <td>
              {#if o.status === "pending"}
                <Badge tone="warning">{t("con.status.pending")}</Badge>
              {:else}
                <Badge tone={subTone(o.subscription?.status)}>{tk(`con.sub.${o.subscription?.status ?? "none"}`)}</Badge
                >
              {/if}
            </td>
            <td class="end num">{num(o.members)}</td>
            <td class="end num">{num(o.activeUsers30)}</td>
            <td class="end num">{bytes(o.storageBytes)}</td>
            <td>{o.lastActivity ? date.format(new Date(o.lastActivity)) : t("con.org.never")}</td>
            <td>{date.format(new Date(o.createdAt))}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-4);
    margin-bottom: var(--s-5);
  }
  h1 {
    margin: 0;
    font: 600 var(--fs-32) / 1.1 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .count {
    font-size: var(--fs-19);
    color: var(--c-ink-2);
  }
  .btn {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--s-5);
    border-radius: var(--r-pill);
    background: var(--c-primary);
    color: var(--c-on-primary);
    font-weight: 600;
    text-decoration: none;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--s-3);
    margin-bottom: var(--s-4);
  }
  .search {
    flex: 1;
    min-width: 220px;
    min-height: 44px;
    padding: 0 var(--s-4);
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
    background: var(--c-surface);
    font: 400 var(--fs-15) / 1 var(--font-ui);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  select {
    min-height: 44px;
    padding: 0 var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 500 var(--fs-14) / 1 var(--font-ui);
  }
  .empty {
    padding: var(--s-8);
    border: 1px dashed var(--c-line);
    border-radius: var(--r-lg);
    color: var(--c-ink-2);
  }
  .scroll {
    overflow-x: auto;
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-14);
  }
  th,
  td {
    padding: var(--s-3) var(--s-4);
    text-align: left;
    border-bottom: 1px solid var(--c-line-soft);
    white-space: nowrap;
  }
  thead th {
    font-size: var(--fs-13);
    font-weight: 600;
    color: var(--c-ink-2);
  }
  tbody th a {
    display: block;
    color: var(--c-ink);
    font-weight: 600;
    text-underline-offset: 3px;
  }
  .slug {
    font-size: var(--fs-12);
    font-weight: 400;
    color: var(--c-ink-2);
  }
  .end {
    text-align: right;
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  .btn:focus-visible,
  .search:focus-visible,
  select:focus-visible,
  tbody th a:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
</style>
