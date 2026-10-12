<!--
  Assistant de démarrage (SOC-09), en tête du tableau de bord tant qu'il n'est pas masqué : les étapes qui
  rendent un espace utilisable, cochées d'un tampon « Fait » dès que la donnée existe (rien à cocher à la main).
  La prochaine étape porte la seule action principale ; chaque étape peut être passée, puis reprise.
-->
<script lang="ts" module>
  export interface OnboardingStep {
    key: "identity" | "admission" | "dues" | "organs" | "members" | "card" | "invite";
    done: boolean;
    skipped: boolean;
    detail?: Record<string, number | boolean>;
  }
  export interface OnboardingState {
    steps: OnboardingStep[];
    remaining: number;
    completed: boolean;
    dismissed: boolean;
  }
</script>

<script lang="ts">
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import { organizationKind } from "$lib/i18n/org";

  interface Props {
    locale: "fr" | "ht";
    partyName: string;
    state: OnboardingState;
  }
  let { locale, partyName, state }: Props = $props();
  const orgKind = organizationKind();
  const t = $derived(translator(locale, orgKind()));
  const tk = (k: string) => t(k as MessageKey);

  const HREF: Record<OnboardingStep["key"], string> = {
    identity: `${resolve("/admin/reglages")}#identity`,
    admission: `${resolve("/admin/reglages")}#admission`,
    dues: resolve("/admin/cotisations"),
    organs: resolve("/admin/organes"),
    members: resolve("/admin/membres/importer"),
    card: resolve("/admin/membres/carte"),
    invite: resolve("/admin/membres/importer"),
  };
  const next = $derived(state.steps.find((s) => !s.done && !s.skipped)?.key ?? null);
  const doneCount = $derived(state.steps.filter((s) => s.done).length);
  /** Précision sous une étape faite ou à faire (paiement en ligne non relié, nombre de membres). */
  function hint(s: OnboardingStep): string | null {
    if (s.key === "dues" && s.done && s.detail?.merchants === 0) return t("onb.hint.noMerchant");
    return null;
  }
</script>

<section class="onb" aria-labelledby="onb-title">
  <div class="top">
    <div>
      <h2 id="onb-title">
        {state.completed ? t("onb.doneTitle") : format(t("onb.title"), { name: partyName })}
      </h2>
      <p class="lead">{state.completed ? t("onb.doneLead") : t("onb.lead")}</p>
    </div>
    <div class="progress">
      <span>{format(t("onb.progress"), { done: String(doneCount), total: String(state.steps.length) })}</span>
      <span class="segs" aria-hidden="true">
        {#each state.steps as s (s.key)}<span class:on={s.done} class:skip={s.skipped}></span>{/each}
      </span>
    </div>
  </div>

  <ol class="steps">
    {#each state.steps as s, i (s.key)}
      <li class:done={s.done} class:skipped={s.skipped} class:next={s.key === next}>
        <span class="num" aria-hidden="true">{i + 1}</span>
        <div class="body">
          <h3>{tk(`onb.${s.key}.title`)}</h3>
          <p>{hint(s) ?? tk(`onb.${s.key}.lead`)}</p>
        </div>
        <div class="act">
          {#if s.done}
            <span class="stamp">{t("onb.stamp")}</span>
            <span class="sr-only">{t("onb.doneSr")}</span>
          {:else if s.skipped}
            <span class="muted">{t("onb.skipped")}</span>
            <form method="POST" action="?/onboarding" use:enhance>
              <input type="hidden" name="unskip" value={s.key} />
              <button type="submit" class="link">{t("onb.resume")}</button>
            </form>
          {:else}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a class="go" class:primary={s.key === next} href={HREF[s.key]}>{tk(`onb.${s.key}.cta`)}</a>
            <form method="POST" action="?/onboarding" use:enhance>
              <input type="hidden" name="skip" value={s.key} />
              <button type="submit" class="link">{t("onb.skip")}</button>
            </form>
          {/if}
        </div>
      </li>
    {/each}
  </ol>

  <form method="POST" action="?/onboarding" use:enhance class="hide">
    <input type="hidden" name="dismiss" value="1" />
    <button type="submit" class="link">{state.completed ? t("onb.close") : t("onb.hide")}</button>
  </form>
</section>

<style>
  .onb {
    margin-bottom: var(--s-6);
    padding: var(--s-6);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-end;
    gap: var(--s-4);
    margin-bottom: var(--s-5);
  }
  h2 {
    margin: 0 0 var(--s-1);
    font: 600 var(--fs-22) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .lead {
    margin: 0;
    max-width: 58ch;
    color: var(--c-ink-2);
    line-height: 1.5;
  }
  .progress {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--s-2);
    font-size: var(--fs-13);
    font-weight: 600;
    color: var(--c-ink-2);
    font-variant-numeric: tabular-nums;
  }
  .segs {
    display: flex;
    gap: 4px;
  }
  .segs span {
    width: 26px;
    height: 8px;
    border-radius: var(--r-pill);
    background: var(--c-line);
  }
  .segs .on {
    background: var(--c-primary);
  }
  .segs .skip {
    background: var(--c-line-soft);
  }
  .steps {
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--c-line-soft);
  }
  .steps li {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) auto;
    gap: var(--s-4);
    align-items: center;
    padding: var(--s-4) 0;
    border-bottom: 1px solid var(--c-line-soft);
  }
  .num {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border: 1.5px solid var(--c-line);
    border-radius: 50%;
    font: 600 var(--fs-14) / 1 var(--font-ui);
    color: var(--c-ink-2);
  }
  .next .num {
    background: var(--c-ink);
    border-color: var(--c-ink);
    color: var(--c-surface);
  }
  .done .num {
    background: var(--c-primary-tint);
    border-color: var(--c-primary);
    color: var(--c-primary);
  }
  h3 {
    margin: 0 0 2px;
    font: 600 var(--fs-16) / 1.3 var(--font-display);
  }
  .body p {
    margin: 0;
    font-size: var(--fs-14);
    color: var(--c-ink-2);
    line-height: 1.45;
  }
  .done h3,
  .skipped h3 {
    color: var(--c-ink-2);
  }
  .act {
    display: flex;
    align-items: center;
    gap: var(--s-3);
  }
  .go {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--s-4);
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
    color: var(--c-ink);
    font: 600 var(--fs-14) / 1 var(--font-ui);
    text-decoration: none;
    white-space: nowrap;
  }
  .go:hover {
    border-color: var(--c-ink);
  }
  .go.primary {
    background: var(--c-primary);
    border-color: var(--c-primary);
    color: var(--c-on-primary);
  }
  .go:focus-visible,
  .link:focus-visible {
    box-shadow: var(--focus-ring);
  }
  .link {
    min-height: 40px;
    padding: 0 var(--s-1);
    border: 0;
    background: none;
    color: var(--c-ink-2);
    font: 500 var(--fs-13) / 1 var(--font-ui);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .muted {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .stamp {
    padding: 2px 10px;
    border: 2.5px solid var(--c-stamp);
    border-radius: var(--r-sm);
    color: var(--c-stamp);
    font: 700 var(--fs-13) / 1.3 var(--font-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    transform: rotate(-6deg);
    mask-image: radial-gradient(circle at 30% 40%, #000 60%, rgb(0 0 0 / 0.75) 61%, #000 75%);
  }
  .hide {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--s-3);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  @media (max-width: 760px) {
    .onb {
      padding: var(--s-5) var(--s-4);
    }
    .steps li {
      grid-template-columns: 32px minmax(0, 1fr);
    }
    .act {
      grid-column: 2;
      flex-wrap: wrap;
    }
    .progress {
      align-items: flex-start;
    }
  }
</style>
