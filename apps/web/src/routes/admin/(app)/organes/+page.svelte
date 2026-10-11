<!--
  Organes (maquette « Back-office : organes ») : grille de cartes qui disent chacune quelque chose d'utile
  (type et zone, responsables cerclés d'ambre, postes vacants, effectif, organe parent). La carte ouverte
  s'inverse (fond encre, anneau à la couleur du parti) ; l'édition se fait dans le panneau latéral.
-->
<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { Button } from "@civora/ui";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { ActionData, PageData } from "./$types";
  import OrganPanel from "./OrganPanel.svelte";

  let { data, form }: { data: PageData & { locale: "fr" | "ht" }; form: ActionData } = $props();
  const t = $derived(translator(data.locale));
  const tk = (k: string) => t(k as MessageKey);
  const base = resolve("/admin/organes");

  let query = $state("");
  let kind = $state("");
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const kinds = $derived([...new Set(data.organs.map((o) => o.kind))].sort());
  const shown = $derived(
    data.organs.filter(
      (o) =>
        (!kind || o.kind === kind) &&
        (!query.trim() || fold(`${o.name} ${o.zoneName ?? ""}`).includes(fold(query.trim()))),
    ),
  );
  const byId = $derived(new Map(data.organs.map((o) => [o.id, o])));
  const selected = $derived(page.url.searchParams.get("o"));
  const canCreate = $derived(data.me.permissions.includes("organs.manage"));

  const plural = (n: number, one: string, many: string) =>
    n === 1 ? t(one as MessageKey) : format(tk(many), { n: String(n) });
  const close = () => goto(base, { noScroll: true, keepFocus: true });

  // Après la création, le panneau s'ouvre sur le nouvel organe pour y ajouter ses postes.
  $effect(() => {
    const f = form as { done?: string; result?: { id?: string } } | null;
    // `base` vient de resolve() ; seule la requête change.
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    if (f?.done === "created" && f.result?.id) goto(`${base}?o=${f.result.id}`, { noScroll: true });
  });
</script>

<main>
  <header>
    <p class="crumb">{data.party.name}</p>
    <div class="title">
      <h1>{t("admin.organs.title")} <span class="n">{data.organs.length}</span></h1>
    </div>
  </header>

  <div class="bar">
    <div class="search">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
      <input
        type="search"
        bind:value={query}
        placeholder={t("admin.organs.search")}
        aria-label={t("admin.organs.search")}
      />
    </div>
    {#if kinds.length > 1}
      <label class="pill">
        <span>{t("admin.organs.kind")}</span>
        <select bind:value={kind}>
          <option value="">{t("admin.organs.anyKind")}</option>
          {#each kinds as k (k)}<option value={k}>{k}</option>{/each}
        </select>
      </label>
    {/if}
    {#if canCreate}
      <div class="primary"><Button href="{base}?nouveau">{t("admin.organs.create")}</Button></div>
    {/if}
  </div>

  {#if data.organs.length === 0}
    <section class="empty">
      <h2>{t("admin.organs.empty.title")}</h2>
      <p>{t("admin.organs.empty.lead")}</p>
      {#if canCreate}<Button href="{base}?nouveau">{t("admin.organs.create")}</Button>{/if}
    </section>
  {:else if shown.length === 0}
    <p class="none">{t("admin.organs.none")}</p>
  {:else}
    <ul class="grid">
      {#each shown as o (o.id)}
        <li>
          <a
            class="card"
            class:selected={selected === o.id}
            href="{base}?o={o.id}"
            aria-current={selected === o.id ? "true" : undefined}
            aria-label={format(t("admin.organs.open"), { name: o.name })}
            data-sveltekit-noscroll
          >
            <span class="top">
              <span class="kind">{o.kind}</span>
              <span class="zone">{o.zoneName ?? t("admin.organs.national")}</span>
            </span>
            <span class="name">{o.name}</span>
            {#if o.parentOrganId && byId.get(o.parentOrganId)}
              <span class="parent">{format(t("admin.organs.parent"), { name: byId.get(o.parentOrganId)!.name })}</span>
            {/if}

            <span class="people">
              {#if o.holders.length}
                <span class="stack" aria-label={t("admin.organs.responsables")}>
                  {#each o.holders.slice(0, 4) as h (h.memberId + h.postTitle)}
                    <span class="avatar" title="{h.firstName} {h.lastName}, {h.postTitle}"
                      >{h.firstName[0]}{h.lastName[0]}</span
                    >
                  {/each}
                  {#if o.holderCount > 4}
                    <span class="avatar more">{format(t("admin.organs.more"), { n: String(o.holderCount - 4) })}</span>
                  {/if}
                </span>
                <span class="lead-name"
                  >{o.holders[0]!.firstName} {o.holders[0]!.lastName}<small>{o.holders[0]!.postTitle}</small></span
                >
              {:else}
                <span class="lead-name muted">{t("admin.organ.vacantPost")}</span>
              {/if}
            </span>

            <span class="foot">
              <span
                >{o.postCount
                  ? plural(o.postCount, "admin.organs.postsOne", "admin.organs.posts")
                  : t("admin.organs.noPost")}</span
              >
              {#if o.postCount}
                <span class="state" class:warn={o.vacantPosts > 0}>
                  {o.vacantPosts > 0
                    ? plural(o.vacantPosts, "admin.organs.vacantOne", "admin.organs.vacant")
                    : t("admin.organs.complete")}
                </span>
              {/if}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</main>

{#if data.panel || data.creating}
  {#key data.panel?.organ.id ?? "new"}
    <OrganPanel
      organ={data.panel?.organ ?? null}
      posts={data.panel?.posts ?? []}
      organs={data.organs}
      groups={data.groups}
      permissions={data.me.permissions}
      locale={data.locale}
      form={(form as { ok?: boolean; done?: string; code?: string } | null) ?? null}
      onclose={close}
    />
  {/key}
{/if}

<style>
  main {
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
  h1 {
    margin: 0;
    font: 600 var(--fs-32) / 1.12 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .n {
    font: 600 var(--fs-15) / 1 var(--font-ui);
    letter-spacing: 0;
    color: var(--c-ink-2);
    font-variant-numeric: tabular-nums;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-3);
  }
  .search {
    position: relative;
    flex: 1 1 260px;
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
  .pill {
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
  }
  .search input:focus-visible,
  .pill select:focus-visible,
  .card:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .primary {
    margin-left: auto;
  }
  .grid {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--s-4);
  }
  .card {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding: var(--s-5);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
    color: var(--c-ink);
    text-decoration: none;
    transition:
      border-color var(--dur-base),
      transform var(--dur-base);
  }
  .card:hover {
    border-color: var(--c-ink-3);
  }
  /* Carte ouverte : inversée, fond encre, anneau à la couleur du parti. */
  .card.selected {
    background: var(--c-ink);
    color: var(--c-surface);
    border-color: var(--c-ink);
    box-shadow:
      0 0 0 3px var(--c-paper),
      0 0 0 5px var(--c-primary);
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
    font-size: var(--fs-13);
  }
  .kind {
    padding: 3px 9px;
    border-radius: var(--r-sm);
    background: var(--c-primary-tint);
    color: var(--c-primary-deep);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .zone {
    color: var(--c-ink-2);
    text-align: right;
  }
  .name {
    font: 600 var(--fs-19) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .parent {
    margin-top: calc(-1 * var(--s-2));
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .people {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    min-height: 40px;
  }
  .stack {
    display: inline-flex;
    padding-left: 6px;
  }
  /* Responsables cerclés d'ambre, en pile. */
  .avatar {
    width: 34px;
    height: 34px;
    margin-left: -6px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--c-primary-tint);
    color: var(--c-primary-deep);
    font: 600 var(--fs-12) / 1.12 var(--font-display);
    box-shadow:
      0 0 0 2px var(--c-surface),
      0 0 0 3.5px var(--c-accent);
  }
  .avatar.more {
    background: var(--c-paper);
    color: var(--c-ink-2);
    box-shadow: 0 0 0 2px var(--c-surface);
  }
  .lead-name {
    min-width: 0;
    display: flex;
    flex-direction: column;
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .lead-name small {
    font-size: var(--fs-12);
    font-weight: 400;
    color: var(--c-ink-2);
  }
  .lead-name.muted {
    color: var(--c-warning-text);
  }
  .foot {
    margin-top: auto;
    padding-top: var(--s-3);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
    border-top: 1px solid var(--c-line-soft);
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .state {
    padding: 3px 9px;
    border-radius: var(--r-pill);
    background: var(--c-success-tint);
    color: var(--c-success-text);
    font-weight: 600;
  }
  .state.warn {
    background: var(--c-warning-tint);
    color: var(--c-warning-text);
  }
  .selected .zone,
  .selected .parent,
  .selected .lead-name small,
  .selected .foot {
    color: color-mix(in srgb, var(--c-surface) 72%, transparent);
  }
  .selected .foot {
    border-top-color: color-mix(in srgb, var(--c-surface) 16%, transparent);
  }
  .selected .avatar {
    box-shadow:
      0 0 0 2px var(--c-ink),
      0 0 0 3.5px var(--c-accent-bright);
  }
  .selected .lead-name.muted {
    color: var(--c-accent-bright);
  }
  .empty {
    max-width: 560px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--s-3);
    padding: var(--s-8);
    border: 1px dashed var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .empty h2 {
    margin: 0;
    font: 600 var(--fs-22) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .empty p,
  .none {
    margin: 0;
    color: var(--c-ink-2);
    line-height: 1.5;
  }
  @media (max-width: 760px) {
    main {
      padding: var(--s-5) var(--s-4) var(--s-8);
    }
    .primary {
      margin-left: 0;
    }
  }
</style>
