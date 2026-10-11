<!--
  Modèle de certificat du parti (FOR-04) : titre, mention et pied de page en français et en créole, couleur,
  logo, jusqu'à trois signataires dont la signature est tracée à l'écran ou importée. L'aperçu, à droite, suit
  chaque frappe et reprend la mise en page du PDF ; un exemplaire PDF se télécharge au modèle enregistré.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";
  import { Button, Field, Locked, Switch, contrastRatio } from "@civora/ui";
  import { partyFormat } from "$lib/datetime";
  import { UploadError, uploadDirect } from "$lib/upload-client";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { ActionData, PageData } from "./$types";
  import SignaturePad from "./SignaturePad.svelte";

  let { data, form }: { data: PageData & { locale: "fr" | "ht" }; form: ActionData } = $props();
  const t = $derived(translator(data.locale));
  const tk = (k: string) => t(k as MessageKey);

  interface Signer {
    key: string;
    name: string;
    roleFr: string;
    roleHt: string;
    signatureFileId: string | null;
    signatureUrl: string | null;
    drawing: boolean;
    progress: number | null;
    error: string | null;
    controller: AbortController | null;
  }
  const tpl = untrack(() => data.template);
  let titleFr = $state(tpl?.title?.fr ?? "");
  let titleHt = $state(tpl?.title?.ht ?? "");
  let mentionFr = $state(tpl?.mention?.fr ?? "");
  let mentionHt = $state(tpl?.mention?.ht ?? "");
  let footerFr = $state(tpl?.footer?.fr ?? "");
  let footerHt = $state(tpl?.footer?.ht ?? "");
  let partyColor = $state(!tpl?.accentColor);
  let accent = $state(tpl?.accentColor ?? untrack(() => data.party.brandColor));
  let showLogo = $state(tpl?.showLogo ?? true);
  let signers = $state<Signer[]>(
    (tpl?.signatories ?? []).map((s) => ({
      key: crypto.randomUUID(),
      name: s.name,
      roleFr: s.role.fr,
      roleHt: s.role.ht ?? "",
      signatureFileId: s.signatureFileId,
      signatureUrl: s.signatureUrl,
      drawing: false,
      progress: null,
      error: null,
      controller: null,
    })),
  );
  let lang = $state<"fr" | "ht">(untrack(() => data.locale));
  let pending = $state(false);
  let error = $state<string | null>(null);

  const color = $derived(partyColor ? data.party.brandColor : accent);
  // Le titre s'écrit à la couleur choisie sur du blanc : 3:1 au moins pour un grand texte.
  const lowContrast = $derived(contrastRatio(color, "#FFFFFF") < 3);
  const uploading = $derived(signers.some((s) => s.progress !== null));
  const payload = $derived(
    JSON.stringify(
      signers.map((s) => ({
        name: s.name.trim(),
        role: { fr: s.roleFr.trim(), ...(s.roleHt.trim() ? { ht: s.roleHt.trim() } : {}) },
        signatureFileId: s.signatureFileId,
      })),
    ),
  );
  const pick = (fr: string, ht: string, fallback: string) => (lang === "ht" && ht.trim() ? ht : fr.trim() || fallback);
  const L = (k: string) => translator(lang)(k as MessageKey);
  const today = partyFormat({ day: "numeric", month: "long", year: "numeric" }).format(new Date());

  function addSigner() {
    signers.push({
      key: crypto.randomUUID(),
      name: "",
      roleFr: "",
      roleHt: "",
      signatureFileId: null,
      signatureUrl: null,
      drawing: false,
      progress: null,
      error: null,
      controller: null,
    });
  }
  function setSignature(s: Signer, url: string | null, id: string | null) {
    if (s.signatureUrl?.startsWith("blob:")) URL.revokeObjectURL(s.signatureUrl);
    s.signatureUrl = url;
    s.signatureFileId = id;
  }
  async function send(s: Signer, file: File) {
    s.drawing = false;
    s.error = null;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      s.error = t("admin.cert.sig.type");
      return;
    }
    if (file.size > 1024 * 1024) {
      s.error = t("admin.cert.sig.size");
      return;
    }
    const controller = new AbortController();
    s.controller = controller;
    s.progress = 0;
    try {
      const id = await uploadDirect(file, "signature", {
        signal: controller.signal,
        onProgress: (p) => (s.progress = p),
      });
      setSignature(s, URL.createObjectURL(file), id);
    } catch (err) {
      const code = err instanceof UploadError ? err.code : "upload_failed";
      if (code !== "upload_cancelled") s.error = tk(`error.${code}`);
    } finally {
      s.progress = null;
      s.controller = null;
    }
  }
  const message = $derived(
    (form as { code?: string } | null)?.code
      ? tk(`error.${(form as { code: string }).code}`)
      : (form as { ok?: boolean } | null)?.ok
        ? t("admin.cert.saved")
        : null,
  );
</script>

<main>
  <header class="head">
    <div>
      <a class="back" href={resolve("/admin/formation")}>← {t("admin.course.back")}</a>
      <h1>{t("admin.cert.title")}</h1>
      <p class="muted">{t("admin.cert.lead")}</p>
    </div>
    {#if !data.locked}
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
      <a class="sample" href={resolve("/admin/formation/certificat/exemple")} target="_blank" rel="noopener"
        >{t("admin.cert.sample")}</a
      >
    {/if}
  </header>

  {#if data.locked}
    <Locked title={t("admin.cert.title")} message={t("admin.course.certificate.locked")} />
  {:else}
    <div class="layout">
      <form
        method="POST"
        action="?/save"
        class="editor"
        use:enhance={({ cancel }) => {
          error = null;
          if (signers.some((s) => !s.name.trim() || !s.roleFr.trim())) {
            error = t("admin.cert.sig.incomplete");
            cancel();
            return;
          }
          pending = true;
          return async ({ update }) => {
            await update({ reset: false });
            pending = false;
          };
        }}
      >
        <input type="hidden" name="signatories" value={payload} />
        <section>
          <h2>{t("admin.cert.texts")}</h2>
          <div class="two">
            <Field
              label={t("admin.cert.field.title")}
              name="titleFr"
              maxlength={80}
              placeholder={translator("fr")("admin.course.certificate.title")}
              bind:value={titleFr}
            />
            <Field
              label={t("admin.cert.field.titleHt")}
              name="titleHt"
              maxlength={80}
              placeholder={translator("ht")("admin.course.certificate.title")}
              bind:value={titleHt}
            />
            <Field
              label={t("admin.cert.field.mention")}
              name="mentionFr"
              maxlength={160}
              placeholder={translator("fr")("admin.cert.default.mention")}
              bind:value={mentionFr}
            />
            <Field
              label={t("admin.cert.field.mentionHt")}
              name="mentionHt"
              maxlength={160}
              placeholder={translator("ht")("admin.cert.default.mention")}
              bind:value={mentionHt}
            />
            <Field label={t("admin.cert.field.footer")} name="footerFr" maxlength={300} bind:value={footerFr} />
            <Field label={t("admin.cert.field.footerHt")} name="footerHt" maxlength={300} bind:value={footerHt} />
          </div>
          <p class="muted">{t("admin.cert.texts.hint")}</p>
        </section>

        <section>
          <h2>{t("admin.cert.look")}</h2>
          <Switch
            label={t("admin.cert.logo")}
            bind:checked={showLogo}
            description={t(data.party.logoUrl ? "admin.cert.logo.hint" : "admin.cert.logo.none")}
            onLabel={t("common.yes")}
            offLabel={t("common.no")}
          />
          <input type="hidden" name="showLogo" value={showLogo ? "on" : ""} />
          <Switch
            label={t("admin.cert.partyColor")}
            bind:checked={partyColor}
            description={t("admin.cert.partyColor.hint")}
            onLabel={t("common.yes")}
            offLabel={t("common.no")}
          />
          <input type="hidden" name="partyColor" value={partyColor ? "on" : ""} />
          {#if !partyColor}
            <label class="color">
              <input type="color" name="accentColor" bind:value={accent} />
              <span>{t("admin.cert.color")} <code>{accent.toUpperCase()}</code></span>
            </label>
          {/if}
          {#if lowContrast}<p class="warn" role="status">{t("admin.cert.color.low")}</p>{/if}
        </section>

        <section>
          <h2>{t("admin.cert.signers")}</h2>
          <p class="muted">{t("admin.cert.signers.lead")}</p>
          <ol class="signers">
            {#each signers as s, i (s.key)}
              <li class="signer">
                <div class="s-head">
                  <span class="s-num">{i + 1}</span>
                  <button
                    type="button"
                    class="icon"
                    aria-label={format(t("admin.cert.sig.removeSigner"), { n: String(i + 1) })}
                    onclick={() => {
                      s.controller?.abort();
                      setSignature(s, null, null);
                      signers = signers.filter((x) => x.key !== s.key);
                    }}>×</button
                  >
                </div>
                <div class="three">
                  <Field label={t("admin.cert.sig.name")} maxlength={80} required bind:value={s.name} />
                  <Field label={t("admin.cert.sig.role")} maxlength={80} required bind:value={s.roleFr} />
                  <Field label={t("admin.cert.sig.roleHt")} maxlength={80} bind:value={s.roleHt} />
                </div>
                {#if s.drawing}
                  <SignaturePad
                    locale={data.locale}
                    oncancel={() => (s.drawing = false)}
                    onuse={(file) => send(s, file)}
                  />
                {:else if s.progress !== null}
                  <div class="sending">
                    <span
                      class="bar"
                      role="progressbar"
                      aria-label={t("admin.cert.sig.sending")}
                      aria-valuenow={Math.round(s.progress * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}><span style:width="{Math.round(s.progress * 100)}%"></span></span
                    >
                    <Button size="sm" variant="ghost" onclick={() => s.controller?.abort()}>{t("media.cancel")}</Button>
                  </div>
                {:else}
                  <div class="sig">
                    {#if s.signatureUrl}
                      <img src={s.signatureUrl} alt={format(t("admin.cert.sig.alt"), { name: s.name })} />
                    {:else}
                      <span class="sig-empty">{t("admin.cert.sig.none")}</span>
                    {/if}
                    <span class="sig-tools">
                      <Button size="sm" variant="secondary" onclick={() => (s.drawing = true)}>
                        {t(s.signatureUrl ? "admin.cert.sig.redraw" : "admin.cert.sig.draw")}
                      </Button>
                      <label class="import">
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          onchange={(e) => {
                            const file = e.currentTarget.files?.[0];
                            e.currentTarget.value = "";
                            if (file) send(s, file);
                          }}
                        />
                        <span>{t("admin.cert.sig.import")}</span>
                      </label>
                      {#if s.signatureUrl}
                        <Button size="sm" variant="ghost" onclick={() => setSignature(s, null, null)}
                          >{t("media.remove")}</Button
                        >
                      {/if}
                    </span>
                  </div>
                {/if}
                {#if s.error}<p class="err" role="alert">{s.error}</p>{/if}
              </li>
            {/each}
          </ol>
          {#if signers.length < 3}
            <button type="button" class="add" onclick={addSigner}>+ {t("admin.cert.signers.add")}</button>
          {/if}
        </section>

        {#if error || message}
          <p class="msg" class:bad={!!error || !!(form as { code?: string } | null)?.code} role="status">
            {error ?? message}
          </p>
        {/if}
        <div class="row">
          <Button type="submit" {pending} disabled={uploading || signers.some((s) => s.drawing)}
            >{t("admin.cert.save")}</Button
          >
        </div>
      </form>

      <aside class="preview-col" aria-label={t("admin.cert.preview")}>
        <div class="lang" role="group" aria-label={t("admin.cert.preview.lang")}>
          <button type="button" aria-pressed={lang === "fr"} onclick={() => (lang = "fr")}>Français</button>
          <button type="button" aria-pressed={lang === "ht"} onclick={() => (lang = "ht")}>Kreyòl</button>
        </div>
        <!-- Certificat A4 paysage : double filet à la couleur choisie, comme le PDF délivré. -->
        <figure class="sheet" style:--accent={color}>
          <div class="inner">
            {#if showLogo && data.party.logoUrl}
              <img class="logo" src={data.party.logoUrl} alt="" />
            {:else}
              <span class="logo-space" aria-hidden="true"></span>
            {/if}
            <p class="party">{data.party.name}</p>
            <p class="c-title">{pick(titleFr, titleHt, L("admin.course.certificate.title"))}</p>
            <p class="c-mention">{pick(mentionFr, mentionHt, L("admin.cert.default.mention"))}</p>
            <p class="c-name">{L("admin.cert.preview.name")}</p>
            <p class="c-member">{L("admin.cert.preview.member")}</p>
            <p class="c-course-lead">{L("admin.cert.preview.course")}</p>
            <p class="c-course">{L("admin.cert.preview.courseTitle")}</p>
            {#if pick(footerFr, footerHt, "")}<p class="c-footer">{pick(footerFr, footerHt, "")}</p>{/if}
            {#if signers.length}
              <div class="c-signers">
                {#each signers as s (s.key)}
                  <div class="c-signer">
                    <span class="c-sig">
                      {#if s.signatureUrl}<img src={s.signatureUrl} alt="" />{/if}
                    </span>
                    <span class="c-line"></span>
                    <strong>{s.name || L("admin.cert.preview.missing")}</strong>
                    <span>{pick(s.roleFr, s.roleHt, "")}</span>
                  </div>
                {/each}
              </div>
            {/if}
            <p class="c-meta">
              <span>{L("admin.cert.preview.date")} {today}</span>
              <span>{L("admin.cert.preview.number")} {new Date().getFullYear()}-000000</span>
            </p>
          </div>
        </figure>
        <p class="muted">{t("admin.cert.preview.hint")}</p>
      </aside>
    </div>
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
    padding: var(--s-6) var(--s-8) var(--s-10);
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--s-4);
  }
  .back {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    text-underline-offset: 3px;
  }
  h1 {
    margin: var(--s-2) 0;
    font: 800 var(--fs-32) / 1.05 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  h2 {
    margin: 0;
    font: 700 var(--fs-19) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .muted {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    line-height: 1.45;
  }
  .sample {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--s-4);
    border: 1px solid var(--c-ink);
    border-radius: var(--r-pill);
    color: var(--c-ink);
    font: 600 var(--fs-14) / 1 var(--font-ui);
    text-decoration: none;
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    gap: var(--s-6);
    align-items: start;
  }
  .editor {
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
  }
  .editor section {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding: var(--s-5);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-3);
  }
  .three {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s-3);
  }
  .color {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    font-size: var(--fs-14);
  }
  .color input {
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: none;
    cursor: pointer;
  }
  code {
    font: 600 var(--fs-13) / 1 var(--font-ui);
    font-variant-numeric: tabular-nums;
  }
  .warn {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--c-warning-text, var(--c-ink));
  }
  .signers {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }
  .signer {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding: var(--s-4);
    border-radius: var(--r-md);
    background: var(--c-paper);
  }
  .s-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .s-num {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--c-ink);
    color: var(--c-surface);
    font: 700 var(--fs-13) / 1 var(--font-display);
  }
  .icon {
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: var(--r-pill);
    background: transparent;
    color: var(--c-ink-2);
    font-size: var(--fs-19);
    cursor: pointer;
  }
  .sig {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-3);
  }
  .sig img {
    height: 56px;
    max-width: 220px;
    object-fit: contain;
    padding: var(--s-1) var(--s-3);
    border-bottom: 1px solid var(--c-ink);
    background: var(--c-surface);
  }
  .sig-empty {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .sig-tools {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  .import {
    position: relative;
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
    background: var(--c-surface);
    font: 600 var(--fs-13) / 1 var(--font-ui);
    cursor: pointer;
  }
  .import input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .sending {
    display: flex;
    align-items: center;
    gap: var(--s-3);
  }
  .bar {
    flex: 1;
    height: 6px;
    border-radius: var(--r-pill);
    background: var(--c-line-soft);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--c-primary);
  }
  .err {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--c-danger-text);
  }
  .add {
    align-self: flex-start;
    min-height: 40px;
    padding: 0 var(--s-3);
    border: 1px dashed var(--c-ink-3);
    border-radius: var(--r-pill);
    background: transparent;
    color: var(--c-ink);
    font: 600 var(--fs-13) / 1 var(--font-ui);
    cursor: pointer;
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
  .row {
    display: flex;
    justify-content: flex-end;
  }
  .preview-col {
    position: sticky;
    top: var(--s-6);
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }
  .lang {
    align-self: flex-start;
    display: inline-flex;
    padding: 3px;
    border-radius: var(--r-pill);
    background: var(--c-line-soft);
  }
  .lang button {
    min-height: 36px;
    padding: 0 var(--s-4);
    border: 0;
    border-radius: var(--r-pill);
    background: transparent;
    color: var(--c-ink-2);
    font: 600 var(--fs-13) / 1 var(--font-ui);
    cursor: pointer;
  }
  .lang button[aria-pressed="true"] {
    background: var(--c-surface);
    color: var(--c-ink);
  }
  /* La feuille : A4 paysage, tailles en unités du conteneur pour garder les proportions du PDF. */
  .sheet {
    container-type: inline-size;
    margin: 0;
    aspect-ratio: 297 / 210;
    padding: 3.3cqw;
    background: var(--c-surface);
    box-shadow: var(--shadow-object);
    color: var(--c-ink);
  }
  .inner {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1.2cqw 5cqw 0;
    border: 0.25cqw solid var(--accent);
    outline: 0.08cqw solid var(--accent);
    outline-offset: -1cqw;
    text-align: center;
  }
  .inner p {
    margin: 0;
  }
  .logo {
    height: 7.6cqw;
    max-width: 16cqw;
    margin-top: 2cqw;
    object-fit: contain;
  }
  .logo-space {
    height: 3cqw;
  }
  .party {
    margin-top: 1.2cqw !important;
    font: 700 1.55cqw / 1.2 var(--font-ui);
    letter-spacing: 0.24cqw;
    text-transform: uppercase;
  }
  .c-title {
    margin-top: 1.2cqw !important;
    font: 700 3.8cqw / 1.1 var(--font-ui);
    color: var(--accent);
    overflow-wrap: anywhere;
  }
  .c-mention {
    margin-top: 2cqw !important;
    font-size: 1.55cqw;
  }
  .c-name {
    margin-top: 0.8cqw !important;
    font: 700 3.3cqw / 1.2 var(--font-ui);
  }
  .c-member {
    margin-top: 0.6cqw !important;
    font-size: 1.3cqw;
    color: var(--c-ink-2);
  }
  .c-course-lead {
    margin-top: 1.8cqw !important;
    font-size: 1.55cqw;
  }
  .c-course {
    margin-top: 0.5cqw !important;
    font: 700 2.25cqw / 1.2 var(--font-ui);
  }
  .c-footer {
    margin-top: 1.1cqw !important;
    max-width: 68cqw;
    font-size: 1.2cqw;
    color: var(--c-ink-2);
  }
  .c-signers {
    width: 100%;
    margin-top: auto;
    display: flex;
    justify-content: space-around;
    gap: 2cqw;
  }
  .c-signer {
    width: 23cqw;
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 1.05cqw;
    color: var(--c-ink-2);
  }
  .c-signer strong {
    margin-top: 0.6cqw;
    font-size: 1.2cqw;
    color: var(--c-ink);
  }
  .c-sig {
    height: 5.6cqw;
    display: flex;
    align-items: flex-end;
  }
  .c-sig img {
    max-height: 5.6cqw;
    max-width: 22cqw;
    object-fit: contain;
  }
  .c-line {
    width: 100%;
    border-top: 0.08cqw solid var(--c-ink);
  }
  .c-meta {
    width: 100%;
    margin: auto 0 1.8cqw !important;
    display: flex;
    justify-content: space-between;
    font-size: 1.2cqw;
  }
  .c-signers + .c-meta {
    margin-top: 2.2cqw !important;
  }
  .back:focus-visible,
  .sample:focus-visible,
  .icon:focus-visible,
  .add:focus-visible,
  .lang button:focus-visible,
  .color input:focus-visible,
  .import:has(input:focus-visible) {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  @media (max-width: 1100px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .preview-col {
      position: static;
      order: -1;
    }
  }
  @media (max-width: 760px) {
    main {
      padding: var(--s-5) var(--s-4) var(--s-8);
    }
    .two,
    .three {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
