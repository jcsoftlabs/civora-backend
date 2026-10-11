<!--
  Édition d'un chapitre (FOR-01) : texte, fichier envoyé (vidéo, audio, document) avec aperçu et annulation, ou
  lien YouTube ou Vimeo reconnu et montré dans son lecteur avant l'enregistrement. Titre et texte en français et
  en créole ; le texte accompagne aussi une vidéo ou un document.
-->
<script lang="ts">
  import { enhance } from "$app/forms";
  import { videoEmbed } from "@civora/shared";
  import { Button, Field } from "@civora/ui";
  import MediaUploader from "$lib/components/MediaUploader.svelte";
  import { translator, type MessageKey } from "$lib/i18n";
  import type { Chapter, ChapterKind } from "./+page.server";

  interface Props {
    chapter: Chapter | null;
    moduleId: string;
    locale: "fr" | "ht";
    oncancel: () => void;
    ondone: () => void;
  }
  let { chapter: c, moduleId, locale, oncancel, ondone }: Props = $props();
  const t = $derived(translator(locale));
  const tk = (k: string) => t(k as MessageKey);

  type Choice = "text" | "video" | "audio" | "document" | "link";
  const CHOICES: Choice[] = ["text", "video", "link", "audio", "document"];
  const MB = 1024 * 1024;
  const ACCEPT: Record<"video" | "audio" | "document", string[]> = {
    video: ["video/mp4", "video/webm"],
    audio: ["audio/mpeg", "audio/mp4", "audio/aac", "audio/x-m4a"],
    document: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
  };
  const LIMIT = { video: 300 * MB, audio: 100 * MB, document: 25 * MB } as const;

  let choice = $derived<Choice>(c ? (c.kind === "youtube" || c.kind === "vimeo" ? "link" : c.kind) : "text");
  let url = $derived(c?.embedUrl ?? "");
  const embed = $derived(url.trim() ? videoEmbed(url) : null);
  const kind = $derived<ChapterKind>(choice === "link" ? (embed?.provider ?? "youtube") : choice);
  let uploading = $state(false);
  let pending = $state(false);
  let error = $state<string | null>(null);
  const existing = $derived(
    c?.media && c.mediaFileId && choice === c.kind
      ? [{ id: c.mediaFileId, url: c.media.url, mimeType: c.media.mimeType, name: c.media.name }]
      : [],
  );
</script>

<form
  method="POST"
  action={c ? "?/updateChapter" : "?/addChapter"}
  class="editor"
  use:enhance={({ cancel }) => {
    if (choice === "link" && !embed) {
      error = t("error.invalid_video_url");
      cancel();
      return;
    }
    pending = true;
    return async ({ update, result }) => {
      await update({ reset: false });
      pending = false;
      if (result.type === "success") ondone();
      else if (result.type === "failure") error = tk(`error.${(result.data as { code?: string })?.code ?? "generic"}`);
    };
  }}
>
  {#if c}<input type="hidden" name="id" value={c.id} />{/if}
  <input type="hidden" name="moduleId" value={moduleId} />
  <input type="hidden" name="kind" value={kind} />

  <fieldset class="kinds">
    <legend>{t("admin.chapter.kind")}</legend>
    {#each CHOICES as k (k)}
      <label class:on={choice === k}>
        <input type="radio" name="choice" value={k} bind:group={choice} />
        <span>{tk(`admin.chapter.kind.${k}`)}</span>
      </label>
    {/each}
  </fieldset>

  <div class="two">
    <Field label={t("admin.chapter.title")} name="titleFr" required maxlength={160} value={c?.title.fr ?? ""} />
    <Field label={t("admin.chapter.titleHt")} name="titleHt" maxlength={160} value={c?.title.ht ?? ""} />
  </div>

  {#if choice === "link"}
    <div class="link">
      <Field
        label={t("admin.chapter.link")}
        hint={t("admin.chapter.link.hint")}
        name="videoUrl"
        type="url"
        inputmode="url"
        placeholder="https://www.youtube.com/watch?v=..."
        maxlength={500}
        bind:value={url}
      />
      {#if embed}
        <figure class="player">
          <iframe
            src={embed.embedUrl}
            title={t("admin.chapter.link.preview")}
            loading="lazy"
            referrerpolicy="strict-origin-when-cross-origin"
            allow="encrypted-media; picture-in-picture; fullscreen"
          ></iframe>
          <figcaption>{tk(`admin.chapter.link.found.${embed.provider}`)}</figcaption>
        </figure>
      {:else if url.trim()}
        <p class="warn" role="status">{t("error.invalid_video_url")}</p>
      {/if}
    </div>
  {:else if choice !== "text"}
    {#key choice}
      <MediaUploader
        purpose="training_media"
        name="mediaFileId"
        label={t("admin.chapter.media")}
        hint={tk(`admin.lesson.media.hint.${choice}`)}
        accept={ACCEPT[choice]}
        maxBytes={() => LIMIT[choice as "video" | "audio" | "document"]}
        items={existing}
        {locale}
        onbusy={(b) => (uploading = b)}
      />
    {/key}
  {/if}

  <div class="two">
    <label class="area">
      <span>{t(choice === "text" ? "admin.chapter.body" : "admin.chapter.notes")}</span>
      <textarea name="bodyFr" rows={choice === "text" ? 8 : 3} maxlength="20000" required={choice === "text"}
        >{c?.body?.fr ?? ""}</textarea
      >
    </label>
    <label class="area">
      <span>{t("admin.chapter.bodyHt")}</span>
      <textarea name="bodyHt" rows={choice === "text" ? 8 : 3} maxlength="20000">{c?.body?.ht ?? ""}</textarea>
    </label>
  </div>

  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="row end">
    <Button variant="ghost" onclick={oncancel}>{t("common.cancel")}</Button>
    <Button type="submit" {pending} disabled={uploading}>{t(c ? "admin.chapter.save" : "admin.chapter.create")}</Button>
  </div>
</form>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    padding: var(--s-4);
    border: 1px solid var(--c-primary);
    border-radius: var(--r-md);
    background: var(--c-surface);
  }
  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-3);
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
    background: var(--c-ink);
    border-color: var(--c-ink);
    color: var(--c-surface);
  }
  .area {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    font-size: var(--fs-14);
    font-weight: 600;
  }
  textarea {
    min-height: 44px;
    padding: var(--s-2) var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 400 var(--fs-15) / 1.45 var(--font-ui);
    resize: vertical;
  }
  .link {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }
  .player {
    margin: 0;
    max-width: 560px;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .player iframe {
    width: 100%;
    aspect-ratio: 16 / 9;
    border: 0;
    border-radius: var(--r-md);
    background: var(--c-ink);
  }
  figcaption {
    font-size: var(--fs-13);
    font-weight: 600;
    color: var(--c-success-text);
  }
  .warn {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--c-danger-text);
  }
  .error {
    margin: 0;
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-sm);
    background: var(--c-danger-tint);
    color: var(--c-danger-text);
    font-size: var(--fs-14);
  }
  .row {
    display: flex;
    gap: var(--s-2);
  }
  .row.end {
    justify-content: flex-end;
  }
  .kinds label:has(input:focus-visible),
  textarea:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  @media (max-width: 760px) {
    .two {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
