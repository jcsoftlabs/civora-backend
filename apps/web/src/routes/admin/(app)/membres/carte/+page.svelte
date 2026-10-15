<!--
  Éditeur de la carte de membre (ADH-13) : tout se règle avant l'impression, aperçu en direct du recto et du verso.
  Format (carte ou badge), fond (couleur ou image voilée), couleurs, motif de sécurité, logo, intitulé, champs
  imprimés, validité, côté du QR, verso (texte, signataire et signature). Exemplaires PDF au format carte PVC et
  en planche A4, du brouillon en cours, avant d'enregistrer.
-->
<script lang="ts">
  import { organizationKind } from "$lib/i18n/org";
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";
  import { Button, Field, Locked, MemberCard, Switch } from "@civora/ui";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData & { locale: "fr" | "ht" }; form: ActionData } = $props();
  const orgKind = organizationKind();
  const t = $derived(translator(data.locale, orgKind()));
  const tk = (k: string) => t(k as MessageKey);

  // svelte-ignore state_referenced_locally
  const tpl = data.template;
  // Brouillon : copie du modèle enregistré, modifiée par les contrôles, envoyée telle quelle à l'enregistrement.
  let design = $state(structuredClone(tpl?.design ?? null));
  let backgroundUrl = $state(tpl?.assets.backgroundUrl ?? null);
  let signatureUrl = $state(tpl?.assets.signatureUrl ?? null);
  let pending = $state<string | null>(null);
  const json = $derived(JSON.stringify(design));
  const FIELDS = ["photo", "number", "zone", "status", "since", "validity"] as const;
  const year = String(new Date().getFullYear());
  const validityText = $derived(
    !design || !design.fields.validity || design.validity.mode === "none"
      ? null
      : design.validity.mode === "until" && design.validity.until
        ? design.validity.until.split("-").reverse().join("/")
        : year,
  );
  const lang = (v: { fr: string; ht?: string | undefined } | null | undefined) =>
    v ? (data.locale === "ht" && v.ht) || v.fr : null;

  function ensureBack() {
    if (design && !design.back.signatory) design.back.signatory = { name: "", role: { fr: "" }, signatureFileId: null };
  }
  const uploaded = $derived(
    (form as { uploaded?: { purpose: string; fileId: string; url: string } } | null)?.uploaded ?? null,
  );
  $effect(() => {
    if (!uploaded || !design) return;
    if (uploaded.purpose === "card_background") {
      design.background.kind = "image";
      design.background.imageFileId = uploaded.fileId;
      backgroundUrl = uploaded.url;
    } else {
      ensureBack();
      design.back.signatory!.signatureFileId = uploaded.fileId;
      signatureUrl = uploaded.url;
    }
  });
  const message = $derived(
    (form as { code?: string } | null)?.code
      ? { bad: true, text: tk(`error.${(form as { code: string }).code}`) }
      : (form as { done?: string } | null)?.done
        ? { bad: false, text: t("admin.cardEditor.saved") }
        : null,
  );
  const submit = (key: string) => () => {
    pending = key;
    return async ({ update }: { update: (o?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void> }) => {
      await update({ reset: false, invalidateAll: false });
      pending = null;
    };
  };
</script>

<main>
  <header class="head">
    <a class="crumb" href={resolve("/admin/membres")}>{t("admin.nav.members")}</a>
    <h1>{t("admin.cardEditor.title")}</h1>
    <p class="lead">{t("admin.cardEditor.lead")}</p>
  </header>

  {#if data.locked || !design || !tpl}
    <Locked title={t("admin.cardEditor.title")} message={format(t("plan.lockedIn"), { tier: t("plan.mouvement") })} />
  {:else}
    {#if message}<p class="msg" class:bad={message.bad} role="status">{message.text}</p>{/if}
    <div class="layout">
      <div class="controls">
        <fieldset>
          <legend>{t("admin.cardEditor.format")}</legend>
          <div class="seg">
            {#each ["horizontal", "vertical"] as const as o (o)}
              <label class:on={design.orientation === o}>
                <input type="radio" bind:group={design.orientation} value={o} />{tk(`admin.cardEditor.${o}`)}
              </label>
            {/each}
          </div>
        </fieldset>

        <fieldset>
          <legend>{t("admin.cardEditor.background")}</legend>
          <div class="seg">
            {#each ["color", "image"] as const as k (k)}
              <label class:on={design.background.kind === k}>
                <input type="radio" bind:group={design.background.kind} value={k} />{tk(`admin.cardEditor.bg.${k}`)}
              </label>
            {/each}
          </div>
          {#if design.background.kind === "color"}
            <label class="color">
              <span>{t("admin.cardEditor.bgColor")}</span>
              <input
                type="color"
                value={design.background.color ?? tpl.party.brandColor}
                oninput={(e) => (design!.background.color = e.currentTarget.value)}
              />
              {#if design.background.color}
                <button type="button" class="link" onclick={() => (design!.background.color = null)}
                  >{t("admin.cardEditor.partyColor")}</button
                >
              {/if}
            </label>
          {:else}
            <form
              method="POST"
              action="?/upload"
              enctype="multipart/form-data"
              use:enhance={submit("bg")}
              class="upload"
            >
              <input type="hidden" name="purpose" value="card_background" />
              <label class="file">
                <span>{t("admin.cardEditor.bgImage")}</span>
                <input
                  type="file"
                  name="file"
                  accept="image/png,image/jpeg,image/webp"
                  required
                  onchange={(e) => e.currentTarget.form?.requestSubmit()}
                />
              </label>
              <small>{t("admin.cardEditor.bgImageHint")}</small>
            </form>
            <label class="range">
              <span>{t("admin.cardEditor.veil")}</span>
              <input type="range" min="0" max="0.7" step="0.05" bind:value={design.background.veil} />
            </label>
          {/if}
        </fieldset>

        <fieldset>
          <legend>{t("admin.cardEditor.colors")}</legend>
          {#each [["textColor", "admin.cardEditor.text"], ["accentColor", "admin.cardEditor.accent"]] as const as [key, label] (key)}
            <label class="color">
              <span>{tk(label)}</span>
              <input
                type="color"
                value={design[key] ?? (key === "textColor" ? "#F6E7C8" : "#F2B84B")}
                oninput={(e) => (design![key] = e.currentTarget.value)}
              />
              {#if design[key]}
                <button type="button" class="link" onclick={() => (design![key] = null)}
                  >{t("admin.cardEditor.auto")}</button
                >
              {:else}
                <small>{t("admin.cardEditor.autoHint")}</small>
              {/if}
            </label>
          {/each}
        </fieldset>

        <fieldset>
          <legend>{t("admin.cardEditor.pattern")}</legend>
          <div class="seg">
            {#each ["rosette", "waves", "none"] as const as p (p)}
              <label class:on={design.pattern === p}>
                <input type="radio" bind:group={design.pattern} value={p} />{tk(`admin.cardEditor.pattern.${p}`)}
              </label>
            {/each}
          </div>
          <Switch
            label={t("admin.cardEditor.logo")}
            description={t("admin.cardEditor.logoHint")}
            bind:checked={design.showLogo}
            onLabel={t("common.yes")}
            offLabel={t("common.no")}
          />
        </fieldset>

        <fieldset>
          <legend>{t("admin.cardEditor.front")}</legend>
          <Field
            label={t("admin.cardEditor.cardTitle")}
            placeholder={t("admin.sheet.card")}
            maxlength={40}
            value={design.title?.fr ?? ""}
            oninput={(e) =>
              (design!.title = e.currentTarget.value ? { ...(design!.title ?? {}), fr: e.currentTarget.value } : null)}
          />
          <Field
            label={t("admin.cardEditor.cardTitleHt")}
            maxlength={40}
            value={design.title?.ht ?? ""}
            oninput={(e) => design!.title && (design!.title.ht = e.currentTarget.value || undefined)}
          />
          <div class="checks">
            {#each FIELDS as f (f)}
              <label class="check"
                ><input type="checkbox" bind:checked={design.fields[f]} />{tk(`admin.cardEditor.field.${f}`)}</label
              >
            {/each}
          </div>
          {#if design.fields.validity}
            <div class="seg">
              {#each ["year", "until", "none"] as const as v (v)}
                <label class:on={design.validity.mode === v}>
                  <input type="radio" bind:group={design.validity.mode} value={v} />{tk(
                    `admin.cardEditor.validity.${v}`,
                  )}
                </label>
              {/each}
            </div>
            {#if design.validity.mode === "until"}
              <label class="date"
                ><span>{t("admin.cardEditor.until")}</span><input
                  type="date"
                  bind:value={design.validity.until}
                /></label
              >
            {/if}
          {/if}
        </fieldset>

        <fieldset>
          <legend>{t("admin.cardEditor.back")}</legend>
          <div class="seg">
            {#each ["front", "back"] as const as q (q)}
              <label class:on={design.qrSide === q}>
                <input type="radio" bind:group={design.qrSide} value={q} />{tk(`admin.cardEditor.qr.${q}`)}
              </label>
            {/each}
          </div>
          <Switch
            label={t("admin.cardEditor.backEnabled")}
            description={t("admin.cardEditor.backHint")}
            bind:checked={design.back.enabled}
            onLabel={t("common.yes")}
            offLabel={t("common.no")}
          />
          {#if design.back.enabled}
            <label class="area">
              <span>{t("admin.cardEditor.backText")}</span>
              <textarea
                rows="3"
                maxlength="600"
                value={design.back.text?.fr ?? ""}
                oninput={(e) =>
                  (design!.back.text = e.currentTarget.value
                    ? { ...(design!.back.text ?? {}), fr: e.currentTarget.value }
                    : null)}
              ></textarea>
            </label>
            <label class="area">
              <span>{t("admin.cardEditor.backTextHt")}</span>
              <textarea
                rows="3"
                maxlength="600"
                value={design.back.text?.ht ?? ""}
                oninput={(e) => design!.back.text && (design!.back.text.ht = e.currentTarget.value || undefined)}
              ></textarea>
            </label>
            <Field
              label={t("admin.cardEditor.signatory")}
              maxlength={80}
              value={design.back.signatory?.name ?? ""}
              oninput={(e) => {
                ensureBack();
                design!.back.signatory!.name = e.currentTarget.value;
              }}
            />
            <Field
              label={t("admin.cardEditor.signatoryRole")}
              maxlength={80}
              value={design.back.signatory?.role.fr ?? ""}
              oninput={(e) => {
                ensureBack();
                design!.back.signatory!.role.fr = e.currentTarget.value;
              }}
            />
            <form
              method="POST"
              action="?/upload"
              enctype="multipart/form-data"
              use:enhance={submit("sig")}
              class="upload"
            >
              <input type="hidden" name="purpose" value="signature" />
              <label class="file">
                <span>{t("admin.cardEditor.signature")}</span>
                <input
                  type="file"
                  name="file"
                  accept="image/png,image/jpeg"
                  required
                  onchange={(e) => e.currentTarget.form?.requestSubmit()}
                />
              </label>
              <small>{t("admin.cardEditor.signatureHint")}</small>
            </form>
          {/if}
        </fieldset>
      </div>

      <aside class="preview" aria-label={t("admin.cardEditor.preview")}>
        <div class="sides">
          {#each ["front", "back"] as const as side (side)}
            {#if side === "front" || design.back.enabled || design.qrSide === "back"}
              <figure>
                <MemberCard
                  partyName={tpl.party.name}
                  brandColor={tpl.party.brandColor}
                  secondaryColor={tpl.party.brandColorSecondary}
                  logoUrl={tpl.party.logoUrl}
                  memberName="Nadège Pierre-Louis"
                  memberNumber="000001"
                  location="1re Section Morne Chandelle"
                  verifyUrl="https://civora.space/v/exemple"
                  orientation={design.orientation}
                  labels={{ card: t("admin.sheet.card"), number: t("create.card.number") }}
                  {design}
                  {backgroundUrl}
                  title={lang(design.title) ?? t("admin.sheet.card")}
                  showPhoto={design.fields.photo}
                  showNumber={design.fields.number}
                  showLocation={design.fields.zone}
                  details={[
                    ...(design.fields.status ? [t("admin.cardEditor.sampleStatus")] : []),
                    ...(design.fields.since ? [format(t("admin.cardEditor.sampleSince"), { year: "2024" })] : []),
                  ]}
                  validity={validityText}
                  {side}
                  back={{
                    text: lang(design.back.text),
                    signatory: design.back.signatory?.name
                      ? { name: design.back.signatory.name, role: lang(design.back.signatory.role) ?? "", signatureUrl }
                      : null,
                  }}
                />
                <figcaption>{tk(`admin.cardEditor.side.${side}`)}</figcaption>
              </figure>
            {/if}
          {/each}
        </div>
        <div class="actions">
          <form method="POST" action="?/save" use:enhance={submit("save")}>
            <input type="hidden" name="design" value={json} />
            <Button type="submit" pending={pending === "save"}>{t("admin.cardEditor.save")}</Button>
          </form>
          {#each ["cr80", "a4"] as const as f (f)}
            <form method="POST" action={resolve("/admin/membres/carte/exemple")} target="_blank">
              <input type="hidden" name="design" value={json} />
              <input type="hidden" name="format" value={f} />
              <Button type="submit" variant="secondary">{tk(`admin.cardEditor.sample.${f}`)}</Button>
            </form>
          {/each}
        </div>
        <p class="hint">{t("admin.cardEditor.printHint")}</p>
      </aside>
    </div>
  {/if}
</main>

<style>
  main {
    padding: var(--s-6) var(--s-8) var(--s-10);
  }
  .crumb {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    text-decoration: none;
  }
  h1 {
    margin: var(--s-2) 0 var(--s-2);
    font: 600 var(--fs-32) / 1.12 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .lead {
    margin: 0 0 var(--s-5);
    max-width: 60ch;
    color: var(--c-ink-2);
    line-height: 1.5;
  }
  .msg {
    margin: 0 0 var(--s-4);
    padding: var(--s-3) var(--s-4);
    border-radius: var(--r-md);
    background: var(--c-success-tint);
    color: var(--c-success-text);
    font-weight: 600;
  }
  .msg.bad {
    background: var(--c-danger-tint);
    color: var(--c-danger-text);
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
    gap: var(--s-8);
    align-items: start;
  }
  .controls {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }
  fieldset {
    margin: 0;
    padding: var(--s-5);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    min-width: 0;
  }
  legend {
    float: left;
    width: 100%;
    margin-bottom: var(--s-1);
    font: 600 var(--fs-16) / 1.3 var(--font-display);
  }
  legend + * {
    clear: both;
  }
  .seg {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  .seg label {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--s-4);
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
    font: 600 var(--fs-14) / 1 var(--font-ui);
    cursor: pointer;
  }
  .seg label.on {
    background: var(--c-ink);
    border-color: var(--c-ink);
    color: var(--c-surface);
  }
  .seg input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .seg label:has(input:focus-visible) {
    box-shadow: var(--focus-ring);
  }
  .color,
  .range,
  .date,
  .file {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    flex-wrap: wrap;
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .color input[type="color"] {
    width: 44px;
    height: 36px;
    padding: 0;
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: none;
  }
  .range input {
    flex: 1;
    min-width: 160px;
  }
  small,
  .hint {
    font-size: var(--fs-13);
    font-weight: 400;
    color: var(--c-ink-2);
  }
  .link {
    border: 0;
    background: none;
    color: var(--c-primary);
    font: 600 var(--fs-13) / 1 var(--font-ui);
    cursor: pointer;
    min-height: 32px;
  }
  .checks {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--s-2);
  }
  .check {
    min-height: 40px;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    font-size: var(--fs-14);
  }
  .check input {
    width: 18px;
    height: 18px;
    accent-color: var(--c-primary);
  }
  .area {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    font: 600 var(--fs-14) / 1.3 var(--font-ui);
  }
  textarea,
  input[type="date"] {
    padding: var(--s-2) var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    font: 400 var(--fs-14) / 1.4 var(--font-ui);
    min-height: 40px;
  }
  .upload {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
  }
  .preview {
    position: sticky;
    top: var(--s-6);
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    padding: var(--s-6);
    border-radius: var(--r-lg);
    background: var(--c-paper);
    border: 1px dashed var(--c-line);
  }
  .sides {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-6);
    justify-content: center;
  }
  .sides figure {
    margin: 0;
    flex: 1 1 260px;
    max-width: 380px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-3);
  }
  figcaption {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
    justify-content: center;
  }
  @media (max-width: 1100px) {
    .layout {
      grid-template-columns: 1fr;
    }
    .preview {
      position: static;
      order: -1;
    }
  }
  @media (max-width: 760px) {
    main {
      padding: var(--s-5) var(--s-4) var(--s-8);
    }
  }
</style>
