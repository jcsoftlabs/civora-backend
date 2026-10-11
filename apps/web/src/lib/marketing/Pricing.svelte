<!--
  Tarifs du site commercial (SOC-12), lus dans packages/shared/src/plans.ts : prix, quotas, assistance. Les
  fonctions listées sont celles qui existent déjà ; ce qui reste à livrer porte la mention « Bientôt ».
-->
<script lang="ts">
  import { ADD_ONS, PLANS, TIERS, type Tier } from "@civora/shared";
  import { resolve } from "$app/paths";
  import { format, translator, type MessageKey } from "$lib/i18n";

  let { locale }: { locale: "fr" | "ht" } = $props();
  const t = $derived(translator(locale));
  const tk = (k: string) => t(k as MessageKey);
  let annual = $state(false);

  /** Ce qu'apporte chaque formule en plus de la précédente ; `soon` : pas encore livré. */
  const FEATURES: Record<Tier, Array<{ key: string; soon?: boolean }>> = {
    essentiel: [
      { key: "members" },
      { key: "dues" },
      { key: "events" },
      { key: "organs" },
      { key: "publications" },
      { key: "dashboard" },
    ],
    mouvement: [{ key: "card" }, { key: "stripe" }, { key: "training" }, { key: "departement" }],
    national: [{ key: "certificates" }, { key: "sections" }, { key: "domain", soon: true }],
  };
  const money = (n: number) =>
    new Intl.NumberFormat(locale === "ht" ? "fr-HT" : "fr-FR", { maximumFractionDigits: 0 })
      .format(n)
      .replace(/[\u202f\u00a0]/g, " ");
</script>

<div class="head">
  <div>
    <h2 id="price-title">{t("mk.price.title")}</h2>
    <p class="lead">{t("mk.price.lead")}</p>
  </div>
  <div class="period" role="group" aria-label={t("mk.price.period")}>
    <button type="button" aria-pressed={!annual} onclick={() => (annual = false)}>{t("mk.price.monthly")}</button>
    <button type="button" aria-pressed={annual} onclick={() => (annual = true)}>
      {t("mk.price.annual")} <span class="note">{t("mk.price.annual.note")}</span>
    </button>
  </div>
</div>

<div class="plans">
  {#each TIERS as tier, i (tier)}
    {@const plan = PLANS[tier]}
    {@const q = plan.quotas}
    <article class="plan" class:featured={tier === "mouvement"} aria-labelledby="plan-{tier}">
      {#if tier === "mouvement"}<p class="popular">{t("mk.price.popular")}</p>{/if}
      <h3 id="plan-{tier}">{tk(`mk.price.${tier}`)}</h3>
      <p class="pitch">{tk(`mk.price.${tier}.pitch`)}</p>
      <p class="amount">
        <span class="num">{money(annual ? plan.priceUsd.annual : plan.priceUsd.monthly)} $</span>
        <span class="per">{t(annual ? "mk.price.perYear" : "mk.price.perMonth")}</span>
      </p>
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
      <a class="choose" href="{resolve('/creer')}?formule={tier}">
        {format(t("mk.price.choose"), { plan: tk(`mk.price.${tier}`) })}
      </a>
      <ul class="quotas">
        <li>
          {q.members === null
            ? t("mk.price.members.unlimited")
            : format(t("mk.price.members"), { n: money(q.members) })}
        </li>
        <li>
          {q.admins === null ? t("mk.price.admins.unlimited") : format(t("mk.price.admins"), { n: String(q.admins) })}
        </li>
        <li>{format(t("mk.price.storage"), { n: String(q.storageGb) })}</li>
        <li>{format(t("mk.price.support"), { s: tk(`mk.price.support.${tier}`) })}</li>
      </ul>
      {#if i > 0}<p class="plus">{t(i === 1 ? "mk.price.everything" : "mk.price.everything2")}</p>{/if}
      <ul class="features">
        {#each FEATURES[tier] as f (f.key)}
          <li class:soon={f.soon}>
            {tk(`mk.price.f.${f.key}`)}
            {#if f.soon}<span class="badge">{t("mk.price.soon")}</span>{/if}
          </li>
        {/each}
      </ul>
      <p class="setup">{format(t("mk.price.setup"), { n: money(ADD_ONS.setupFeeUsd[tier]) })}</p>
    </article>
  {/each}
</div>
<p class="elections">
  {format(t("mk.price.elections"), {
    n: money(ADD_ONS.electionsModule.priceUsd),
    m: String(ADD_ONS.electionsModule.months),
    s: String(ADD_ONS.electionsModule.includedStations),
  })}
  <span class="badge">{t("mk.price.soon")}</span>
</p>

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-end;
    gap: var(--s-6);
  }
  h2 {
    margin: 0;
    font: 600 clamp(30px, 3.6vw, 42px) / 1.12 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .lead {
    margin: var(--s-4) 0 0;
    font-size: var(--fs-19);
    color: var(--c-ink-2);
  }
  .period {
    display: inline-flex;
    padding: 4px;
    border-radius: var(--r-pill);
    background: var(--c-line-soft);
  }
  .period button {
    min-height: 40px;
    padding: 0 var(--s-4);
    border: 0;
    border-radius: var(--r-pill);
    background: transparent;
    color: var(--c-ink-2);
    font: 600 var(--fs-14) / 1 var(--font-ui);
    cursor: pointer;
  }
  .period button[aria-pressed="true"] {
    background: var(--c-surface);
    color: var(--c-ink);
    box-shadow: 0 1px 2px rgb(28 27 25 / 10%);
  }
  .note {
    margin-left: 4px;
    color: var(--c-success-text);
  }
  .plans {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s-5);
    margin-top: var(--s-10);
    align-items: stretch;
  }
  .plan {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: var(--s-8) var(--s-6);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  /* La formule mise en avant s'inverse : fond encre, texte clair, comme la carte sélectionnée. */
  .plan.featured {
    background: var(--c-ink);
    border-color: var(--c-ink);
    color: var(--c-surface);
  }
  .popular {
    position: absolute;
    top: -13px;
    left: var(--s-6);
    margin: 0;
    padding: 4px 12px;
    border-radius: var(--r-pill);
    background: var(--c-accent-bright);
    color: var(--c-on-accent);
    font-size: var(--fs-13);
    font-weight: 600;
  }
  h3 {
    margin: 0;
    font: 600 var(--fs-26) / 1.2 var(--font-display);
  }
  .pitch {
    margin: var(--s-2) 0 0;
    min-height: 3em;
    font-size: var(--fs-15);
    line-height: 1.5;
    color: var(--c-ink-2);
  }
  .featured .pitch,
  .featured .per,
  .featured .setup,
  .featured .plus {
    color: color-mix(in srgb, var(--c-surface) 72%, transparent);
  }
  .amount {
    margin: var(--s-6) 0 0;
    display: flex;
    align-items: baseline;
    gap: var(--s-2);
  }
  .num {
    font: 600 44px / 1 var(--font-display);
    letter-spacing: var(--tracking-display);
    font-variant-numeric: tabular-nums;
  }
  .per {
    color: var(--c-ink-2);
  }
  .choose {
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: var(--s-6);
    border: 1.5px solid var(--c-ink);
    border-radius: var(--r-pill);
    color: var(--c-ink);
    font-weight: 600;
    text-decoration: none;
  }
  .choose:hover {
    background: var(--c-ink);
    color: var(--c-surface);
  }
  .featured .choose {
    background: var(--c-surface);
    border-color: var(--c-surface);
    color: var(--c-ink);
  }
  .featured .choose:hover {
    background: var(--c-accent-bright);
    border-color: var(--c-accent-bright);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .quotas {
    margin-top: var(--s-6);
    padding: var(--s-5) 0;
    border-block: 1px solid var(--c-line);
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    font-weight: 600;
  }
  .featured .quotas {
    border-color: rgb(255 255 255 / 16%);
  }
  .plus {
    margin: var(--s-5) 0 0;
    font-size: var(--fs-14);
    color: var(--c-ink-2);
  }
  .features {
    margin-top: var(--s-3);
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    flex: 1;
  }
  .features li {
    position: relative;
    padding-left: 26px;
    line-height: 1.45;
  }
  .features li::before {
    content: "";
    position: absolute;
    left: 2px;
    top: 0.42em;
    width: 11px;
    height: 6px;
    border-left: 2.5px solid var(--c-primary);
    border-bottom: 2.5px solid var(--c-primary);
    transform: rotate(-45deg);
  }
  .featured .features li::before {
    border-color: var(--c-accent-bright);
  }
  .features li.soon {
    color: var(--c-ink-2);
  }
  .badge {
    display: inline-block;
    margin-left: 6px;
    padding: 2px 8px;
    border-radius: var(--r-pill);
    background: var(--c-accent-tint);
    color: var(--c-on-accent);
    font-size: var(--fs-12);
    font-weight: 600;
  }
  .setup {
    margin: var(--s-6) 0 0;
    font-size: var(--fs-13);
    line-height: 1.5;
    color: var(--c-ink-2);
  }
  .elections {
    margin: var(--s-6) 0 0;
    font-size: var(--fs-15);
    color: var(--c-ink-2);
  }
  .period button:focus-visible,
  .choose:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  @media (max-width: 960px) {
    .plans {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--s-8);
    }
    .pitch {
      min-height: 0;
    }
  }
</style>
