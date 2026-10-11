<!--
  Envoi de médias, clair à chaque étape : aperçu de chaque fichier (image, lecteur vidéo ou audio, document),
  progression, annulation de l'envoi, reprise après échec, retrait. En mode album, les nouveaux fichiers
  s'ajoutent aux médias déjà joints (on enrichit, on ne remplace pas) et l'ordre se règle. En mode fichier
  unique, « Remplacer » garde l'ancien fichier tant que le nouveau n'est pas arrivé.
  Les identifiants des fichiers prêts partent dans des champs cachés `name`, dans l'ordre affiché.
-->
<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { UploadError, uploadDirect, type UploadPurpose } from "$lib/upload-client";
  import { format, translator, type MessageKey } from "$lib/i18n";

  export interface MediaItem {
    id: string;
    url: string;
    mimeType: string;
    name: string;
  }
  interface Props {
    purpose: UploadPurpose;
    name: string;
    label: string;
    hint?: string;
    accept: string[];
    maxBytes: (mimeType: string) => number;
    locale: "fr" | "ht";
    items?: MediaItem[];
    multiple?: boolean;
    max?: number;
    /** Appelé quand un envoi commence ou se termine : le formulaire attend la fin pour s'enregistrer. */
    onbusy?: (busy: boolean) => void;
    onchange?: (ids: string[]) => void;
  }
  let {
    purpose,
    name,
    label,
    hint,
    accept,
    maxBytes,
    locale,
    items = [],
    multiple = false,
    max = 50,
    onbusy,
    onchange,
  }: Props = $props();
  const t = $derived(translator(locale));
  const tk = (k: string) => t(k as MessageKey);

  interface Entry {
    key: string;
    id: string | null;
    name: string;
    mimeType: string;
    size: number | null;
    url: string;
    local: boolean;
    status: "ready" | "uploading" | "error";
    progress: number;
    error: string | null;
    file: File | null;
    controller: AbortController | null;
    /** Fichier unique : l'entrée qu'il remplacera une fois arrivé. */
    replaces: string | null;
  }
  const remote = (m: MediaItem): Entry => ({
    key: m.id,
    id: m.id,
    name: m.name,
    mimeType: m.mimeType,
    size: null,
    url: m.url,
    local: false,
    status: "ready",
    progress: 1,
    error: null,
    file: null,
    controller: null,
    replaces: null,
  });
  // Copie de travail prise à l'ouverture : le composant est recréé pour chaque fiche.
  let entries = $state<Entry[]>(untrack(() => items.map(remote)));
  let input = $state<HTMLInputElement | null>(null);
  let dragging = $state(false);
  let notice = $state<string | null>(null);

  const ready = $derived(entries.filter((e) => e.status === "ready" && e.id));
  const busy = $derived(entries.some((e) => e.status === "uploading"));
  $effect(() => onbusy?.(busy));
  const emit = () => onchange?.(entries.flatMap((e) => (e.status === "ready" && e.id ? [e.id] : [])));

  const kindOf = (mime: string) =>
    mime.startsWith("image/")
      ? "image"
      : mime.startsWith("video/")
        ? "video"
        : mime.startsWith("audio/")
          ? "audio"
          : "doc";
  const size = (n: number) =>
    n >= 1024 * 1024
      ? `${(n / 1024 / 1024).toLocaleString(locale === "ht" ? "fr-HT" : "fr-FR", { maximumFractionDigits: 1 })} Mo`
      : `${Math.max(1, Math.round(n / 1024))} Ko`;

  function start(entry: Entry) {
    const file = entry.file!;
    const controller = new AbortController();
    Object.assign(entry, { status: "uploading", progress: 0, error: null, controller });
    uploadDirect(file, purpose, { signal: controller.signal, onProgress: (p) => (entry.progress = p) })
      .then((id) => {
        Object.assign(entry, { id, status: "ready", progress: 1, controller: null });
        if (entry.replaces) {
          drop(entry.replaces);
          entry.replaces = null;
        }
        emit();
      })
      .catch((err: unknown) => {
        const code = err instanceof UploadError ? err.code : "upload_failed";
        if (code === "upload_cancelled") return; // déjà retiré par « Annuler l'envoi »
        Object.assign(entry, { status: "error", controller: null, error: tk(`error.${code}`) });
      });
  }

  function add(files: File[]) {
    notice = null;
    const room = multiple ? max - entries.length : 1;
    if (multiple && files.length > room) notice = format(t("media.limit"), { n: String(max) });
    const current = !multiple ? (entries.find((e) => e.status === "ready") ?? null) : null;
    if (!multiple) for (const e of entries.filter((x) => x.status !== "ready")) cancel(e.key);
    for (const file of files.slice(0, Math.max(0, room))) {
      if (!accept.includes(file.type)) {
        notice = format(t("media.badType"), { name: file.name });
        continue;
      }
      if (file.size > maxBytes(file.type)) {
        notice = format(t("media.tooLarge"), {
          name: file.name,
          size: size(file.size),
          max: size(maxBytes(file.type)),
        });
        continue;
      }
      const entry: Entry = {
        key: crypto.randomUUID(),
        id: null,
        name: file.name,
        mimeType: file.type,
        size: file.size,
        url: URL.createObjectURL(file),
        local: true,
        status: "uploading",
        progress: 0,
        error: null,
        file,
        controller: null,
        replaces: current?.key ?? null,
      };
      entries.push(entry);
      start(entries.at(-1)!);
    }
    if (input) input.value = "";
  }

  function drop(key: string) {
    const e = entries.find((x) => x.key === key);
    if (!e) return;
    if (e.local) URL.revokeObjectURL(e.url);
    entries = entries.filter((x) => x.key !== key);
  }
  function cancel(key: string) {
    entries.find((x) => x.key === key)?.controller?.abort();
    drop(key);
  }
  function remove(key: string) {
    drop(key);
    emit();
  }
  function move(i: number, dir: -1 | 1) {
    const next = [...entries];
    [next[i], next[i + dir]] = [next[i + dir]!, next[i]!];
    entries = next;
    emit();
  }
  onDestroy(() => {
    for (const e of entries) {
      e.controller?.abort();
      if (e.local) URL.revokeObjectURL(e.url);
    }
  });

  const replacing = (e: Entry) => entries.some((x) => x.replaces === e.key);
  const showPicker = $derived(multiple ? entries.length < max : !entries.some((e) => e.status === "ready"));
</script>

<div class="uploader" role="group" aria-label={label}>
  <div class="head">
    <span class="label">{label}</span>
    {#if multiple && entries.length}<span class="count">{entries.length} / {max}</span>{/if}
  </div>
  {#each ready as r (r.key)}<input type="hidden" {name} value={r.id} />{/each}

  {#if entries.length}
    <ul class="tiles" class:single={!multiple}>
      {#each entries as e, i (e.key)}
        {@const k = kindOf(e.mimeType)}
        <li class="tile {k}" class:failed={e.status === "error"} class:fading={replacing(e)}>
          <div class="preview">
            {#if k === "image"}
              <img src={e.url} alt={e.name} />
            {:else if k === "video"}
              <!-- svelte-ignore a11y_media_has_caption -->
              <video src={e.url} controls preload="metadata"></video>
            {:else if k === "audio"}
              <svg class="wave" viewBox="0 0 84 32" aria-hidden="true">
                {#each [10, 18, 26, 14, 22, 30, 16, 24, 12, 20, 28, 14, 18, 8] as h, b (b)}
                  <rect x={b * 6} y={(32 - h) / 2} width="3" height={h} rx="1.5" />
                {/each}
              </svg>
              <audio src={e.url} controls preload="metadata"></audio>
            {:else}
              <span class="doc" aria-hidden="true">{e.mimeType === "application/pdf" ? "PDF" : "DOC"}</span>
            {/if}
            {#if e.status === "uploading"}
              <span class="veil" aria-hidden="true"></span>
            {/if}
          </div>
          <div class="meta">
            <span class="name" title={e.name}>{e.name}</span>
            {#if e.status === "uploading"}
              <span
                class="bar"
                role="progressbar"
                aria-label={format(t("media.sending"), { name: e.name })}
                aria-valuenow={Math.round(e.progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}><span style:width="{Math.round(e.progress * 100)}%"></span></span
              >
              <span class="sub"
                >{Math.round(e.progress * 100)} %{#if e.size}
                  · {size(e.size * e.progress)} / {size(e.size)}{/if}</span
              >
            {:else if e.status === "error"}
              <span class="err" role="alert">{e.error}</span>
            {:else if replacing(e)}
              <span class="sub">{t("media.replacing")}</span>
            {:else}
              <span class="sub ok">{e.local ? t("media.sent") : t("media.attached")}</span>
            {/if}
          </div>
          <div class="tools">
            {#if e.status === "uploading"}
              <button type="button" class="act" onclick={() => cancel(e.key)}>{t("media.cancel")}</button>
            {:else if e.status === "error"}
              <button type="button" class="act" onclick={() => start(e)}>{t("media.retry")}</button>
              <button type="button" class="act" onclick={() => remove(e.key)}>{t("media.remove")}</button>
            {:else}
              {#if multiple}
                <button
                  type="button"
                  class="icon"
                  disabled={i === 0}
                  aria-label={format(t("media.before"), { name: e.name })}
                  onclick={() => move(i, -1)}>←</button
                >
                <button
                  type="button"
                  class="icon"
                  disabled={i === entries.length - 1}
                  aria-label={format(t("media.after"), { name: e.name })}
                  onclick={() => move(i, 1)}>→</button
                >
              {:else if !replacing(e)}
                <button type="button" class="act" onclick={() => input?.click()}>{t("media.replace")}</button>
              {/if}
              {#if !e.local}
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
                <a class="act" href={e.url} target="_blank" rel="noopener">{t("media.open")}</a>
              {/if}
              {#if !replacing(e)}
                <button
                  type="button"
                  class="icon"
                  aria-label={format(t("media.removeNamed"), { name: e.name })}
                  onclick={() => remove(e.key)}>×</button
                >
              {/if}
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <input
    bind:this={input}
    class="file"
    type="file"
    tabindex="-1"
    aria-hidden="true"
    accept={accept.join(",")}
    {multiple}
    onchange={(ev) => add([...(ev.currentTarget.files ?? [])])}
  />
  {#if showPicker}
    <div
      class="drop"
      class:over={dragging}
      role="presentation"
      ondragover={(ev) => {
        ev.preventDefault();
        dragging = true;
      }}
      ondragleave={() => (dragging = false)}
      ondrop={(ev) => {
        ev.preventDefault();
        dragging = false;
        add([...(ev.dataTransfer?.files ?? [])]);
      }}
    >
      <button type="button" class="pick" onclick={() => input?.click()}>
        {t(multiple ? (entries.length ? "media.addMore" : "media.add") : "media.choose")}
      </button>
      <span class="sub">{t("media.drop")}</span>
    </div>
  {/if}
  {#if notice}<p class="err" role="alert">{notice}</p>{/if}
  {#if hint}<p class="sub">{hint}</p>{/if}
</div>

<style>
  .uploader {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .label {
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .count,
  .sub {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    font-variant-numeric: tabular-nums;
  }
  p.sub,
  p.err {
    margin: 0;
  }
  .ok {
    color: var(--c-success-text);
    font-weight: 600;
  }
  .err {
    font-size: var(--fs-13);
    color: var(--c-danger-text);
  }
  .tiles {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
    gap: var(--s-3);
  }
  .tiles.single {
    grid-template-columns: minmax(0, 1fr);
  }
  .tile {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    overflow: hidden;
  }
  .single .tile {
    flex-direction: row;
    align-items: stretch;
  }
  .tile.failed {
    border-color: var(--c-danger);
  }
  .tile.fading {
    opacity: 0.55;
  }
  .preview {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 4 / 3;
    background: var(--c-paper);
  }
  .single .preview {
    flex: none;
    width: 200px;
  }
  .single .audio .preview,
  .single .doc .preview {
    width: 200px;
  }
  .preview img,
  .preview video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    background: var(--c-ink);
  }
  .preview video {
    object-fit: contain;
  }
  .audio .preview {
    gap: var(--s-2);
    padding: var(--s-3);
  }
  .preview audio {
    width: 100%;
    height: 36px;
  }
  /* Onde d'un enregistrement, dessinée en barres. */
  .wave {
    width: 70%;
    height: 32px;
    fill: var(--c-primary);
  }
  .doc {
    width: 56px;
    height: 70px;
    display: grid;
    place-items: end center;
    padding-bottom: var(--s-2);
    border: 1px solid var(--c-line);
    border-radius: 4px 14px 4px 4px;
    background: var(--c-surface);
    color: var(--c-danger-text);
    font: 600 var(--fs-13) / 1.12 var(--font-display);
    box-shadow: var(--shadow-object);
  }
  .veil {
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, var(--c-surface) 45%, transparent);
  }
  .meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--s-2) var(--s-3) 0;
  }
  .single .meta {
    justify-content: center;
    padding: var(--s-3);
  }
  .name {
    font-size: var(--fs-13);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bar {
    height: 6px;
    border-radius: var(--r-pill);
    background: var(--c-line-soft);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--c-primary);
    transition: width 0.2s linear;
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    padding: var(--s-2);
  }
  .single .tools {
    align-self: center;
    padding-right: var(--s-3);
  }
  .act {
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 600 var(--fs-13) / 1 var(--font-ui);
    text-decoration: none;
    cursor: pointer;
  }
  .icon {
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: var(--r-pill);
    background: transparent;
    color: var(--c-ink-2);
    font-size: var(--fs-16);
    cursor: pointer;
  }
  .icon:hover {
    background: var(--c-paper);
  }
  .icon:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .file {
    display: none;
  }
  .drop {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-4);
    border: 1px dashed var(--c-ink-3);
    border-radius: var(--r-md);
    background: var(--c-paper);
  }
  .drop.over {
    border-color: var(--c-primary);
    background: var(--c-primary-tint);
  }
  .pick {
    min-height: 44px;
    padding: 0 var(--s-4);
    border: 1px solid var(--c-ink);
    border-radius: var(--r-pill);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 600 var(--fs-14) / 1 var(--font-ui);
    cursor: pointer;
  }
  .act:focus-visible,
  .icon:focus-visible,
  .pick:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  @media (max-width: 560px) {
    .single .tile {
      flex-direction: column;
    }
    .single .preview {
      width: 100%;
    }
  }
</style>
