<!--
  Squelette de chargement (NFR-09) : jamais de spinner. Reprend la forme du contenu attendu.
  variant : line (lignes de texte), avatar, card, row (ligne de tableau).
-->
<script lang="ts">
  interface Props {
    variant?: "line" | "avatar" | "card" | "row";
    lines?: number;
    width?: string;
    label: string;
  }
  let { variant = "line", lines = 1, width = "100%", label }: Props = $props();
</script>

<div class="sk" role="status" aria-live="polite" aria-busy="true">
  <span class="sr-only">{label}</span>
  {#if variant === "avatar"}
    <span class="skeleton avatar" aria-hidden="true"></span>
  {:else if variant === "card"}
    <span class="skeleton card" aria-hidden="true"></span>
  {:else if variant === "row"}
    <span class="row" aria-hidden="true">
      <span class="skeleton avatar small"></span>
      <span class="skeleton bar" style:width="30%"></span>
      <span class="skeleton bar" style:width="20%"></span>
      <span class="skeleton bar" style:width="15%"></span>
    </span>
  {:else}
    {#each Array.from({ length: lines }, (_, i) => i) as i (i)}
      <span class="skeleton bar" aria-hidden="true" style:width={i === lines - 1 && lines > 1 ? "60%" : width}></span>
    {/each}
  {/if}
</div>

<style>
  .sk {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .bar {
    display: block;
    height: 12px;
  }
  .avatar {
    display: block;
    width: 40px;
    height: 40px;
    border-radius: var(--r-pill);
  }
  .avatar.small {
    width: 32px;
    height: 32px;
    flex: none;
  }
  .card {
    display: block;
    height: 160px;
    border-radius: var(--r-lg);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--s-4);
    padding: var(--s-3) 0;
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
