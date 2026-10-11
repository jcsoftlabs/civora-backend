<!--
  Vue d'ensemble de la plateforme (SOC-10) : bande de chiffres clés, inscriptions par semaine, répartitions,
  sommes encaissées par les organisations, alertes (essais qui finissent, quotas), santé du service.
  Totaux seulement : aucune donnée de membre.
-->
<script lang="ts">
  import { resolve } from "$app/paths";
  import { partyFormat } from "$lib/datetime";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import { bytes, money, num } from "$lib/console/format";
  import type { PageData } from "./$types";

  let { data }: { data: PageData & { locale: "fr" | "ht" } } = $props();
  const t = $derived(translator(data.locale));
  const tk = (k: string) => t(k as MessageKey);
  /** Nombre accordé : clé `.one` pour un seul élément. */
  const cn = (key: string, n: number) => format(tk(n === 1 ? `${key}.one` : key), { n: num(n) });
  const o = $derived(data.overview);
  const day = partyFormat({ day: "numeric", month: "short" });
  const date = partyFormat({ day: "numeric", month: "long", year: "numeric" });

  const active = $derived(o.organizations.byStatus.active ?? 0);
  const pending = $derived(o.organizations.byStatus.pending ?? 0);
  const maxWeek = $derived(Math.max(1, ...o.signupsByWeek.map((w) => w.signups)));
  const share = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
  const KINDS = ["party", "association", "ngo", "union"] as const;
  const TIERS = ["essentiel", "mouvement", "national"] as const;
  const SUBS = ["active", "trial", "past_due", "suspended", "cancelled", "none"] as const;
  const currencies = $derived(Object.entries(o.collected30));
  const rows = (
    keys: readonly string[],
    counts: Record<string, number>,
    name: (k: string) => string,
    skipEmpty = false,
  ) => keys.map((key) => ({ key, name: name(key), n: counts[key] ?? 0 })).filter((r) => !skipEmpty || r.n > 0);
  const splits = $derived([
    { title: "con.ov.byKind", rows: rows(KINDS, o.organizations.byKind, (k) => tk(`create.kind.${k}`)) },
    { title: "con.ov.byTier", rows: rows(TIERS, o.organizations.byTier, (k) => tk(`plan.${k}`)) },
    { title: "con.ov.bySub", rows: rows(SUBS, o.organizations.bySubscription, (k) => tk(`con.sub.${k}`), true) },
  ]);
</script>

<header class="head">
  <h1>{t("con.ov.title")}</h1>
  {#if pending}
    <a class="notice" href="{resolve('/console/(app)/organisations')}?statut=pending">
      {cn("con.ov.pending", pending)}
    </a>
  {/if}
</header>

<!-- Chiffres clés : une seule bande découpée par des filets. -->
<dl class="kpis">
  <div>
    <dt>{t("con.ov.orgs")}</dt>
    <dd class="big">{num(active)}</dd>
    <dd class="sub">{cn("con.ov.orgs.sub", o.organizations.new30)}</dd>
  </div>
  <div>
    <dt>{t("con.ov.members")}</dt>
    <dd class="big">{num(o.people.members)}</dd>
    <dd class="sub">{format(t("con.ov.members.sub"), { n: num(o.people.newMembers30) })}</dd>
  </div>
  <div>
    <dt>{t("con.ov.accounts")}</dt>
    <dd class="big">{num(o.people.accounts)}</dd>
    <dd class="sub">{format(t("con.ov.accounts.sub"), { n: num(o.people.activeUsers30) })}</dd>
  </div>
  <div>
    <dt>{t("con.ov.mrr")}</dt>
    <dd class="big">{money(o.revenue.mrrUsd, "USD", 0)}</dd>
    <dd class="sub">
      {cn("con.ov.mrr.sub", o.revenue.payingOrganizations)}
    </dd>
    <dd class="sub">{format(t("con.ov.trialMrr"), { n: num(o.revenue.trialMrrUsd) })}</dd>
  </div>
  <div>
    <dt>{t("con.ov.storage")}</dt>
    <dd class="big">{bytes(o.storageBytes)}</dd>
    <dd class="sub">{t("con.ov.storage.sub")}</dd>
  </div>
</dl>

<div class="grid">
  <section class="panel wide" aria-labelledby="signups-title">
    <h2 id="signups-title">{t("con.ov.signups")}</h2>
    <div class="chart" role="img" aria-label={t("con.ov.signups")}>
      {#each o.signupsByWeek as w (w.week)}
        {@const label = format(t("con.ov.signups.week"), { d: day.format(new Date(w.week)), n: String(w.signups) })}
        <div class="col" title={label}>
          <span class="val">{w.signups || ""}</span>
          <span class="bar" style:height="{(w.signups / maxWeek) * 100}%"></span>
          <span class="tick">{day.format(new Date(w.week))}</span>
        </div>
      {/each}
    </div>
    <table class="sr-only">
      <caption>{t("con.ov.signups")}</caption>
      <tbody>
        {#each o.signupsByWeek as w (w.week)}<tr><th>{w.week}</th><td>{w.signups}</td></tr>{/each}
      </tbody>
    </table>
  </section>

  {#each splits as sp (sp.title)}
    <section class="panel" aria-labelledby="{sp.title}-t">
      <h2 id="{sp.title}-t">{tk(sp.title)}</h2>
      <ul class="split">
        {#each sp.rows as r (r.key)}
          <li>
            <span class="split-name">{r.name}</span>
            <span class="split-n">{num(r.n)}</span>
            <span class="meter" aria-hidden="true"><span style:width="{share(r.n, active)}%"></span></span>
          </li>
        {/each}
      </ul>
    </section>
  {/each}

  <section class="panel" aria-labelledby="collected-title">
    <h2 id="collected-title">{t("con.ov.collected")}</h2>
    <p class="muted">{t("con.ov.collected.lead")}</p>
    {#if currencies.length}
      <ul class="money">
        {#each currencies as [cur, c] (cur)}
          <li>
            <strong>{money(c.total, cur)}</strong>
            <span class="muted">{cn("con.ov.payments", c.payments)}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted">{t("con.ov.collected.none")}</p>
    {/if}
    {#if o.people.pendingApplications}
      <p class="muted">{cn("con.ov.applications", o.people.pendingApplications)}</p>
    {/if}
  </section>

  <section class="panel" aria-labelledby="trials-title">
    <h2 id="trials-title">{t("con.ov.trials")}</h2>
    {#if o.trialsEndingSoon.length}
      <ul class="alerts">
        {#each o.trialsEndingSoon as tr (tr.id)}
          <li>
            <a href={resolve("/console/(app)/organisations/[id]", { id: tr.id })}>{tr.name}</a>
            <span class="muted">{date.format(new Date(tr.endsAt))}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted">{t("con.ov.none")}</p>
    {/if}
  </section>

  <section class="panel" aria-labelledby="quota-title">
    <h2 id="quota-title">{t("con.ov.quota")}</h2>
    {#if o.nearMemberQuota.length}
      <ul class="alerts">
        {#each o.nearMemberQuota as q (q.id)}
          <li>
            <a href={resolve("/console/(app)/organisations/[id]", { id: q.id })}>{q.name}</a>
            <span class="muted">{format(t("con.ov.quota.row"), { n: num(q.members), q: num(q.quota) })}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted">{t("con.ov.none")}</p>
    {/if}
  </section>

  <section class="panel" aria-labelledby="health-title">
    <h2 id="health-title">{t("con.ov.health")}</h2>
    <ul class="health">
      <li class="ok">{format(t("con.ov.health.db"), { ms: String(o.health.databaseMs) })}</li>
      {#if o.health.failedJobs24h === null}
        <li class="warn">{t("con.ov.health.na")}</li>
      {:else}
        <li class={o.health.failedJobs24h ? "bad" : "ok"}>
          {format(t("con.ov.health.failed"), { n: num(o.health.failedJobs24h) })}
        </li>
        <li class="ok">{format(t("con.ov.health.queued"), { n: num(o.health.queuedJobs ?? 0) })}</li>
      {/if}
    </ul>
  </section>
</div>

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-4);
    margin-bottom: var(--s-6);
  }
  h1 {
    margin: 0;
    font: 600 var(--fs-32) / 1.1 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  h2 {
    margin: 0 0 var(--s-4);
    font: 600 var(--fs-16) / 1.3 var(--font-display);
  }
  .notice {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--s-4);
    border-radius: var(--r-pill);
    background: var(--c-warning-tint);
    color: var(--c-warning-text);
    font-weight: 600;
    text-decoration: none;
  }
  .kpis {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .kpis > div {
    padding: var(--s-5);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .kpis > div + div {
    border-left: 1px solid var(--c-line);
  }
  dt {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  dd {
    margin: 0;
  }
  .big {
    font: 600 var(--fs-32) / 1.15 var(--font-display);
    font-variant-numeric: tabular-nums;
    letter-spacing: var(--tracking-display);
  }
  .sub,
  .muted {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    line-height: 1.45;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s-4);
    margin-top: var(--s-4);
  }
  .panel {
    padding: var(--s-5);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .wide {
    grid-column: 1 / -1;
  }
  /* Une seule série : barres pétrole, bout arrondi, valeur au-dessus, sans légende. */
  .chart {
    height: 180px;
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: var(--s-2);
    align-items: end;
  }
  .col {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    gap: 4px;
  }
  .bar {
    width: min(36px, 70%);
    min-height: 2px;
    border-radius: 4px 4px 0 0;
    background: var(--c-primary);
  }
  .val {
    font-size: var(--fs-12);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .tick {
    font-size: var(--fs-12);
    color: var(--c-ink-2);
    white-space: nowrap;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .split li {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px var(--s-3);
    padding: var(--s-2) 0;
    border-bottom: 1px solid var(--c-line-soft);
  }
  .split-n {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .meter {
    grid-column: 1 / -1;
    height: 4px;
    border-radius: var(--r-pill);
    background: var(--c-line-soft);
    overflow: hidden;
  }
  .meter span {
    display: block;
    height: 100%;
    background: var(--c-primary);
  }
  .money {
    margin-top: var(--s-3);
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .money li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-3);
  }
  .money strong {
    font: 600 var(--fs-22) / 1.2 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .alerts li {
    display: flex;
    justify-content: space-between;
    gap: var(--s-3);
    padding: var(--s-2) 0;
    border-bottom: 1px solid var(--c-line-soft);
  }
  .alerts a {
    color: var(--c-ink);
    font-weight: 600;
    text-underline-offset: 3px;
  }
  .health {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .health li {
    position: relative;
    padding-left: 18px;
    font-size: var(--fs-14);
  }
  .health li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.45em;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c-success);
  }
  .health li.warn::before {
    background: var(--c-warning);
  }
  .health li.bad::before {
    background: var(--c-danger);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .notice:focus-visible,
  .alerts a:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  @media (max-width: 1100px) {
    .kpis {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .kpis > div:nth-child(4) {
      border-left: 0;
    }
    .kpis > div:nth-child(n + 4) {
      border-top: 1px solid var(--c-line);
    }
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 680px) {
    .kpis,
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .kpis > div + div {
      border-left: 0;
      border-top: 1px solid var(--c-line);
    }
    .tick {
      display: none;
    }
  }
</style>
