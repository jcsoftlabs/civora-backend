<!--
  Tableau de bord (PIL-01) : accueil du back-office. Fil des zones, bande de chiffres clés découpée par des
  filets (pas de cartes identiques), tendance des nouveaux membres sur six mois, puis le détail par sous-zone,
  où l'on descend d'un niveau en un clic. En bas, les options hors formule restent visibles, verrouillées (SOC-07).
  Agrégats seulement : aucun nom de membre.
-->
<script lang="ts">
  import { resolve } from "$app/paths";
  import { hasFeature, requiredTier, type Feature } from "@civora/shared";
  import { Locked } from "@civora/ui";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { PageData } from "./$types";
  import type { ZoneStats } from "./+page.server";

  let { data }: { data: PageData & { locale: "fr" | "ht" } } = $props();
  const t = $derived(translator(data.locale));
  const tk = (k: string) => t(k as MessageKey);
  const base = resolve("/admin");
  const pendingHref = `${resolve("/admin/membres")}?state=pending`;
  const name = (z: { name: string; nameHt?: string | null }) => (data.locale === "ht" && z.nameHt) || z.name;
  const stats = $derived(data.stats);
  const zone = $derived(stats?.zone ?? null);

  const num = new Intl.NumberFormat("fr-FR");
  const money = (amount: string, currency: string) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
      currencyDisplay: currency === "HTG" ? "code" : "symbol",
    }).format(Number(amount));
  const collected = (c: Record<string, string>) =>
    Object.keys(c).length
      ? Object.entries(c)
          .map(([cur, a]) => money(a, cur))
          .join(" + ")
      : t("admin.dash.none");
  /** Part des membres validés à jour de cotisation (null s'il n'y a personne). */
  const rate = (z: ZoneStats) => (z.members.approved ? Math.round((z.dues.upToDate / z.members.approved) * 100) : null);

  // Tendance : six barres, la plus haute à pleine hauteur.
  const trend = $derived(stats?.trend ?? []);
  const peak = $derived(Math.max(1, ...trend.map((m) => m.newMembers)));
  const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });
  const monthLabel = (ym: string) => monthFmt.format(new Date(`${ym}-15T12:00:00Z`));

  const children = $derived([...(stats?.children ?? [])].sort((a, b) => b.members.approved - a.members.approved));
  const childLevel = $derived(children[0]?.level ?? null);
  const canDrill = (z: ZoneStats) => z.level !== "section_communale" && z.level !== "diaspora_ville";
  const parent = $derived(data.ancestors.at(-1) ?? null);

  // Options hors formule, montrées verrouillées avec la formule qui les ouvre.
  const UPSELL: Array<{ feature: Feature; key: string }> = [
    { feature: "bi.dashboards", key: "dashboards" },
    { feature: "bi.exports", key: "exports" },
    { feature: "bi.connector", key: "connector" },
    { feature: "analytics.ai", key: "ai" },
  ];
  const locked = $derived(data.me.tier ? UPSELL.filter((u) => !hasFeature(data.me.tier!, u.feature)) : []);
</script>

{#if stats && zone}
  <main>
    <header class="head">
      <nav class="crumbs" aria-label={t("admin.dash.zone")}>
        <!-- eslint-disable svelte/no-navigation-without-resolve -->
        {#each data.ancestors as a (a.code)}
          <a href="{base}?zone={a.code}">{a.name}</a><span aria-hidden="true">›</span>
        {/each}
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
        <span aria-current="page">{name(zone)}</span>
      </nav>
      <h1>{t("admin.dash.title")}</h1>
    </header>

    <!-- Chiffres clés : une bande, des filets verticaux, un chiffre par case. -->
    <dl class="kpis">
      <div>
        <dt>{t("admin.dash.kpi.members")}</dt>
        <dd class="big">{num.format(zone.members.approved)}</dd>
        <dd class="sub up">{format(t("admin.dash.kpi.new"), { n: String(zone.members.newLast30Days) })}</dd>
      </div>
      <div>
        <dt>{t("admin.dash.kpi.pending")}</dt>
        <dd class="big">{num.format(zone.members.pending)}</dd>
        {#if zone.members.pending > 0 && data.me.permissions.includes("members.read")}
          <dd class="sub">
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={pendingHref}>{t("admin.dash.kpi.pendingLink")}</a>
          </dd>
        {/if}
      </div>
      <div>
        <dt>{t("admin.dash.kpi.dues")}</dt>
        <dd class="big">{rate(zone) === null ? "0 %" : `${rate(zone)} %`}</dd>
        <dd class="meter" aria-hidden="true"><span style:width="{rate(zone) ?? 0}%"></span></dd>
        <dd class="sub">{format(t("admin.dash.kpi.late"), { n: String(zone.dues.late) })}</dd>
      </div>
      <div>
        <dt>{t("admin.dash.kpi.collected")}</dt>
        <dd class="big money">{collected(zone.dues.collectedLast30Days)}</dd>
        <dd class="sub">{t("admin.dash.kpi.last30")}</dd>
      </div>
      <div>
        <dt>{t("admin.dash.kpi.engagement")}</dt>
        <dd class="big">{num.format(zone.engagement.eventRegistrationsLast30Days)}</dd>
        <dd class="sub">{t("admin.dash.kpi.last30")}</dd>
      </div>
    </dl>

    <section class="trend" aria-labelledby="trend-title">
      <h2 id="trend-title">{t("admin.dash.trend")}</h2>
      <div class="bars" aria-hidden="true">
        {#each trend as m, i (m.month)}
          <div class="col" title="{monthLabel(m.month)} : {m.newMembers}">
            <span class="val">{i === trend.length - 1 ? m.newMembers : ""}</span>
            <span class="bar" style:height="{Math.max(2, (m.newMembers / peak) * 100)}%"></span>
            <span class="mon">{monthLabel(m.month)}</span>
          </div>
        {/each}
      </div>
      <table class="sr-only">
        <caption>{t("admin.dash.trend")}</caption>
        <tbody>
          {#each trend as m (m.month)}<tr><th scope="row">{monthLabel(m.month)}</th><td>{m.newMembers}</td></tr>{/each}
        </tbody>
      </table>
    </section>

    {#if children.length}
      <section class="zones" aria-labelledby="zones-title">
        <div class="zones-head">
          <h2 id="zones-title">{format(t("admin.dash.children"), { level: tk(`admin.dash.level.${childLevel}`) })}</h2>
          <!-- eslint-disable svelte/no-navigation-without-resolve -->
          {#if parent}
            <a class="uplink" href="{base}?zone={parent.code}">{format(t("admin.dash.up"), { zone: parent.name })}</a>
          {:else if zone.code === "HT"}
            <a class="uplink" href="{base}?zone=DIA">{t("admin.dash.diaspora")}</a>
          {:else if zone.code === "DIA"}
            <a class="uplink" href="{base}?zone=HT">{t("admin.dash.haiti")}</a>
          {/if}
          <!-- eslint-enable svelte/no-navigation-without-resolve -->
        </div>
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">{t("admin.dash.col.zone")}</th>
                <th scope="col" class="end">{t("admin.dash.col.members")}</th>
                <th scope="col" class="end">{t("admin.dash.col.new")}</th>
                <th scope="col">{t("admin.dash.col.dues")}</th>
                <th scope="col" class="end">{t("admin.dash.col.collected")}</th>
                <th scope="col" class="end">{t("admin.dash.col.events")}</th>
              </tr>
            </thead>
            <tbody>
              {#each children as c (c.code)}
                {@const r = rate(c)}
                <tr class:empty={c.members.approved === 0 && c.members.pending === 0}>
                  <th scope="row">
                    {#if canDrill(c)}
                      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
                      <a href="{base}?zone={c.code}" aria-label={format(t("admin.dash.open"), { zone: name(c) })}
                        >{name(c)}</a
                      >
                    {:else}
                      {name(c)}
                    {/if}
                  </th>
                  <td class="end num">{num.format(c.members.approved)}</td>
                  <td class="end num">{c.members.newLast30Days ? `+${c.members.newLast30Days}` : "0"}</td>
                  <td>
                    {#if r !== null}
                      <span class="rate">
                        <span class="meter small" aria-hidden="true"><span style:width="{r}%"></span></span>
                        <span class="num">{r} %</span>
                      </span>
                    {/if}
                  </td>
                  <td class="end num">{collected(c.dues.collectedLast30Days)}</td>
                  <td class="end num">{num.format(c.engagement.eventRegistrationsLast30Days)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    {#if locked.length}
      <section class="more" aria-labelledby="more-title">
        <h2 id="more-title">{t("admin.dash.more")}</h2>
        <div class="locks">
          {#each locked as l (l.key)}
            <Locked
              title={tk(`admin.dash.lock.${l.key}`)}
              message={`${tk(`admin.dash.lock.${l.key}.desc`)} ${format(t("plan.lockedIn"), {
                tier: tk(`plan.${requiredTier(l.feature) ?? "national"}`),
              })}`}
            />
          {/each}
        </div>
      </section>
    {/if}
  </main>
{/if}

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: var(--s-6);
    padding: var(--s-6) var(--s-8) var(--s-10);
  }
  .crumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-2);
    margin-bottom: var(--s-2);
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .crumbs a {
    color: var(--c-ink-2);
    text-underline-offset: 3px;
  }
  .crumbs [aria-current] {
    color: var(--c-ink);
    font-weight: 600;
  }
  h1 {
    margin: 0;
    font: 800 var(--fs-32) / 1.05 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  h2 {
    margin: 0;
    font: 700 var(--fs-19) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
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
    min-width: 0;
    padding: var(--s-5);
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
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
    font: 800 var(--fs-32) / 1.05 var(--font-display);
    letter-spacing: var(--tracking-display);
    font-variant-numeric: tabular-nums;
  }
  .big.money {
    font-size: var(--fs-22);
    padding-top: var(--s-2);
  }
  .sub {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .sub.up {
    color: var(--c-success-text);
    font-weight: 600;
  }
  .sub a {
    color: var(--c-ink);
    font-weight: 600;
    text-underline-offset: 3px;
  }
  .meter {
    height: 6px;
    margin: var(--s-2) 0 var(--s-1);
    border-radius: var(--r-pill);
    background: var(--c-line-soft);
    overflow: hidden;
  }
  .meter span {
    display: block;
    height: 100%;
    border-radius: var(--r-pill);
    background: var(--c-success);
  }
  .meter.small {
    width: 72px;
    margin: 0;
  }
  .trend,
  .zones {
    padding: var(--s-5) var(--s-6);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .bars {
    height: 140px;
    margin-top: var(--s-4);
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: var(--s-3);
    align-items: end;
  }
  .col {
    height: 100%;
    display: grid;
    grid-template-rows: 20px 1fr 20px;
    justify-items: center;
    align-items: end;
  }
  .bar {
    width: min(48px, 70%);
    border-radius: 4px 4px 0 0;
    background: var(--c-primary);
  }
  .val {
    font: 700 var(--fs-14) / 1 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .mon {
    align-self: start;
    padding-top: var(--s-1);
    font-size: var(--fs-12);
    color: var(--c-ink-2);
  }
  .zones-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-3);
    margin-bottom: var(--s-3);
  }
  .uplink {
    font-size: var(--fs-14);
    color: var(--c-ink);
    font-weight: 600;
    text-underline-offset: 3px;
  }
  .scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-14);
  }
  thead th {
    padding: var(--s-2) var(--s-3);
    text-align: left;
    font-size: var(--fs-13);
    font-weight: 600;
    color: var(--c-ink-2);
    border-bottom: 1px solid var(--c-line);
    white-space: nowrap;
  }
  tbody th,
  tbody td {
    padding: var(--s-3);
    border-bottom: 1px solid var(--c-line-soft);
    text-align: left;
    font-weight: 400;
    white-space: nowrap;
  }
  tbody th {
    font-weight: 600;
  }
  tbody th a {
    color: var(--c-ink);
    text-underline-offset: 3px;
  }
  tr.empty {
    color: var(--c-ink-3);
  }
  tr.empty th a {
    color: var(--c-ink-2);
  }
  .end {
    text-align: right !important;
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  .rate {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
  }
  .crumbs a:focus-visible,
  .uplink:focus-visible,
  tbody th a:focus-visible,
  .sub a:focus-visible {
    outline: none;
    border-radius: 4px;
    box-shadow: var(--focus-ring);
  }
  .more {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }
  .locks {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--s-3);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
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
  }
  @media (max-width: 640px) {
    main {
      padding: var(--s-5) var(--s-4) var(--s-8);
    }
    .kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .kpis > div {
      border-left: 0 !important;
      border-top: 1px solid var(--c-line);
    }
    .kpis > div:nth-child(-n + 2) {
      border-top: 0;
    }
    .kpis > div:nth-child(even) {
      border-left: 1px solid var(--c-line) !important;
    }
  }
</style>
