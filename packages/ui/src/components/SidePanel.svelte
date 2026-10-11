<!--
  Panneau d'édition latéral : on modifie sans quitter la liste.
  Boîte de dialogue native (<dialog>) : piège du focus, Échap pour fermer, retour du focus à l'ouverture.
  « Mode simple » masque les réglages avancés (snippet `advanced`). Annuler et Enregistrer en bas (snippet `footer`).
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    open?: boolean;
    title: string;
    closeLabel: string;
    simpleModeLabel?: string;
    simpleMode?: boolean;
    children: Snippet;
    advanced?: Snippet;
    footer?: Snippet;
    onclose?: () => void;
  }
  let {
    open = $bindable(false),
    title,
    closeLabel,
    simpleModeLabel,
    simpleMode = $bindable(false),
    children,
    advanced,
    footer,
    onclose,
  }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  const uid = $props.id();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });

  function close() {
    open = false;
    onclose?.();
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="panel-{uid}-title"
  onclose={close}
  onclick={(e) => e.target === dialog && close()}
>
  <div class="panel">
    <header>
      <h2 id="panel-{uid}-title">{title}</h2>
      <div class="tools">
        {#if advanced && simpleModeLabel}
          <button type="button" class="simple" aria-pressed={simpleMode} onclick={() => (simpleMode = !simpleMode)}>
            {simpleModeLabel}
          </button>
        {/if}
        <button type="button" class="close" aria-label={closeLabel} onclick={close}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
            ><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg
          >
        </button>
      </div>
    </header>
    <div class="body">
      {@render children()}
      {#if advanced && !simpleMode}
        <div class="advanced">{@render advanced()}</div>
      {/if}
    </div>
    {#if footer}<footer>{@render footer()}</footer>{/if}
  </div>
</dialog>

<style>
  dialog {
    inset: 0 0 0 auto;
    margin: 0;
    padding: 0;
    border: 0;
    height: 100dvh;
    max-height: 100dvh;
    width: min(480px, 100%);
    max-width: 100%;
    background: var(--c-surface);
    color: var(--c-ink);
  }
  dialog::backdrop {
    background: rgba(28, 27, 25, 0.35);
  }
  dialog[open] {
    animation: slide-in var(--dur-base) ease-out;
  }
  @keyframes slide-in {
    from {
      transform: translateX(24px);
      opacity: 0;
    }
  }
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-5) var(--s-6);
    border-bottom: 1px solid var(--c-line);
  }
  h2 {
    margin: 0;
    font: 700 var(--fs-22) / 1.1 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .tools {
    display: flex;
    align-items: center;
    gap: var(--s-1);
  }
  .tools button {
    min-height: var(--touch-min);
    min-width: var(--touch-min);
    border: 0;
    background: none;
    cursor: pointer;
    border-radius: var(--r-pill);
    color: var(--c-ink);
    font: 600 var(--fs-13) / 1 var(--font-ui);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .simple {
    padding: 0 var(--s-3);
    border: 1.5px solid var(--c-line) !important;
  }
  .simple[aria-pressed="true"] {
    background: var(--c-ink);
    color: var(--c-surface);
    border-color: var(--c-ink) !important;
  }
  .tools button:hover {
    background: var(--c-line-soft);
  }
  .tools button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .body {
    flex: 1;
    overflow-y: auto;
    padding: var(--s-6);
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
  }
  .advanced {
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
    padding-top: var(--s-5);
    border-top: 1px solid var(--c-line-soft);
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--s-3);
    padding: var(--s-4) var(--s-6);
    border-top: 1px solid var(--c-line);
    background: var(--c-surface);
  }
</style>
