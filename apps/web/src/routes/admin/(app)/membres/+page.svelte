<!--
  Liste des membres (maquette « Back-office : liste des membres ») : sous-menu des vues, onglets d'adhésion avec
  compteurs, recherche en pilule et filtres, export, tableau avec avatars duotone, étiquettes, cotisations de
  l'année en douze carrés. Tout l'état est dans l'adresse : une liste filtrée se partage par son lien.
-->
<script lang="ts">
  import { page, navigating } from "$app/state";
  import { resolve } from "$app/paths";
  import { goto } from "$app/navigation";
  import { Badge, Button, DataTable } from "@civora/ui";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { ActionData, PageData } from "./$types";
  import type { MemberRow } from "./+page.server";
  import MemberSheet from "./MemberSheet.svelte";

  let { data, form }: { data: PageData & { locale: "fr" | "ht" }; form: ActionData } = $props();
  const t = $derived(translator(data.locale));
  const tk = (k: string) => t(k as MessageKey);
  const list = $derived(data.list);
  const params = $derived(page.url.searchParams);
  /** Squelettes quand la liste change ; ouvrir ou fermer une fiche (?m=) ne recharge pas visuellement la liste. */
  const withoutSheet = (u: URL) => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const p = new URLSearchParams(u.searchParams);
    p.delete("m");
    return `${u.pathname}?${p}`;
  };
  const loading = $derived(!!navigating.to && withoutSheet(navigating.to.url) !== withoutSheet(page.url));

  /** Adresse de la liste avec certains paramètres changés ; la page revient à 1 sauf si on la donne. */
  function href(changes: Record<string, string | null>) {
    // Copie locale, jamais lue de façon réactive : pas besoin de SvelteURLSearchParams.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const p = new URLSearchParams(params);
    if (!("page" in changes)) p.delete("page");
    if (!("m" in changes)) p.delete("m");
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    const qs = p.toString();
    return `${resolve("/admin/membres")}${qs ? `?${qs}` : ""}`;
  }
  // eslint-disable-next-line svelte/no-navigation-without-resolve
  const go = (changes: Record<string, string | null>) => goto(href(changes), { keepFocus: true, noScroll: true });

  const total = $derived(list.counts.approved + list.counts.pending + list.counts.rejected);
  const tabs = $derived([
    { state: "approved", label: t("admin.members.tab.approved"), n: list.counts.approved },
    { state: "pending", label: t("admin.members.tab.pending"), n: list.counts.pending },
    { state: "rejected", label: t("admin.members.tab.rejected"), n: list.counts.rejected },
    { state: "all", label: t("admin.members.tab.all"), n: total },
  ]);
  const views = $derived([
    {
      label: t("admin.members.all"),
      to: resolve("/admin/membres"),
      active: !params.has("diaspora") && data.state === "approved",
    },
    {
      label: t("admin.members.pending"),
      to: `${resolve("/admin/membres")}?state=pending`,
      active: data.state === "pending" && !params.has("diaspora"),
      n: list.counts.pending,
    },
    {
      label: t("admin.members.diaspora"),
      to: `${resolve("/admin/membres")}?diaspora=true&state=all`,
      active: params.get("diaspora") === "true",
    },
  ]);
  const filtered = $derived(["q", "statusId", "diaspora", "zoneCode", "tags"].some((k) => params.has(k)));

  const columns = $derived([
    { key: "member", label: t("admin.members.col.member") },
    { key: "place", label: t("admin.members.col.place") },
    { key: "status", label: t("admin.members.col.status") },
    { key: "tags", label: t("admin.members.col.tags") },
    { key: "dues", label: format(t("admin.members.col.dues"), { year: String(list.year) }) },
    { key: "since", label: t("admin.members.col.since"), align: "end" as const },
  ]);

  const dateFmt = $derived(new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric" }));
  const monthFmt = $derived(new Intl.DateTimeFormat("fr-FR", { month: "long" }));
  const monthName = (i: number) => monthFmt.format(new Date(Date.UTC(2026, i, 15)));
  const label = (s: MemberRow["status"]) => (s ? (data.locale === "ht" && s.ht ? s.ht : s.fr) : null);
  const duesSummary = (d: MemberRow["dues"]) =>
    (["paid", "late", "due"] as const)
      .map((k) => `${d.filter((x) => x === k).length} ${tk(`admin.members.dues.${k}`)}`)
      .join(", ");

  const pages = $derived(Math.max(1, Math.ceil(list.total / list.limit)));
  const from = $derived(list.total ? (list.page - 1) * list.limit + 1 : 0);
  const to = $derived(Math.min(list.total, list.page * list.limit));
</script>

<div class="section">
  <aside class="views" aria-label={t("admin.members.views")}>
    <p class="views-title">{t("admin.members.views")}</p>
    <ul>
      {#each views as v (v.label)}
        <li>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
          <a href={v.to} aria-current={v.active ? "page" : undefined}>
            <span>{v.label}</span>
            {#if v.n}<span class="count">{v.n}</span>{/if}
          </a>
        </li>
      {/each}
    </ul>
  </aside>

  <main>
    <header>
      <p class="crumb">{data.party.name}</p>
      <nav class="tabs" aria-label={t("admin.members.title")}>
        <!-- eslint-disable svelte/no-navigation-without-resolve -->
        {#each tabs as tab (tab.state)}
          <a
            href={href({ state: tab.state === "approved" ? null : tab.state })}
            aria-current={data.state === tab.state ? "page" : undefined}
          >
            {tab.label}<span class="n">{tab.n}</span>
          </a>
        {/each}
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      </nav>
    </header>

    <div class="bar">
      <form method="GET" class="search" role="search" data-sveltekit-keepfocus data-sveltekit-noscroll>
        {#each [...params.entries()].filter(([k]) => !["q", "page"].includes(k)) as [k, v] (k)}
          <input type="hidden" name={k} value={v} />
        {/each}
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
        <input
          type="search"
          name="q"
          value={params.get("q") ?? ""}
          placeholder={t("admin.members.search")}
          aria-label={t("admin.members.search")}
          autocomplete="off"
        />
      </form>

      <div class="filters">
        <label class="pill">
          <span>{t("admin.members.filter.status")}</span>
          <select value={params.get("statusId") ?? ""} onchange={(e) => go({ statusId: e.currentTarget.value })}>
            <option value="">{t("admin.members.filter.anyStatus")}</option>
            {#each data.statuses as s (s.id)}<option value={s.id}>{label(s.label)}</option>{/each}
          </select>
        </label>
        <label class="pill">
          <span>{t("admin.members.filter.place")}</span>
          <select value={params.get("diaspora") ?? ""} onchange={(e) => go({ diaspora: e.currentTarget.value })}>
            <option value="">{t("admin.members.filter.anyPlace")}</option>
            <option value="false">{t("admin.members.filter.haiti")}</option>
            <option value="true">{t("admin.members.filter.diaspora")}</option>
          </select>
        </label>
        <label class="pill">
          <span>{t("admin.members.filter.sort")}</span>
          <select
            value={params.get("sort") ?? "name"}
            onchange={(e) => go({ sort: e.currentTarget.value === "name" ? null : e.currentTarget.value })}
          >
            <option value="name">{t("admin.members.sort.name")}</option>
            <option value="recent">{t("admin.members.sort.recent")}</option>
            <option value="number">{t("admin.members.sort.number")}</option>
          </select>
        </label>
        {#if filtered}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
          <a class="clear" href={href({ q: null, statusId: null, diaspora: null, zoneCode: null, tags: null })}>
            {t("admin.members.filter.clear")}
          </a>
        {/if}
      </div>

      {#if data.me.permissions.includes("members.export")}
        <details class="export">
          <summary>{t("admin.members.export")}</summary>
          <form method="POST" action="/admin/membres/export" class="menu">
            <input type="hidden" name="state" value={data.state === "all" ? "" : data.state} />
            <input type="hidden" name="statusId" value={params.get("statusId") ?? ""} />
            <input type="hidden" name="diaspora" value={params.get("diaspora") ?? ""} />
            {#each ["csv", "xlsx", "pdf"] as f (f)}
              <button type="submit" name="format" value={f}>{tk(`admin.members.export.${f}`)}</button>
            {/each}
          </form>
        </details>
      {/if}
    </div>

    <DataTable
      caption={t("admin.members.caption")}
      {columns}
      rows={list.items}
      {loading}
      loadingLabel={t("admin.members.loading")}
    >
      {#snippet cell(m, col)}
        {#if col.key === "member"}
          <span class="who">
            <span class="avatar" aria-hidden="true">{m.firstName[0]}{m.lastName[0]}</span>
            <span class="names">
              <!-- eslint-disable svelte/no-navigation-without-resolve -->
              <a
                class="name"
                href={href({ m: m.id, page: params.get("page") })}
                aria-label={format(t("admin.sheet.open"), { name: `${m.firstName} ${m.lastName}` })}
                data-sveltekit-noscroll
                data-sveltekit-keepfocus>{m.firstName} {m.lastName}</a
              >
              <!-- eslint-enable svelte/no-navigation-without-resolve -->
              <span class="number">{m.number}</span>
            </span>
          </span>
        {:else if col.key === "place"}
          <span class="place">
            <span>{m.zoneName}</span>
            {#if m.parentName}<span class="parent">{m.parentName}</span>{/if}
          </span>
        {:else if col.key === "status"}
          {#if m.state === "pending"}
            <Badge tone="warning">{t("admin.members.state.pending")}</Badge>
          {:else if m.state === "rejected"}
            <Badge tone="danger">{t("admin.members.state.rejected")}</Badge>
          {:else if m.status}
            <Badge tone="primary">{label(m.status)}</Badge>
          {/if}
        {:else if col.key === "tags"}
          <span class="tags">
            {#each m.tags.slice(0, 2) as tag (tag)}<span class="tag">{tag}</span>{/each}
            {#if m.tags.length > 2}<span class="tag more"
                >{format(t("admin.members.more"), { n: String(m.tags.length - 2) })}</span
              >{/if}
          </span>
        {:else if col.key === "dues"}
          <span
            class="dues"
            role="img"
            aria-label="{format(t('admin.members.col.dues'), { year: String(list.year) })} : {duesSummary(m.dues)}"
          >
            {#each m.dues as d, i (i)}<span class="sq {d}" title="{monthName(i)} : {tk(`admin.members.dues.${d}`)}"
              ></span>{/each}
          </span>
        {:else if col.key === "since"}
          <span class="since">{m.joinedAt ? dateFmt.format(new Date(m.joinedAt)) : ""}</span>
        {/if}
      {/snippet}
      {#snippet empty()}
        <div class="empty">
          {#if filtered}
            <h2>{t("admin.members.empty.title")}</h2>
            <p>{t("admin.members.empty.lead")}</p>
            <Button
              variant="secondary"
              href={href({ q: null, statusId: null, diaspora: null, zoneCode: null, tags: null })}
            >
              {t("admin.members.filter.clear")}
            </Button>
          {:else}
            <h2>{t("admin.members.empty.none")}</h2>
            <p>{t("admin.members.empty.noneLead")}</p>
          {/if}
        </div>
      {/snippet}
    </DataTable>

    <footer>
      <ul class="legend" aria-label={t("admin.members.dues.legend")}>
        {#each ["paid", "late", "due", "none"] as d (d)}
          <li><span class="sq {d}" aria-hidden="true"></span>{tk(`admin.members.dues.${d}`)}</li>
        {/each}
      </ul>
      {#if list.total > 0}
        <p class="range">
          {format(t("admin.members.range"), { from: String(from), to: String(to), total: String(list.total) })}
        </p>
      {/if}
      {#if pages > 1}
        <nav
          class="pager"
          aria-label={format(t("admin.members.page"), { page: String(list.page), pages: String(pages) })}
        >
          {#if list.page > 1}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={href({ page: String(list.page - 1) })} aria-label={t("admin.members.prev")}>‹</a>
          {/if}
          <span>{format(t("admin.members.page"), { page: String(list.page), pages: String(pages) })}</span>
          {#if list.page < pages}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={href({ page: String(list.page + 1) })} aria-label={t("admin.members.next")}>›</a>
          {/if}
        </nav>
      {/if}
    </footer>
  </main>
</div>

{#if data.sheet}
  {#key data.sheet.member.id}
    <MemberSheet
      member={data.sheet.member}
      dues={data.sheet.dues}
      party={data.party}
      statuses={data.statuses}
      permissions={data.me.permissions}
      locale={data.locale}
      form={form ?? null}
      onclose={() => go({ m: null, page: params.get("page") })}
    />
  {/key}
{/if}

<style>
  .section {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    min-height: 100dvh;
  }
  .views {
    padding: var(--s-6) var(--s-3);
    border-right: 1px solid var(--c-line);
    background: var(--c-surface);
  }
  .views-title {
    margin: 0 var(--s-3) var(--s-3);
    font: 700 var(--fs-19) / 1.1 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .views ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .views a {
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
    padding: 0 var(--s-3);
    border-radius: var(--r-sm);
    color: var(--c-ink);
    text-decoration: none;
    font-size: var(--fs-14);
  }
  .views a:hover {
    background: var(--c-paper);
  }
  .views a[aria-current="page"] {
    background: var(--c-primary-tint);
    color: var(--c-ink);
    font-weight: 600;
  }
  .count {
    min-width: 22px;
    padding: 2px 7px;
    border-radius: var(--r-pill);
    background: var(--c-accent-tint);
    color: var(--c-on-accent);
    font: 600 var(--fs-12) / 1.3 var(--font-ui);
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
    padding: var(--s-6) var(--s-8) var(--s-10);
  }
  .crumb {
    margin: 0 0 var(--s-2);
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-6);
    border-bottom: 1px solid var(--c-line);
  }
  .tabs a {
    display: inline-flex;
    align-items: baseline;
    gap: var(--s-2);
    padding-bottom: var(--s-3);
    margin-bottom: -1px;
    border-bottom: 3px solid transparent;
    color: var(--c-ink-2);
    text-decoration: none;
    font: 700 var(--fs-26) / 1.1 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .tabs a[aria-current="page"] {
    color: var(--c-ink);
    border-bottom-color: var(--c-primary);
  }
  .n {
    font: 600 var(--fs-14) / 1 var(--font-ui);
    letter-spacing: 0;
    font-variant-numeric: tabular-nums;
    color: var(--c-ink-2);
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-3);
  }
  .search {
    position: relative;
    flex: 1 1 280px;
    max-width: 420px;
  }
  .search svg {
    position: absolute;
    left: 14px;
    top: 50%;
    width: 18px;
    height: 18px;
    transform: translateY(-50%);
    fill: none;
    stroke: var(--c-ink-2);
    stroke-width: 1.8;
    stroke-linecap: round;
  }
  .search input {
    width: 100%;
    min-height: 44px;
    padding: 0 var(--s-4) 0 42px;
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 400 var(--fs-15) / 1 var(--font-ui);
  }
  .search input:focus-visible,
  .pill select:focus-visible,
  .export summary:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-2);
  }
  .pill {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
    background: var(--c-surface);
    font-size: var(--fs-14);
  }
  .pill span {
    padding-left: var(--s-4);
    color: var(--c-ink-2);
  }
  .pill select {
    min-height: 42px;
    padding: 0 var(--s-4) 0 var(--s-2);
    border: 0;
    border-radius: var(--r-pill);
    background: transparent;
    color: var(--c-ink);
    font: 600 var(--fs-14) / 1 var(--font-ui);
    cursor: pointer;
  }
  .clear {
    padding: 0 var(--s-2);
    color: var(--c-ink-2);
    font-size: var(--fs-14);
  }
  .export {
    position: relative;
    margin-left: auto;
  }
  .export summary {
    list-style: none;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--s-5);
    border-radius: var(--r-pill);
    background: var(--c-primary);
    color: var(--c-on-primary);
    font: 600 var(--fs-15) / 1 var(--font-ui);
    cursor: pointer;
  }
  .export summary::-webkit-details-marker {
    display: none;
  }
  .export .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    z-index: 5;
    min-width: 160px;
    display: flex;
    flex-direction: column;
    padding: var(--s-2);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    box-shadow: var(--shadow-object);
  }
  .export button {
    min-height: 44px;
    padding: 0 var(--s-3);
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--c-ink);
    font: 500 var(--fs-14) / 1 var(--font-ui);
    text-align: left;
    cursor: pointer;
  }
  .export button:hover {
    background: var(--c-paper);
  }
  .who {
    display: inline-flex;
    align-items: center;
    gap: var(--s-3);
  }
  /* Avatar duotone : initiales sur une teinte de la couleur du parti. */
  .avatar {
    flex: none;
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--c-primary-tint);
    color: var(--c-primary-deep);
    font: 700 var(--fs-13) / 1 var(--font-display);
  }
  .names,
  .place {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    font-weight: 600;
    white-space: nowrap;
    color: var(--c-ink);
    text-decoration: none;
  }
  .name:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .name:focus-visible {
    outline: none;
    border-radius: 4px;
    box-shadow: var(--focus-ring);
  }
  .place {
    min-width: 170px;
  }
  .number,
  .parent {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    font-variant-numeric: tabular-nums;
  }
  .tags {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--s-1);
  }
  .tag {
    padding: 3px 8px;
    border-radius: var(--r-sm);
    background: var(--c-paper);
    border: 1px solid var(--c-line);
    font-size: var(--fs-12);
    white-space: nowrap;
  }
  .tag.more {
    color: var(--c-ink-2);
  }
  .dues {
    display: inline-grid;
    grid-template-columns: repeat(12, 10px);
    gap: 3px;
  }
  .sq {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: var(--c-line-soft);
    box-shadow: inset 0 0 0 1px var(--c-line);
  }
  .sq.paid {
    background: var(--c-success);
    box-shadow: none;
  }
  .sq.late {
    background: var(--c-danger);
    box-shadow: none;
  }
  .sq.due {
    background: var(--c-surface);
    box-shadow: inset 0 0 0 1.5px var(--c-warning);
  }
  .since {
    color: var(--c-ink-2);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--s-3);
  }
  .empty h2 {
    margin: 0;
    font: 700 var(--fs-22) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .empty p {
    margin: 0;
    color: var(--c-ink-2);
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-4) var(--s-6);
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .range {
    margin: 0 0 0 auto;
    font-variant-numeric: tabular-nums;
  }
  .pager {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
  }
  .pager a {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
    background: var(--c-surface);
    color: var(--c-ink);
    text-decoration: none;
    font-size: var(--fs-19);
  }
  @media (max-width: 1024px) {
    .section {
      grid-template-columns: minmax(0, 1fr);
    }
    .views {
      border-right: 0;
      border-bottom: 1px solid var(--c-line);
      padding: var(--s-3) var(--s-4);
    }
    .views-title {
      display: none;
    }
    .views ul {
      flex-direction: row;
      overflow-x: auto;
    }
    .views a {
      white-space: nowrap;
    }
    main {
      padding: var(--s-5) var(--s-4) var(--s-8);
    }
  }
  @media (max-width: 560px) {
    .tabs {
      gap: var(--s-4);
      overflow-x: auto;
      flex-wrap: nowrap;
    }
    .tabs a {
      font-size: var(--fs-19);
      white-space: nowrap;
    }
    .bar {
      gap: var(--s-2);
    }
    /* Filtres sur une ligne qui défile, l'export à côté de la recherche. */
    .filters {
      order: 3;
      width: 100%;
      flex-wrap: nowrap;
      overflow-x: auto;
      padding-bottom: 2px;
    }
    .pill {
      flex: none;
    }
    .search {
      flex: 1 1 0;
    }
  }
</style>
