<!--
  Couleurs du parti : principale (12 couleurs fondamentales, sélecteur libre ou code exact de la charte) et
  seconde couleur facultative (« Aucune », blanc ou une autre couleur). Partagé par l'assistant de création
  et les réglages du parti. La couleur reste celle du parti : seul le texte posé dessus est calculé.
-->
<script lang="ts">
  import { organizationKind } from "$lib/i18n/org";
  import { partyTheme } from "@civora/ui";
  import { translator, type MessageKey } from "$lib/i18n";

  interface Props {
    color: string;
    secondary: string | null;
    locale: "fr" | "ht";
  }
  let { color = $bindable(), secondary = $bindable(), locale }: Props = $props();
  const orgKind = organizationKind();
  const t = $derived(translator(locale, orgKind()));
  const tk = (key: string) => t(key as MessageKey);

  // Couleurs fondamentales, toutes lisibles telles quelles (contraste 4,5:1 au moins avec leur texte).
  const COLORS = [
    { hex: "#C8102E", name: "rouge" },
    { hex: "#E8590C", name: "orange" },
    { hex: "#F2C200", name: "jaune" },
    { hex: "#1C8339", name: "vert" },
    { hex: "#0F6E66", name: "petrole" },
    { hex: "#1F8FD1", name: "bleuciel" },
    { hex: "#1F5FBF", name: "bleu" },
    { hex: "#6D28D9", name: "violet" },
    { hex: "#D6336C", name: "rose" },
    { hex: "#7A4A2A", name: "marron" },
    { hex: "#5F6368", name: "gris" },
    { hex: "#1C1B19", name: "noir" },
  ];
  // Suit la couleur choisie ; reste modifiable à la main (code de la charte du parti).
  let hexInput = $derived(color.toUpperCase());
  function applyHex() {
    const v = hexInput.trim().replace(/^([0-9a-f]{6})$/i, "#$1");
    if (/^#[0-9a-f]{6}$/i.test(v)) color = v.toUpperCase();
  }
  const adjusted = $derived(partyTheme(color)["--c-primary"] !== color.toUpperCase());
</script>

<fieldset>
  <legend>{t("create.color")}</legend>
  <div class="swatches">
    {#each COLORS as c (c.hex)}
      <label class="swatch" style:--sw={c.hex}>
        <input type="radio" name="color" value={c.hex} bind:group={color} />
        <span class="dot" aria-hidden="true"></span>
        <span class="sr-only">{tk(`create.color.${c.name}`)}</span>
      </label>
    {/each}
    <label class="swatch custom">
      <input type="color" bind:value={color} aria-label={t("create.color.custom")} />
    </label>
  </div>
  <label class="hex">
    <span>{t("create.color.hex")}</span>
    <input
      bind:value={hexInput}
      onchange={applyHex}
      onkeydown={(e) => e.key === "Enter" && applyHex()}
      maxlength={7}
      spellcheck={false}
      autocapitalize="characters"
    />
  </label>
  {#if adjusted}<p class="msg">{t("create.color.adjusted")}</p>{/if}
</fieldset>

<fieldset>
  <legend>{t("create.color.secondary")}</legend>
  <div class="swatches">
    <label class="none">
      <input type="radio" name="secondary" value={null} bind:group={secondary} />
      <span>{t("create.color.none")}</span>
    </label>
    <label class="swatch white" style:--sw="#FFFFFF">
      <input type="radio" name="secondary" value="#FFFFFF" bind:group={secondary} />
      <span class="dot" aria-hidden="true"></span>
      <span class="sr-only">{t("create.color.blanc")}</span>
    </label>
    {#each COLORS as c (c.hex)}
      {#if c.hex !== color}
        <label class="swatch" style:--sw={c.hex}>
          <input type="radio" name="secondary" value={c.hex} bind:group={secondary} />
          <span class="dot" aria-hidden="true"></span>
          <span class="sr-only">{tk(`create.color.${c.name}`)}</span>
        </label>
      {/if}
    {/each}
  </div>
  <p class="msg">{t("create.color.secondary.hint")}</p>
</fieldset>

<style>
  /* « Aucune » : un vrai bouton avec son libellé, pour ne pas être pris pour du blanc. */
  .none {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-min);
    padding: 0 var(--s-4);
    border: 1.5px solid var(--c-line);
    border-radius: var(--r-pill);
    background: var(--c-surface);
    font: 600 var(--fs-13) / 1 var(--font-ui);
    color: var(--c-ink-2);
    cursor: pointer;
  }
  .none input {
    position: absolute;
    opacity: 0;
    inset: 0;
    cursor: pointer;
  }
  .none:has(input:checked) {
    border-color: var(--c-ink);
    color: var(--c-ink);
  }
  .none:has(input:focus-visible) {
    box-shadow: var(--focus-ring);
  }
  .swatch.white .dot {
    box-shadow: inset 0 0 0 1.5px var(--c-line);
  }
  .swatches {
    display: flex;
    gap: var(--s-2);
    flex-wrap: wrap;
  }
  .swatch {
    position: relative;
    display: grid;
    place-items: center;
    width: var(--touch-min);
    height: var(--touch-min);
    cursor: pointer;
  }
  .swatch input[type="radio"] {
    position: absolute;
    opacity: 0;
    inset: 0;
    cursor: pointer;
  }
  .dot {
    width: 32px;
    height: 32px;
    border-radius: var(--r-pill);
    background: var(--sw);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
  }
  .swatch input:checked + .dot {
    box-shadow:
      0 0 0 2px var(--c-surface),
      0 0 0 4px var(--c-ink);
  }
  .swatch input:focus-visible + .dot {
    box-shadow: var(--focus-ring);
  }
  .hex {
    display: inline-flex;
    align-items: center;
    gap: var(--s-3);
    font: 500 var(--fs-13) / 1 var(--font-ui);
    color: var(--c-ink-2);
  }
  .hex input {
    width: 7.5em;
    min-height: 36px;
    padding: 0 var(--s-3);
    border: 1.5px solid var(--c-line);
    border-radius: var(--r-sm);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 600 var(--fs-14) / 1 var(--font-ui);
    font-variant-numeric: tabular-nums;
  }
  .hex input:focus-visible {
    outline: none;
    border-color: var(--c-primary);
    box-shadow: var(--focus-ring);
  }
  .custom input {
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1.5px dashed var(--c-ink-3);
    border-radius: var(--r-pill);
    background: none;
    cursor: pointer;
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }
  legend {
    padding: 0;
    margin-bottom: var(--s-3);
    font: 600 var(--fs-14) / 1.3 var(--font-ui);
  }
  .msg {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
</style>
