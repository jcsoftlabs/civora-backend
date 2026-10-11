<!--
  Bandeaux de fonctions qui défilent en sens contraires (site commercial, SOC-12), comme sur qomon.com : chaque
  pastille nomme un outil de la plateforme. Pause au survol ; immobile si les animations sont réduites.
-->
<script lang="ts">
  import { translator, type MessageKey } from "$lib/i18n";

  let { locale }: { locale: "fr" | "ht" } = $props();
  const t = $derived(translator(locale));
  const tk = (k: string) => t(k as MessageKey);
  const ROWS = [
    [1, 2, 3, 4, 5, 6, 7, 8],
    [9, 10, 11, 12, 13, 14, 15, 16],
  ];
</script>

<div class="marquee" aria-label={t("mk.marquee.label")} role="region">
  {#each ROWS as row, r (r)}
    <div class="row" class:reverse={r === 1}>
      <!-- Deux copies à la suite : la boucle se raccorde sans saut. -->
      {#each [0, 1] as copy (copy)}
        <ul class="track" aria-hidden={copy === 1 ? "true" : undefined}>
          {#each row as i (i)}
            <li class:accent={i % 4 === 0}>{tk(`mk.marquee.${i}`)}</li>
          {/each}
        </ul>
      {/each}
    </div>
  {/each}
</div>

<style>
  .marquee {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding: var(--s-10) 0;
    overflow: hidden;
    border-top: 1px solid var(--c-line);
    mask: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
  }
  .row {
    display: flex;
    width: max-content;
    animation: slide 46s linear infinite;
  }
  .row.reverse {
    animation-direction: reverse;
    animation-duration: 52s;
  }
  .marquee:hover .row {
    animation-play-state: paused;
  }
  .track {
    display: flex;
    gap: var(--s-3);
    margin: 0;
    padding: 0 var(--s-3) 0 0;
    list-style: none;
  }
  li {
    padding: var(--s-3) var(--s-5);
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
    background: var(--c-surface);
    font-size: var(--fs-16);
    font-weight: 500;
    white-space: nowrap;
  }
  li.accent {
    background: var(--c-primary-deep);
    border-color: var(--c-primary-deep);
    color: var(--c-surface);
  }
  @keyframes slide {
    to {
      transform: translateX(-50%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .row {
      animation: none;
      width: auto;
      flex-wrap: wrap;
      justify-content: center;
    }
    .track[aria-hidden="true"] {
      display: none;
    }
    .track {
      flex-wrap: wrap;
      justify-content: center;
      padding: 0 var(--s-4);
    }
    .marquee {
      mask: none;
    }
  }
</style>
