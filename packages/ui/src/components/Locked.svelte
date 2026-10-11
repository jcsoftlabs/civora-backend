<!--
  Fonctionnalité hors palier : jamais masquée en silence (apps/web/CLAUDE.md). On montre l'option,
  désactivée, avec le palier qui l'ouvre et un lien pour changer de formule (vente additionnelle).
  Tous les textes viennent de l'application : `title`, `message` (« Disponible avec la formule Mouvement »), `actionLabel`.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    title: string;
    message: string;
    actionLabel?: string;
    actionHref?: string;
    /** Aperçu de l'option, rendu inerte. */
    children?: Snippet;
  }
  let { title, message, actionLabel, actionHref, children }: Props = $props();
  const uid = $props.id();
</script>

<section class="locked" aria-labelledby="locked-{uid}">
  <header>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2" />
    </svg>
    <h3 id="locked-{uid}">{title}</h3>
  </header>
  <p>{message}</p>
  {#if children}<div class="preview" inert>{@render children()}</div>{/if}
  {#if actionLabel && actionHref}<a href={actionHref}>{actionLabel}</a>{/if}
</section>

<style>
  .locked {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    padding: var(--s-5);
    border: 1.5px dashed var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-paper);
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    color: var(--c-ink-2);
  }
  h3 {
    margin: 0;
    font: 700 var(--fs-16) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
    color: var(--c-ink);
  }
  p {
    margin: 0;
    font-size: var(--fs-14);
    color: var(--c-ink-2);
  }
  .preview {
    opacity: 0.5;
    filter: grayscale(1);
  }
  a {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-min);
    padding: 0 var(--s-4);
    border-radius: var(--r-pill);
    background: var(--c-accent-tint);
    color: var(--c-on-accent);
    font: 600 var(--fs-14) / 1 var(--font-ui);
    text-decoration: none;
  }
  a:hover {
    background: var(--c-accent-bright);
  }
  a:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
</style>
