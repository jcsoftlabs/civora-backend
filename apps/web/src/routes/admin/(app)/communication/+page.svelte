<!--
  Communication (COM-01, COM-02) : publications du parti par état (brouillons, programmées, publiées) et
  notifications push avec leur bilan d'envoi. Chaque élément dit à qui il s'adresse.
-->
<script lang="ts">
  import { formatDayTime } from "$lib/datetime";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";
  import { Badge, Button } from "@civora/ui";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { ActionData, PageData } from "./$types";
  import type { StoredAudience } from "./audience";
  import PublicationPanel from "./PublicationPanel.svelte";
  import PushComposer from "./PushComposer.svelte";

  let { data, form }: { data: PageData & { locale: "fr" | "ht" }; form: ActionData } = $props();
  const t = $derived(translator(data.locale));
  const tk = (k: string) => t(k as MessageKey);
  const base = resolve("/admin/communication");
  const can = (p: string) => data.me.permissions.includes(p);
  const params = $derived(page.url.searchParams);

  function href(changes: Record<string, string | null>) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const p = new URLSearchParams();
    for (const k of ["vue", "etat"]) {
      const v = params.get(k);
      if (v) p.set(k, v);
    }
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    const qs = p.toString().replace(/=(&|$)/g, "$1");
    return `${base}${qs ? `?${qs}` : ""}`;
  }
  // eslint-disable-next-line svelte/no-navigation-without-resolve
  const go = (changes: Record<string, string | null>) => goto(href(changes), { noScroll: true, keepFocus: true });

  const label = (l: { fr: string; ht?: string }) => (data.locale === "ht" && l.ht ? l.ht : l.fr);
  /** Résumé lisible d'une audience : « Tout le parti », « 2 zones · Diaspora »… */
  function who(a: StoredAudience | null) {
    if (!a || !Object.keys(a).length) return t("admin.com.audience.all");
    const parts: string[] = [];
    if (a.zoneCodes?.length)
      parts.push(
        a.zoneCodes.length === 1
          ? t("admin.com.audience.oneZone")
          : format(t("admin.com.audience.zones"), { n: String(a.zoneCodes.length) }),
      );
    if (a.statusIds?.length) parts.push(format(t("admin.com.audience.statuses"), { n: String(a.statusIds.length) }));
    if (a.organIds?.length) parts.push(format(t("admin.com.audience.organs"), { n: String(a.organIds.length) }));
    if (a.diaspora !== undefined)
      parts.push(t(a.diaspora ? "admin.com.audience.diaspora" : "admin.com.audience.haiti"));
    return parts.join(" · ");
  }
  const tabs = ["draft", "scheduled", "published"] as const;
  const pushTone = {
    scheduled: "warning",
    sending: "primary",
    sent: "success",
    cancelled: "neutral",
    failed: "danger",
  } as const;
  const f = $derived(form as { ok?: boolean; done?: string; code?: string; id?: string } | null);
  // La dernière action prime sur la confirmation portée par l'adresse.
  const toast = $derived(
    f?.done === "pushCancelled"
      ? t("admin.push.cancelled")
      : params.get("envoi") === "ok"
        ? t("admin.push.created")
        : params.get("envoi") === "programme"
          ? t("admin.push.createdLater")
          : null,
  );
  // Après l'enregistrement d'une nouvelle publication, le panneau reste ouvert sur elle.
  $effect(() => {
    if (f?.ok && f.id && params.get("pub") === "nouvelle") go({ pub: f.id });
  });
</script>

<div class="section">
  <aside class="views" aria-label={t("admin.dues.views")}>
    <p class="views-title">{t("admin.com.title")}</p>
    <ul>
      {#if can("publications.manage")}
        <li>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
          <a href={base} aria-current={data.view === "publications" ? "page" : undefined}
            >{t("admin.com.view.publications")}</a
          >
        </li>
      {/if}
      {#if can("outreach.send")}
        <li>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
          <a href="{base}?vue=notifications" aria-current={data.view === "notifications" ? "page" : undefined}>
            {t("admin.com.view.push")}
          </a>
        </li>
      {/if}
    </ul>
  </aside>

  <main>
    <header class="head">
      <div>
        <p class="crumb">{data.party.name}</p>
        <h1>{t(data.view === "publications" ? "admin.com.view.publications" : "admin.com.view.push")}</h1>
      </div>
      {#if data.view === "publications"}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <Button href={href({ pub: "nouvelle" })}>{t("admin.com.newPublication")}</Button>
      {:else if can("outreach.send")}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <Button href={href({ notifier: "" })}>{t("admin.com.newPush")}</Button>
      {/if}
    </header>

    {#if toast}<p class="msg" role="status">{toast}</p>{/if}
    {#if f?.code && !data.composing && !data.editing}<p class="msg bad" role="alert">{tk(`error.${f.code}`)}</p>{/if}

    {#if data.view === "publications"}
      <nav class="tabs" aria-label={t("admin.com.view.publications")}>
        <!-- eslint-disable svelte/no-navigation-without-resolve -->
        {#each tabs as tab (tab)}
          <a
            href={href({ etat: tab === "published" ? null : tab })}
            aria-current={data.tab === tab ? "page" : undefined}
          >
            {tk(`admin.com.tab.${tab}`)}
          </a>
        {/each}
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      </nav>
      {#if data.publications.length === 0}
        <p class="empty">{tk(`admin.com.empty.${data.tab}`)}</p>
      {:else}
        <ul class="list">
          {#each data.publications as p (p.id)}
            <li>
              <span class="kind kind-{p.kind}">{tk(`admin.com.kind.${p.kind}`)}</span>
              <span class="main">
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
                <a class="title" href={href({ pub: p.id })}>{label(p.title)}</a>
                {#if p.body}<span class="excerpt">{label(p.body).slice(0, 160)}</span>{/if}
                <span class="meta">
                  {who(p.audience)} ·
                  {p.publishedAt
                    ? format(
                        t(
                          new Date(p.publishedAt) > new Date()
                            ? "admin.com.status.scheduled"
                            : "admin.com.status.published",
                        ),
                        {
                          date: formatDayTime(new Date(p.publishedAt)),
                        },
                      )
                    : t("admin.com.status.draft")}
                </span>
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    {:else if data.campaigns.length === 0}
      <p class="empty">{t("admin.push.empty")}</p>
    {:else}
      <ul class="list">
        {#each data.campaigns as c (c.id)}
          <li>
            <span class="bell" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" /></svg>
            </span>
            <span class="main">
              <span class="title">{label(c.content.title)}</span>
              <span class="excerpt">{label(c.content.body)}</span>
              <span class="meta">
                {who(c.audience)}
                {#if c.status === "sent"}· {format(t("admin.push.counts"), {
                    sent: String(c.sentCount ?? 0),
                    failed: String(c.failedCount ?? 0),
                  })}{/if}
              </span>
            </span>
            <span class="side">
              <Badge tone={pushTone[c.status]}>
                {c.status === "scheduled"
                  ? format(t("admin.push.status.scheduled"), {
                      date: formatDayTime(new Date(c.scheduledAt ?? Date.now())),
                    })
                  : c.status === "sent"
                    ? format(t("admin.push.status.sent"), { date: formatDayTime(new Date(c.sentAt ?? Date.now())) })
                    : tk(`admin.push.status.${c.status}`)}
              </Badge>
              {#if c.status === "scheduled"}
                <form method="POST" action="?/cancelPush" use:enhance>
                  <input type="hidden" name="id" value={c.id} />
                  <Button type="submit" size="sm" variant="ghost">{t("admin.push.cancel")}</Button>
                </form>
              {/if}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </main>
</div>

{#if data.composing === "publication" || data.editing}
  {#key data.editing?.id ?? "new"}
    <PublicationPanel
      publication={data.editing}
      locale={data.locale}
      statuses={data.statuses}
      organs={data.organs}
      form={f}
      zoneNames={data.zoneNames}
      onclose={() => go({ pub: null })}
    />
  {/key}
{/if}
{#if data.composing === "push"}
  <PushComposer
    locale={data.locale}
    party={data.party}
    statuses={data.statuses}
    organs={data.organs}
    form={f}
    onclose={() => go({ notifier: null, vue: "notifications" })}
    onsent={(later) => go({ notifier: null, vue: "notifications", envoi: later ? "programme" : "ok" })}
  />
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
    font: 600 var(--fs-19) / 1.1 var(--font-display);
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
    font-weight: 600;
  }
  main {
    min-width: 0;
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
    font: 600 var(--fs-32) / 1.12 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .msg {
    margin: 0;
    padding: var(--s-3) var(--s-4);
    border-radius: var(--r-md);
    background: var(--c-success-tint);
    color: var(--c-success-text);
    font-size: var(--fs-14);
  }
  .msg.bad {
    background: var(--c-danger-tint);
    color: var(--c-danger-text);
  }
  .tabs {
    display: flex;
    gap: var(--s-6);
    border-bottom: 1px solid var(--c-line);
    overflow-x: auto;
  }
  .tabs a {
    padding-bottom: var(--s-3);
    margin-bottom: -1px;
    border-bottom: 3px solid transparent;
    color: var(--c-ink-2);
    text-decoration: none;
    white-space: nowrap;
    font: 600 var(--fs-22) / 1.1 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .tabs a[aria-current="page"] {
    color: var(--c-ink);
    border-bottom-color: var(--c-primary);
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
  .list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .list li {
    display: flex;
    align-items: flex-start;
    gap: var(--s-4);
    padding: var(--s-4) var(--s-5);
  }
  .list li + li {
    border-top: 1px solid var(--c-line-soft);
  }
  .kind {
    flex: none;
    width: 110px;
    padding: 4px 10px;
    border-radius: var(--r-sm);
    background: var(--c-paper);
    font-size: var(--fs-12);
    font-weight: 600;
    text-align: center;
  }
  .kind-announcement {
    background: var(--c-accent-tint);
    color: var(--c-on-accent);
  }
  .kind-news {
    background: var(--c-primary-tint);
    color: var(--c-primary-deep);
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .title {
    font: 600 var(--fs-16) / 1.3 var(--font-display);
    letter-spacing: var(--tracking-display);
    color: var(--c-ink);
    text-decoration: none;
  }
  a.title:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  a.title:focus-visible,
  .views a:focus-visible,
  .tabs a:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .excerpt {
    color: var(--c-ink-2);
    font-size: var(--fs-14);
    line-height: 1.45;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .meta {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .bell {
    flex: none;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: var(--r-md);
    background: var(--c-primary-tint);
    color: var(--c-primary-deep);
  }
  .bell svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linejoin: round;
  }
  .side {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--s-2);
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
    }
    main {
      padding: var(--s-5) var(--s-4) var(--s-8);
    }
  }
  @media (max-width: 640px) {
    .list li {
      flex-wrap: wrap;
    }
    .kind {
      width: auto;
    }
    .side {
      align-items: flex-start;
    }
  }
</style>
