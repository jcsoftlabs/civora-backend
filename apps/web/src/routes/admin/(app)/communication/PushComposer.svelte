<!--
  Nouvelle notification push (COM-02) : titre et message en français et en créole (limites de l'écran
  verrouillé), destinataires, envoi immédiat ou programmé. À côté, l'aperçu sur un téléphone, dans la
  langue choisie : chaque membre la reçoit dans la sienne.
-->
<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button, Field, SidePanel } from "@civora/ui";
  import { translator } from "$lib/i18n";
  import AudienceBuilder from "./AudienceBuilder.svelte";

  interface Props {
    locale: "fr" | "ht";
    party: { name: string; logoUrl: string | null };
    statuses: Array<{ id: string; label: { fr: string; ht?: string } }>;
    organs: Array<{ id: string; name: string }>;
    form: { ok?: boolean; done?: string; code?: string } | null;
    onclose: () => void;
    /** Après l'enregistrement : la liste s'affiche avec la confirmation. */
    onsent: (scheduled: boolean) => void;
  }
  let { locale, party, statuses, organs, form, onclose, onsent }: Props = $props();
  const t = $derived(translator(locale));

  let open = $state(true);
  let pending = $state(false);
  let titleFr = $state("");
  let titleHt = $state("");
  let bodyFr = $state("");
  let bodyHt = $state("");
  let whenMode = $state<"now" | "later">("now");
  let lang = $state<"fr" | "ht">("fr");
  // Décalage horaire du navigateur (la date saisie est locale) : « -04:00 » en Haïti l'été.
  const tz = (() => {
    const m = -new Date().getTimezoneOffset();
    const s = m >= 0 ? "+" : "-";
    return `${s}${String(Math.floor(Math.abs(m) / 60)).padStart(2, "0")}:${String(Math.abs(m) % 60).padStart(2, "0")}`;
  })();
  const shownTitle = $derived((lang === "ht" && titleHt) || titleFr || t("admin.push.title"));
  const shownBody = $derived((lang === "ht" && bodyHt) || bodyFr || t("admin.push.body"));
  const error = $derived(form?.code ? t(`error.${form.code}` as Parameters<typeof t>[0]) : null);
</script>

<SidePanel bind:open title={t("admin.push.new")} closeLabel={t("admin.sheet.close")} {onclose}>
  <div class="layout">
    <form
      method="POST"
      action="?/push"
      use:enhance={() => {
        pending = true;
        return async ({ update, result }) => {
          await update({ reset: false });
          pending = false;
          if (result.type === "success") onsent(whenMode === "later");
        };
      }}
      class="stack"
    >
      {#if error}<p class="msg bad" role="alert">{error}</p>{/if}
      <Field label={t("admin.push.title")} name="titleFr" required maxlength={65} bind:value={titleFr} />
      <Field label={t("admin.push.titleHt")} name="titleHt" maxlength={65} bind:value={titleHt} />
      <label class="area">
        <span class="top"><span>{t("admin.push.body")}</span><span class="count">{bodyFr.length} / 240</span></span>
        <textarea name="bodyFr" required maxlength="240" rows="3" bind:value={bodyFr}></textarea>
      </label>
      <label class="area">
        <span class="top"><span>{t("admin.push.bodyHt")}</span><span class="count">{bodyHt.length} / 240</span></span>
        <textarea name="bodyHt" maxlength="240" rows="3" bind:value={bodyHt}></textarea>
      </label>

      <AudienceBuilder {locale} purpose="push" {statuses} {organs} />

      <fieldset class="when">
        <legend>{t("admin.push.when")}</legend>
        <div class="seg">
          {#each ["now", "later"] as const as w (w)}
            <label class:on={whenMode === w}>
              <input type="radio" name="when" value={w} bind:group={whenMode} />
              <span>{t(w === "now" ? "admin.push.now" : "admin.push.later")}</span>
            </label>
          {/each}
        </div>
        {#if whenMode === "later"}
          <input type="hidden" name="tz" value={tz} />
          <label class="area">
            <span>{t("admin.push.at")}</span>
            <input type="datetime-local" name="at" required />
          </label>
        {/if}
      </fieldset>

      <Button type="submit" {pending}>{t(whenMode === "now" ? "admin.push.send" : "admin.push.scheduleBtn")}</Button>
    </form>

    <aside class="preview" aria-label={t("admin.push.preview")}>
      <div class="seg small" role="radiogroup" aria-label={t("admin.push.previewLang")}>
        {#each ["fr", "ht"] as const as l (l)}
          <label class:on={lang === l}>
            <input type="radio" name="_lang" value={l} bind:group={lang} />
            <span>{t(`lang.${l}`)}</span>
          </label>
        {/each}
      </div>
      <!-- Écran verrouillé stylisé : pas de fausse barre d'état, seulement l'heure et la notification. -->
      <div class="phone">
        <p class="clock">9:41</p>
        <div class="notif">
          <span class="app" aria-hidden="true">
            {#if party.logoUrl}<img src={party.logoUrl} alt="" />{:else}{party.name[0]}{/if}
          </span>
          <span class="text">
            <span class="line"><strong>{party.name}</strong><span class="ago">{t("admin.push.now.label")}</span></span>
            <span class="ntitle">{shownTitle}</span>
            <span class="nbody">{shownBody}</span>
          </span>
        </div>
      </div>
    </aside>
  </div>
</SidePanel>

<style>
  .layout {
    display: flex;
    flex-direction: column;
    gap: var(--s-6);
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }
  .area {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .top {
    display: flex;
    justify-content: space-between;
  }
  .count {
    font-weight: 400;
    color: var(--c-ink-2);
    font-variant-numeric: tabular-nums;
  }
  textarea,
  input[type="datetime-local"] {
    min-height: 44px;
    padding: var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 400 var(--fs-15) / 1.4 var(--font-ui);
    resize: vertical;
  }
  textarea:focus-visible,
  input[type="datetime-local"]:focus-visible,
  .seg label:has(input:focus-visible) {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .when {
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }
  legend {
    padding: 0;
    margin-bottom: var(--s-2);
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .seg {
    display: inline-flex;
    padding: 4px;
    gap: 2px;
    border-radius: var(--r-pill);
    background: var(--c-paper);
    align-self: flex-start;
  }
  .seg label {
    position: relative;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--s-4);
    border-radius: var(--r-pill);
    font: 600 var(--fs-14) / 1 var(--font-ui);
    color: var(--c-ink-2);
    cursor: pointer;
  }
  .seg.small label {
    min-height: 32px;
    padding: 0 var(--s-3);
    font-size: var(--fs-13);
  }
  .seg input {
    position: absolute;
    opacity: 0;
  }
  .seg label.on {
    background: var(--c-surface);
    color: var(--c-ink);
    box-shadow: 0 1px 2px color-mix(in srgb, var(--c-ink) 12%, transparent);
  }
  .msg {
    margin: 0;
    padding: var(--s-3) var(--s-4);
    border-radius: var(--r-md);
    font-size: var(--fs-14);
  }
  .msg.bad {
    background: var(--c-danger-tint);
    color: var(--c-danger-text);
  }
  /* L'aperçu reste en tête du panneau : visible pendant la saisie du titre et du message. */
  .preview {
    order: -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-3);
  }
  .phone {
    width: 280px;
    padding: var(--s-5) var(--s-3) var(--s-8);
    border-radius: 36px;
    border: 8px solid var(--c-ink);
    background: var(--c-primary-deep);
    color: var(--c-surface);
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }
  .clock {
    margin: 0;
    text-align: center;
    font: 700 var(--fs-40) / 1 var(--font-display);
    letter-spacing: -0.02em;
  }
  .notif {
    display: flex;
    gap: var(--s-2);
    padding: var(--s-3);
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--c-surface) 88%, transparent);
    color: var(--c-ink);
  }
  .app {
    flex: none;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 8px;
    background: var(--c-primary);
    color: var(--c-on-primary);
    font: 800 var(--fs-13) / 1 var(--font-display);
  }
  .app img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--fs-12);
    line-height: 1.35;
  }
  .line {
    display: flex;
    justify-content: space-between;
    gap: var(--s-2);
    color: var(--c-ink-2);
  }
  .line strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--c-ink);
  }
  .ntitle {
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .nbody {
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
</style>
