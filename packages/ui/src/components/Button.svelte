<!--
  Bouton. Une seule action principale (primary) par vue.
  primary : plein, couleur du parti ; secondary : contour ; ink : plein encre ; ghost : sans fond.
  Avec href, rendu en <a> ; sinon en <button>. Jamais de div cliquable.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  interface Props extends HTMLButtonAttributes {
    variant?: "primary" | "secondary" | "ink" | "ghost";
    size?: "md" | "sm";
    href?: string;
    /** Action en cours : le libellé reste, le bouton est désactivé. Pas de spinner. */
    pending?: boolean;
    children: Snippet;
  }
  let {
    variant = "primary",
    size = "md",
    href,
    pending = false,
    children,
    type = "button",
    disabled,
    ...rest
  }: Props = $props();
</script>

{#if href}
  <a class="btn {variant} {size}" {href}>{@render children()}</a>
{:else}
  <button class="btn {variant} {size}" {type} disabled={disabled || pending} aria-busy={pending} {...rest}>
    {@render children()}
  </button>
{/if}

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--s-2);
    min-height: var(--touch-min);
    padding: 0 var(--s-5);
    border-radius: var(--r-pill);
    border: 1.5px solid transparent;
    font: 600 var(--fs-15) / 1 var(--font-ui);
    text-decoration: none;
    cursor: pointer;
    transition:
      background var(--dur-fast),
      border-color var(--dur-fast),
      color var(--dur-fast);
  }
  .btn.sm {
    min-height: 36px;
    padding: 0 var(--s-4);
    font-size: var(--fs-14);
  }
  .btn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .btn:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .btn[aria-busy="true"] {
    cursor: progress;
  }

  .primary {
    background: var(--c-primary);
    color: var(--c-on-primary);
  }
  .primary:hover:not(:disabled) {
    background: var(--c-primary-hover);
  }
  .secondary {
    background: var(--c-surface);
    color: var(--c-ink);
    border-color: var(--c-line);
  }
  .secondary:hover:not(:disabled) {
    border-color: var(--c-ink);
  }
  .ink {
    background: var(--c-ink);
    color: var(--c-surface);
  }
  .ink:hover:not(:disabled) {
    background: var(--c-primary-deep);
  }
  .ghost {
    background: transparent;
    color: var(--c-ink);
  }
  .ghost:hover:not(:disabled) {
    background: var(--c-line-soft);
  }
</style>
