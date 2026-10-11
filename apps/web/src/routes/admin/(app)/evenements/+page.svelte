<!--
  Agenda (ENG-03) : chaque événement est un billet de rassemblement. Talon à gauche avec la date en grand,
  ligne pointillée et demi-cercles découpés, puis le titre, le lieu, la zone ou l'organe, et la jauge des
  inscrits. Le panneau latéral sert à créer, modifier et voir les inscrits.
-->
<script lang="ts">
  import { formatTime, partyFormat } from "$lib/datetime";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { Button } from "@civora/ui";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { ActionData, PageData } from "./$types";
  import EventPanel from "./EventPanel.svelte";

  let { data, form }: { data: PageData & { locale: "fr" | "ht" }; form: ActionData } = $props();
  const t = $derived(translator(data.locale));
  const tk = (k: string) => t(k as MessageKey);
  const base = resolve("/admin/evenements");
  const params = $derived(page.url.searchParams);
  const label = (l: { fr: string; ht?: string }) => (data.locale === "ht" && l.ht ? l.ht : l.fr);

  const keep = $derived(params.get("periode") ? `periode=${params.get("periode")}` : "");
  const link = (extra: string) => `${base}?${[keep, extra].filter(Boolean).join("&")}`;
  // eslint-disable-next-line svelte/no-navigation-without-resolve
  const close = () => goto(keep ? `${base}?${keep}` : base, { noScroll: true, keepFocus: true });

  const day = partyFormat({ day: "numeric" });
  const month = partyFormat({ month: "short" });
  const weekday = partyFormat({ weekday: "long" });
  const f = $derived(form as { ok?: boolean; done?: string; code?: string; id?: string } | null);

  // Après la création, le panneau s'ouvre sur l'événement (pour suivre ses inscrits).
  $effect(() => {
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    if (f?.done === "created" && f.id) goto(link(`e=${f.id}`), { noScroll: true });
  });
</script>

<main>
  <header class="head">
    <div>
      <p class="crumb">{data.party.name}</p>
      <h1>{t("admin.events.title")}</h1>
    </div>
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    <Button href={link("nouveau")}>{t("admin.events.create")}</Button>
  </header>

  <nav class="tabs" aria-label={t("admin.events.title")}>
    <!-- eslint-disable svelte/no-navigation-without-resolve -->
    <a href={base} aria-current={data.period === "upcoming" ? "page" : undefined}>{t("admin.events.tab.upcoming")}</a>
    <a href="{base}?periode=passes" aria-current={data.period === "past" ? "page" : undefined}>
      {t("admin.events.tab.past")}
    </a>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  </nav>

  {#if data.events.length === 0}
    <p class="empty">{t(data.period === "past" ? "admin.events.empty.past" : "admin.events.empty.upcoming")}</p>
  {:else}
    <!-- eslint-disable svelte/no-navigation-without-resolve -->
    <ul class="tickets">
      {#each data.events as e (e.id)}
        {@const start = new Date(e.startsAt)}
        {@const fill = e.capacity ? Math.min(100, Math.round((e.registered / e.capacity) * 100)) : null}
        <li>
          <a
            class="ticket"
            class:selected={params.get("e") === e.id}
            class:past={data.period === "past"}
            href={link(`e=${e.id}`)}
            aria-label={format(t("admin.events.open"), { title: label(e.title) })}
            data-sveltekit-noscroll
          >
            <span class="stub" aria-hidden="true">
              <span class="d">{day.format(start)}</span>
              <span class="m">{month.format(start)}</span>
              <span class="w">{weekday.format(start)}</span>
            </span>
            <span class="body">
              <span class="kind kind-{e.kind}">{tk(`admin.events.kind.${e.kind}`)}</span>
              <span class="title">{label(e.title)}</span>
              <span class="where">
                {formatTime(start)} · {e.address ?? e.zoneName ?? t("admin.events.national")}
              </span>
              <span class="scope">{e.organName ?? e.zoneName ?? t("admin.events.national")}</span>
              <span class="gauge">
                {#if fill !== null}
                  <span class="bar" aria-hidden="true"
                    ><span style:width="{fill}%" class:full={fill >= 100}></span></span
                  >
                  <span class="count">
                    {fill >= 100
                      ? t("admin.events.full")
                      : format(t("admin.events.registeredOf"), { n: String(e.registered), cap: String(e.capacity) })}
                  </span>
                {:else}
                  <span class="count">{format(t("admin.events.registered"), { n: String(e.registered) })}</span>
                {/if}
              </span>
            </span>
          </a>
        </li>
      {/each}
    </ul>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  {/if}
</main>

{#if data.panel || data.creating}
  {#key data.panel?.event.id ?? "new"}
    <EventPanel
      event={data.panel?.event ?? null}
      registrants={data.panel?.registrants ?? []}
      organs={data.organs}
      locale={data.locale}
      form={f}
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
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--s-4);
  }
  .crumb {
    margin: 0 0 var(--s-2);
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  h1 {
    margin: 0;
    font: 800 var(--fs-32) / 1.05 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .tabs {
    display: flex;
    gap: var(--s-6);
    border-bottom: 1px solid var(--c-line);
  }
  .tabs a {
    padding-bottom: var(--s-3);
    margin-bottom: -1px;
    border-bottom: 3px solid transparent;
    color: var(--c-ink-2);
    text-decoration: none;
    font: 700 var(--fs-22) / 1.1 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .tabs a[aria-current="page"] {
    color: var(--c-ink);
    border-bottom-color: var(--c-primary);
  }
  .tabs a:focus-visible,
  .ticket:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .empty {
    margin: 0;
    padding: var(--s-8);
    border: 1px dashed var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
    color: var(--c-ink-2);
    line-height: 1.5;
  }
  .tickets {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: var(--s-4);
  }
  /* Billet : talon et corps séparés par une ligne pointillée, avec deux demi-cercles découpés. */
  .ticket {
    --notch: 11px;
    --cut: 104px;
    position: relative;
    display: grid;
    grid-template-columns: var(--cut) minmax(0, 1fr);
    min-height: 148px;
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-ink);
    text-decoration: none;
    filter: drop-shadow(0 1px 0 var(--c-line)) drop-shadow(0 -1px 0 var(--c-line)) drop-shadow(1px 0 0 var(--c-line))
      drop-shadow(-1px 0 0 var(--c-line));
    -webkit-mask:
      radial-gradient(circle var(--notch) at var(--cut) 0, transparent 98%, #000 100%) top / 100% 51% no-repeat,
      radial-gradient(circle var(--notch) at var(--cut) 100%, transparent 98%, #000 100%) bottom / 100% 51% no-repeat;
    mask:
      radial-gradient(circle var(--notch) at var(--cut) 0, transparent 98%, #000 100%) top / 100% 51% no-repeat,
      radial-gradient(circle var(--notch) at var(--cut) 100%, transparent 98%, #000 100%) bottom / 100% 51% no-repeat;
  }
  .ticket:hover .stub {
    background: var(--c-primary-hover);
  }
  .stub {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: var(--s-3);
    border-right: 2px dashed color-mix(in srgb, var(--c-on-primary) 45%, transparent);
    background: var(--c-primary);
    color: var(--c-on-primary);
    transition: background-color var(--dur-base);
  }
  .d {
    font: 800 var(--fs-40) / 1 var(--font-display);
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
  }
  .m {
    font: 700 var(--fs-15) / 1 var(--font-display);
    text-transform: uppercase;
  }
  .w {
    margin-top: var(--s-1);
    font-size: var(--fs-12);
    opacity: 0.85;
  }
  .body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--s-4) var(--s-5);
  }
  .kind {
    align-self: flex-start;
    padding: 2px 8px;
    border-radius: var(--r-sm);
    background: var(--c-paper);
    font-size: var(--fs-12);
    font-weight: 600;
  }
  .kind-rassemblement {
    background: var(--c-accent-tint);
    color: var(--c-on-accent);
  }
  .kind-congres {
    background: var(--c-ink);
    color: var(--c-surface);
  }
  .title {
    font: 700 var(--fs-19) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .where,
  .scope {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .gauge {
    margin-top: auto;
    padding-top: var(--s-2);
    display: flex;
    align-items: center;
    gap: var(--s-3);
  }
  .bar {
    flex: 1;
    height: 6px;
    border-radius: var(--r-pill);
    background: var(--c-line-soft);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--c-success);
  }
  .bar span.full {
    background: var(--c-warning);
  }
  .count {
    font-size: var(--fs-13);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .ticket.selected {
    filter: drop-shadow(0 0 0 transparent) drop-shadow(0 0 2px var(--c-primary)) drop-shadow(0 0 1px var(--c-primary));
  }
  .ticket.past .stub {
    background: var(--c-ink-2);
  }
  @media (max-width: 760px) {
    main {
      padding: var(--s-5) var(--s-4) var(--s-8);
    }
    .tickets {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
