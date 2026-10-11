<!--
  Champ de saisie : libellé au-dessus, aide ou erreur en dessous, compteur de caractères si maxlength.
  L'erreur dit ce qui s'est passé et quoi faire ; elle est reliée au champ par aria-describedby.
-->
<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";

  interface Props extends Omit<HTMLInputAttributes, "value"> {
    label: string;
    value?: string;
    hint?: string;
    error?: string;
    id?: string;
  }
  let { label, value = $bindable(""), hint, error, id, maxlength, ...rest }: Props = $props();

  const uid = $props.id();
  const inputId = $derived(id ?? `field-${uid}`);
  const describedBy = $derived(error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined);
</script>

<div class="field" class:invalid={!!error}>
  <div class="top">
    <label for={inputId}>{label}</label>
    {#if maxlength}
      <span class="count" aria-hidden="true">{value.length} / {maxlength}</span>
    {/if}
  </div>
  <input id={inputId} bind:value {maxlength} aria-invalid={!!error} aria-describedby={describedBy} {...rest} />
  {#if error}
    <p class="msg error" id="{inputId}-error">{error}</p>
  {:else if hint}
    <p class="msg" id="{inputId}-hint">{hint}</p>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--s-3);
  }
  label {
    font: 600 var(--fs-14) / 1.3 var(--font-ui);
    color: var(--c-ink);
  }
  .count {
    font-size: var(--fs-12);
    color: var(--c-ink-2);
    font-variant-numeric: tabular-nums;
  }
  input {
    min-height: var(--touch-min);
    padding: 0 var(--s-4);
    border: 1.5px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 400 var(--fs-16) / 1.4 var(--font-ui);
  }
  input:hover {
    border-color: var(--c-ink-3);
  }
  input:focus-visible {
    outline: none;
    border-color: var(--c-primary);
    box-shadow: var(--focus-ring);
  }
  .invalid input {
    border-color: var(--c-danger);
  }
  .msg {
    margin: 0;
    font-size: var(--fs-13);
    line-height: 1.4;
    color: var(--c-ink-2);
  }
  .msg.error {
    color: var(--c-danger-text);
  }
</style>
