<!--
  Pastille : statut (success, warning, danger), neutre, ou ambre pour la gamification et les cotisations réglées.
  La couleur n'est jamais la seule information : le texte dit l'état.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    tone?: "neutral" | "success" | "warning" | "danger" | "accent" | "primary";
    children: Snippet;
  }
  let { tone = "neutral", children }: Props = $props();
</script>

<span class="badge {tone}">{@render children()}</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--s-1);
    padding: 3px var(--s-2);
    border-radius: var(--r-sm);
    font: 600 var(--fs-12) / 1.3 var(--font-ui);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .neutral {
    background: var(--c-line-soft);
    color: var(--c-ink-2);
  }
  .success {
    background: var(--c-success-tint);
    color: var(--c-success-text);
  }
  .warning {
    background: var(--c-warning-tint);
    color: var(--c-warning-text);
  }
  .danger {
    background: var(--c-danger-tint);
    color: var(--c-danger-text);
  }
  .accent {
    background: var(--c-accent-tint);
    color: var(--c-on-accent);
  }
  .primary {
    background: var(--c-primary-tint);
    color: var(--c-primary-deep);
  }
</style>
