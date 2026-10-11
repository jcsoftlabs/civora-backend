<!--
  Questions fréquentes du site commercial (SOC-12) : réponses courtes et autonomes, reprises telles quelles
  dans le balisage FAQPage (schema.org) pour les moteurs de recherche et les assistants.
-->
<script lang="ts">
  import { translator, type MessageKey } from "$lib/i18n";

  let { locale }: { locale: "fr" | "ht" } = $props();
  const t = $derived(translator(locale));
  const tk = (k: string) => t(k as MessageKey);
  // Balise construite en deux morceaux : écrite d'un bloc, elle fermerait le script du composant.
  const TAG = "scr" + "ipt";
  const ITEMS = Array.from({ length: 15 }, (_, i) => i + 1);
  const schema = $derived(
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: locale === "ht" ? "ht" : "fr",
      mainEntity: ITEMS.map((i) => ({
        "@type": "Question",
        name: tk(`mk.faq.q${i}`),
        acceptedAnswer: { "@type": "Answer", text: tk(`mk.faq.a${i}`) },
      })),
    }).replace(/</g, "\\u003c"),
  );
</script>

<svelte:head>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html `<${TAG} type="application/ld+json">${schema}</${TAG}>`}
</svelte:head>

<h2 id="faq-title">{t("mk.faq.title")}</h2>
<div class="list">
  {#each ITEMS as i (i)}
    <details id="faq-{i}">
      <summary>{tk(`mk.faq.q${i}`)}</summary>
      <p>{tk(`mk.faq.a${i}`)}</p>
    </details>
  {/each}
</div>

<style>
  h2 {
    margin: 0;
    font: 600 clamp(30px, 3.6vw, 42px) / 1.12 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .list {
    margin-top: var(--s-8);
    border-top: 1px solid var(--c-line);
  }
  details {
    border-bottom: 1px solid var(--c-line);
  }
  summary {
    position: relative;
    min-height: 64px;
    display: flex;
    align-items: center;
    padding: var(--s-4) var(--s-10) var(--s-4) 0;
    font-size: var(--fs-19);
    font-weight: 500;
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  /* Signe plus qui devient moins à l'ouverture. */
  summary::before,
  summary::after {
    content: "";
    position: absolute;
    right: 6px;
    top: 50%;
    width: 16px;
    height: 2px;
    background: var(--c-ink);
  }
  summary::after {
    transform: rotate(90deg);
    transition: transform 0.15s ease;
  }
  details[open] summary::after {
    transform: rotate(0);
  }
  p {
    margin: 0;
    padding: 0 var(--s-10) var(--s-5) 0;
    max-width: 44em;
    font-size: var(--fs-16);
    line-height: 1.6;
    color: var(--c-ink-2);
  }
  summary:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  @media (prefers-reduced-motion: reduce) {
    summary::after {
      transition: none;
    }
  }
</style>
