<!--
  Publication (COM-01) : type (annonce, actualité, éditorial, podcast, album), titre et texte en français et en
  créole, médias pour l'album et le podcast, destinataires. Trois issues : brouillon, publication immédiate,
  parution programmée ; une publication en ligne peut être retirée.
-->
<script lang="ts">
  import { formatDateTime } from "$lib/datetime";
  import { enhance } from "$app/forms";
  import { Button, Field, SidePanel } from "@civora/ui";
  import DateTimeField from "$lib/components/DateTimeField.svelte";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import AudienceBuilder from "./AudienceBuilder.svelte";
  import type { Publication } from "./+page.server";

  interface Props {
    publication: Publication | null;
    locale: "fr" | "ht";
    statuses: Array<{ id: string; label: { fr: string; ht?: string } }>;
    organs: Array<{ id: string; name: string }>;
    form: { ok?: boolean; done?: string; code?: string } | null;
    zoneNames: Record<string, string>;
    onclose: () => void;
  }
  let { publication: p, locale, statuses, organs, form, zoneNames, onclose }: Props = $props();
  const t = $derived(translator(locale));
  const tk = (k: string) => t(k as MessageKey);

  let open = $state(true);
  let pending = $state<string | null>(null);
  let kind = $derived(p?.kind ?? "announcement");
  let scheduling = $state(false);
  const KINDS = ["announcement", "news", "editorial", "podcast", "album"] as const;
  const online = $derived(!!p?.publishedAt && new Date(p.publishedAt) <= new Date());
  const message = $derived(
    form?.code
      ? { bad: true, text: tk(`error.${form.code}`) }
      : form?.ok && form.done
        ? { bad: false, text: tk(`admin.pub.${form.done}`) }
        : null,
  );
  // L'issue choisie part avec le bouton lui-même (name="intent"), lue ici pour l'état « en cours ».
  const submit = ({ submitter }: { submitter: HTMLElement | null }) => {
    pending = (submitter as HTMLButtonElement | null)?.value || "save";
    return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
      await update({ reset: false });
      pending = null;
      scheduling = false;
    };
  };
</script>

<SidePanel
  bind:open
  title={p ? `${t("admin.pub.edit")} : ${p.title.fr}` : t("admin.pub.new")}
  closeLabel={t("admin.sheet.close")}
  {onclose}
>
  <form method="POST" action="?/savePublication" enctype="multipart/form-data" use:enhance={submit} class="stack">
    {#if message}<p class="msg" class:bad={message.bad} role="status">{message.text}</p>{/if}
    {#if p}<input type="hidden" name="id" value={p.id} />{/if}

    <fieldset class="kinds">
      <legend>{t("admin.pub.kind")}</legend>
      {#each KINDS as k (k)}
        <label class:on={kind === k}>
          <input type="radio" name="kind" value={k} bind:group={kind} />
          <span>{tk(`admin.com.kind.${k}`)}</span>
        </label>
      {/each}
    </fieldset>

    <Field label={t("admin.pub.title")} name="titleFr" required maxlength={160} value={p?.title.fr ?? ""} />
    <Field label={t("admin.pub.titleHt")} name="titleHt" maxlength={160} value={p?.title.ht ?? ""} />
    <label class="area">
      <span>{t("admin.pub.body")}</span>
      <textarea name="bodyFr" rows="6" maxlength="20000">{p?.body?.fr ?? ""}</textarea>
    </label>
    <label class="area">
      <span>{t("admin.pub.bodyHt")}</span>
      <textarea name="bodyHt" rows="6" maxlength="20000">{p?.body?.ht ?? ""}</textarea>
    </label>

    {#if kind === "album" || kind === "podcast"}
      <label class="area">
        <span>{t("admin.pub.media")}</span>
        <input
          type="file"
          name="media"
          multiple={kind === "album"}
          accept={kind === "album" ? "image/jpeg,image/png,image/webp" : "audio/mpeg,audio/mp4,audio/aac,audio/x-m4a"}
        />
        <small>{t(kind === "album" ? "admin.pub.media.album" : "admin.pub.media.podcast")}</small>
        {#if p}<small>{t("admin.pub.media.replace")}</small>{/if}
      </label>
    {/if}

    <AudienceBuilder {locale} purpose="publication" {statuses} {organs} initial={p?.audience ?? null} {zoneNames} />

    {#if scheduling}
      <DateTimeField
        label={t("admin.pub.scheduleAt")}
        name="at"
        required
        labels={{ date: t("common.date"), hour: t("common.hour"), minute: t("common.minute") }}
      />
    {/if}

    <div class="actions">
      {#if scheduling}
        <Button type="submit" name="intent" value="schedule" pending={pending === "schedule"}>
          {t("admin.pub.schedule")}
        </Button>
        <Button variant="ghost" onclick={() => (scheduling = false)}>{t("common.cancel")}</Button>
      {:else}
        <!-- Premier bouton du formulaire = action d'Entrée : le brouillon, jamais la publication. -->
        <span class="last">
          <Button type="submit" name="intent" value="save" variant="ghost" pending={pending === "save"}>
            {t("admin.pub.save")}
          </Button>
        </span>
        <Button type="submit" name="intent" value="publish" pending={pending === "publish"}>
          {t("admin.pub.publish")}
        </Button>
        <Button variant="secondary" onclick={() => (scheduling = true)}>{t("admin.pub.schedule")}</Button>
      {/if}
    </div>
  </form>

  {#if p?.publishedAt}
    <form method="POST" action="?/unpublish" use:enhance={submit} class="unpublish">
      <input type="hidden" name="id" value={p.id} />
      <p class="muted">
        {online
          ? format(t("admin.com.status.published"), { date: formatDateTime(p.publishedAt) })
          : format(t("admin.com.status.scheduled"), { date: formatDateTime(p.publishedAt) })}
      </p>
      <Button type="submit" variant="ghost" size="sm">{t("admin.pub.unpublish")}</Button>
    </form>
  {/if}
</SidePanel>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }
  .kinds {
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  legend {
    width: 100%;
    padding: 0;
    margin-bottom: var(--s-2);
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .kinds label {
    position: relative;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--s-4);
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
    font-size: var(--fs-14);
    cursor: pointer;
  }
  .kinds input {
    position: absolute;
    opacity: 0;
  }
  .kinds label.on {
    border-color: var(--c-ink);
    background: var(--c-ink);
    color: var(--c-surface);
  }
  .kinds label:has(input:focus-visible),
  textarea:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .area {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .area small {
    font-weight: 400;
    color: var(--c-ink-2);
  }
  textarea {
    min-height: 44px;
    padding: var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 400 var(--fs-15) / 1.5 var(--font-ui);
    resize: vertical;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  .last {
    order: 3;
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
  .unpublish {
    margin-top: var(--s-6);
    padding-top: var(--s-4);
    border-top: 1px solid var(--c-line);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
  }
  .muted {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
</style>
