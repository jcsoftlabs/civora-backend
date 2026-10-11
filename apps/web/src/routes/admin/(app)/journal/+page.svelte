<!--
  Journal d'audit (SEC-06) : chaque action sensible, scellée à la précédente. En tête, la vérification de la
  chaîne : un tampon « Intègre » quand rien n'a été modifié ni retiré (le seul moment animé de l'écran).
  Puis les lignes, filtrables par domaine, avec qui a agi, quand (AM / PM, heure d'Haïti) et le détail.
-->
<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";
  import { Button } from "@civora/ui";
  import { formatDateTime, formatDayTime } from "$lib/datetime";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { ActionData, PageData } from "./$types";
  import { FAMILIES } from "./families";

  let { data, form }: { data: PageData & { locale: "fr" | "ht" }; form: ActionData } = $props();
  const t = $derived(translator(data.locale));
  const base = resolve("/admin/journal");
  const params = $derived(page.url.searchParams);
  let pending = $state(false);

  /** Libellé d'une action connue, sinon son code technique (nouvelle action pas encore traduite). */
  function actionLabel(a: string) {
    const key = `audit.a.${a}` as MessageKey;
    const v = t(key);
    return v === key || !v ? a : v;
  }
  /** Détail lisible : chaque champ du journal, listes résumées par leur taille. */
  function details(m: Record<string, unknown> | null): Array<[string, string]> {
    if (!m) return [];
    return Object.entries(m).map(([k, v]) => [
      k,
      Array.isArray(v)
        ? v.length > 3
          ? format(t("admin.audit.items"), { n: String(v.length) })
          : v.join(", ")
        : v === null
          ? ""
          : typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)
            ? formatDayTime(v)
            : typeof v === "object"
              ? JSON.stringify(v)
              : String(v),
    ]);
  }
  const verified = $derived(
    (form as { verified?: { intact: boolean; brokenAt: number | null; checked: number; at: string } } | null)
      ?.verified ?? null,
  );
  // eslint-disable-next-line svelte/no-navigation-without-resolve
  const go = (family: string) => goto(family ? `${base}?domaine=${family}` : base, { noScroll: true, keepFocus: true });
</script>

<main>
  <header class="head">
    <div>
      <p class="crumb">{data.party.name}</p>
      <h1>{t("admin.audit.title")}</h1>
      <p class="lead">{t("admin.audit.lead")}</p>
    </div>
  </header>

  <section class="check" class:bad={verified && !verified.intact} aria-live="polite">
    {#if verified}
      <span class="stamp" class:bad={!verified.intact} aria-hidden="true">
        {verified.intact ? t("admin.audit.stamp") : "!"}
      </span>
      <div>
        <h2>{t(verified.intact ? "admin.audit.intact" : "admin.audit.broken")}</h2>
        <p>
          {verified.intact
            ? format(t("admin.audit.intact.lead"), { n: String(verified.checked), date: formatDateTime(verified.at) })
            : format(t("admin.audit.broken.lead"), { seq: String(verified.brokenAt) })}
        </p>
      </div>
    {:else}
      <p class="muted">{t("admin.audit.lead")}</p>
    {/if}
    <form
      method="POST"
      action="?/verify"
      use:enhance={() => {
        pending = true;
        return async ({ update }) => {
          await update({ invalidateAll: false });
          pending = false;
        };
      }}
    >
      <Button type="submit" variant={verified ? "secondary" : "primary"} {pending}>{t("admin.audit.verify")}</Button>
    </form>
  </section>

  <div class="bar">
    <label class="pill">
      <span>{t("admin.audit.family")}</span>
      <select value={data.family ?? ""} onchange={(e) => go(e.currentTarget.value)}>
        <option value="">{t("admin.audit.allFamilies")}</option>
        {#each FAMILIES as f (f)}<option value={f}>{t(`audit.f.${f}` as MessageKey)}</option>{/each}
      </select>
    </label>
  </div>

  {#if data.entries.length === 0}
    <p class="empty">{t("admin.audit.empty")}</p>
  {:else}
    <ol class="log">
      {#each data.entries as e (e.seq)}
        {@const d = details(e.metadata)}
        <li>
          <span class="seq" title={e.hash}>{format(t("admin.audit.seq"), { n: String(e.seq) })}</span>
          <span class="when">{formatDayTime(e.createdAt)}</span>
          <span class="what">
            <strong class:sensitive={e.action.startsWith("identity.") || e.action.startsWith("export.")}>
              {actionLabel(e.action)}
            </strong>
            <span class="who">
              {e.actor
                ? `${e.actor.firstName} ${e.actor.lastName} · ${e.actor.number}`
                : e.actorKind === "system"
                  ? t("admin.audit.system")
                  : t("admin.audit.unknown")}
            </span>
          </span>
          {#if d.length}
            <details>
              <summary>{t("admin.audit.showDetails")}</summary>
              <dl>
                {#each d as [k, v] (k)}<div>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>{/each}
              </dl>
            </details>
          {/if}
        </li>
      {/each}
    </ol>
    {#if data.nextBefore}
      <div>
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <Button
          variant="secondary"
          href="{base}?{params.get('domaine') ? `domaine=${params.get('domaine')}&` : ''}avant={data.nextBefore}"
        >
          {t("admin.audit.more")}
        </Button>
      </div>
    {/if}
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
    padding: var(--s-6) var(--s-8) var(--s-10);
    max-width: 1100px;
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
  .lead,
  .muted {
    margin: var(--s-2) 0 0;
    max-width: 640px;
    color: var(--c-ink-2);
    line-height: 1.5;
  }
  .muted {
    margin: 0;
    flex: 1;
  }
  .check {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-5);
    padding: var(--s-5) var(--s-6);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .check > div {
    flex: 1;
    min-width: 220px;
  }
  .check h2 {
    margin: 0 0 var(--s-1);
    font: 600 var(--fs-19) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .check p {
    margin: 0;
    color: var(--c-ink-2);
    line-height: 1.5;
  }
  .check.bad {
    border-color: var(--c-danger);
    background: var(--c-danger-tint);
  }
  /* Tampon : double cadre, encre granuleuse, légère rotation, il s'écrase une fois. */
  .stamp {
    flex: none;
    display: grid;
    place-items: center;
    min-width: 116px;
    padding: var(--s-2) var(--s-4);
    border: 3px solid var(--c-success);
    outline: 1px solid var(--c-success);
    outline-offset: 3px;
    border-radius: var(--r-sm);
    color: var(--c-success);
    font: 600 var(--fs-22) / 1.12 var(--font-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    transform: rotate(-6deg);
    opacity: 0.92;
    animation: stamp 0.45s cubic-bezier(0.2, 1.6, 0.4, 1) both;
  }
  .stamp.bad {
    border-color: var(--c-stamp);
    outline-color: var(--c-stamp);
    color: var(--c-stamp);
  }
  @keyframes stamp {
    from {
      transform: rotate(-6deg) scale(1.8);
      opacity: 0;
    }
  }
  .bar {
    display: flex;
    gap: var(--s-2);
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
  .pill select:focus-visible,
  summary:focus-visible {
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
  }
  .log {
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .log li {
    display: grid;
    grid-template-columns: 90px 150px minmax(0, 1fr);
    align-items: start;
    gap: var(--s-2) var(--s-4);
    padding: var(--s-3) var(--s-5);
  }
  .log li + li {
    border-top: 1px solid var(--c-line-soft);
  }
  .seq {
    font-size: var(--fs-12);
    color: var(--c-ink-3);
    font-variant-numeric: tabular-nums;
  }
  .when {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .what {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .what strong {
    font-weight: 600;
  }
  .what strong.sensitive {
    color: var(--c-danger-text);
  }
  .who {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  details {
    grid-column: 3;
  }
  summary {
    width: fit-content;
    font-size: var(--fs-13);
    font-weight: 600;
    cursor: pointer;
    border-radius: 4px;
  }
  dl {
    margin: var(--s-2) 0 0;
    padding: var(--s-3);
    border-radius: var(--r-sm);
    background: var(--c-paper);
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: var(--fs-13);
  }
  dl div {
    display: grid;
    grid-template-columns: 140px minmax(0, 1fr);
    gap: var(--s-2);
  }
  dt {
    color: var(--c-ink-2);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  @media (max-width: 760px) {
    main {
      padding: var(--s-5) var(--s-4) var(--s-8);
    }
    .log li {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .seq {
      order: 2;
      text-align: right;
    }
    .when {
      order: 1;
    }
    .what,
    details {
      grid-column: 1 / -1;
      order: 3;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .stamp {
      animation: none;
    }
  }
</style>
