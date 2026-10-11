<!--
  Création manuelle d'une organisation (SOC-10) : type, nom, adresse, formule, puis le fondateur (nom, e-mail,
  zone). L'espace est actif tout de suite ; le fondateur reçoit une invitation par e-mail.
-->
<script lang="ts">
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";
  import { Button, Field } from "@civora/ui";
  import { ORGANIZATION_KINDS } from "@civora/shared";
  import { translator, type MessageKey } from "$lib/i18n";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData & { locale: "fr" | "ht" }; form: ActionData } = $props();
  const t = $derived(translator(data.locale));
  const tk = (k: string) => t(k as MessageKey);
  const v = $derived((form as { values?: Record<string, string> } | null)?.values ?? {});
  let kind = $derived(v.kind || "party");
  let tier = $derived(v.tier || "essentiel");
  let name = $derived(v.name ?? "");
  let slug = $derived(v.slug ?? "");
  let slugTouched = $state(false);
  let zoneQuery = $derived(v.zoneLabel ?? "");
  let zoneCode = $derived(v.zoneCode ?? "");
  let results = $state<Array<{ code: string; name: string; context: string | null }>>([]);
  let pending = $state(false);

  const slugify = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  $effect(() => {
    if (!slugTouched) slug = slugify(name);
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  function searchZones() {
    clearTimeout(timer);
    zoneCode = "";
    const q = zoneQuery;
    if (q.trim().length < 2) return void (results = []);
    timer = setTimeout(async () => {
      const r = await fetch(`/console/zones?q=${encodeURIComponent(q)}`);
      if (q === zoneQuery) results = ((await r.json()) as { zones: typeof results }).zones;
    }, 250);
  }
  function pick(z: { code: string; name: string; context: string | null }) {
    zoneCode = z.code;
    zoneQuery = [z.name, z.context].filter(Boolean).join(", ");
    results = [];
  }
  const code = $derived((form as { code?: string } | null)?.code);
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
<a class="back" href={resolve("/console/(app)/organisations")}>← {t("con.org.back")}</a>
<h1>{t("con.new.title")}</h1>
<p class="lead">{t("con.new.lead")}</p>

<form
  method="POST"
  class="form"
  use:enhance={() => {
    pending = true;
    return async ({ update }) => {
      await update({ reset: false });
      pending = false;
    };
  }}
>
  <fieldset>
    <legend>{t("con.new.org")}</legend>
    <div class="kinds" role="radiogroup" aria-label={t("con.new.kind")}>
      {#each ORGANIZATION_KINDS as k (k)}
        <label class="kind" class:on={kind === k}>
          <input type="radio" name="kind" value={k} bind:group={kind} />
          {tk(`create.kind.${k}`)}
        </label>
      {/each}
    </div>
    <div class="two">
      <Field label={t("con.new.name")} name="name" required minlength={2} maxlength={120} bind:value={name} />
      <Field
        label={t("con.new.slug")}
        hint="{t('con.new.slug.hint')} {slug || '…'}.civora.app"
        name="slug"
        required
        maxlength={40}
        bind:value={slug}
        oninput={() => (slugTouched = true)}
        autocapitalize="none"
        spellcheck={false}
      />
    </div>
    <label class="select">
      <span>{t("con.new.tier")}</span>
      <select name="tier" bind:value={tier}>
        {#each ["essentiel", "mouvement", "national"] as k (k)}<option value={k}>{tk(`plan.${k}`)}</option>{/each}
      </select>
    </label>
  </fieldset>

  <fieldset>
    <legend>{t("con.new.founder")}</legend>
    <div class="two">
      <Field label={t("con.new.firstName")} name="firstName" required maxlength={80} value={v.firstName ?? ""} />
      <Field label={t("con.new.lastName")} name="lastName" required maxlength={80} value={v.lastName ?? ""} />
    </div>
    <Field label={t("con.new.email")} name="email" type="email" required maxlength={254} value={v.email ?? ""} />
    <div class="zone">
      <Field
        label={t("con.new.zone")}
        placeholder={t("con.new.zone.search")}
        name="zoneLabel"
        bind:value={zoneQuery}
        oninput={searchZones}
        autocomplete="off"
      />
      <input type="hidden" name="zoneCode" value={zoneCode} />
      {#if results.length}
        <ul class="results">
          {#each results as z (z.code)}
            <li>
              <button type="button" onclick={() => pick(z)}>
                <strong>{z.name}</strong>{#if z.context}<span>{z.context}</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {:else if zoneQuery.trim().length >= 2 && !zoneCode}
        <p class="muted">{t("con.new.zone.none")}</p>
      {/if}
    </div>
  </fieldset>

  {#if code}<p class="error" role="alert">{tk(`error.${code}`)}</p>{/if}
  <div class="row">
    <Button type="submit" {pending} disabled={!zoneCode}>{t("con.new.submit")}</Button>
  </div>
</form>

<style>
  .back {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    text-underline-offset: 3px;
  }
  h1 {
    margin: var(--s-2) 0 var(--s-2);
    font: 600 var(--fs-32) / 1.1 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .lead,
  .muted {
    margin: 0;
    color: var(--c-ink-2);
  }
  .muted {
    font-size: var(--fs-13);
  }
  .form {
    max-width: 760px;
    margin-top: var(--s-6);
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
  }
  fieldset {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    padding: var(--s-5);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  legend {
    padding: 0 var(--s-2);
    font: 600 var(--fs-16) / 1 var(--font-display);
  }
  .kinds {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  .kind {
    position: relative;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--s-4);
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
    cursor: pointer;
  }
  .kind input {
    position: absolute;
    opacity: 0;
  }
  .kind.on {
    background: var(--c-ink);
    border-color: var(--c-ink);
    color: var(--c-surface);
  }
  .kind:has(input:focus-visible) {
    box-shadow: var(--focus-ring);
  }
  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-3);
  }
  .select {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    font-size: var(--fs-14);
    font-weight: 600;
  }
  select {
    max-width: 280px;
    min-height: 44px;
    padding: 0 var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    font: 500 var(--fs-14) / 1 var(--font-ui);
  }
  .zone {
    position: relative;
  }
  .results {
    margin: var(--s-1) 0 0;
    padding: var(--s-1);
    list-style: none;
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
  }
  .results button {
    width: 100%;
    min-height: 44px;
    display: flex;
    gap: var(--s-2);
    align-items: baseline;
    padding: 0 var(--s-3);
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    text-align: left;
    cursor: pointer;
    font: 400 var(--fs-14) / 1.2 var(--font-ui);
  }
  .results button:hover {
    background: var(--c-paper);
  }
  .results span {
    color: var(--c-ink-2);
    font-size: var(--fs-13);
  }
  .error {
    margin: 0;
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-sm);
    background: var(--c-danger-tint);
    color: var(--c-danger-text);
  }
  .row {
    display: flex;
    justify-content: flex-end;
  }
  .back:focus-visible,
  select:focus-visible,
  .results button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  @media (max-width: 680px) {
    .two {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
