<!--
  Rubans de fonctions (site commercial, SOC-12), sur le modèle de qomon.com : deux bandes inclinées qui se
  croisent et défilent en sens contraires, l'une pétrole profond, l'autre ambre. Chaque mot nomme un outil de la
  plateforme. Pause au survol ; rubans immobiles si les animations sont réduites.
-->
<script lang="ts">
  import { translator, type MessageKey } from "$lib/i18n";
  import { inview } from "./inview";

  let { locale }: { locale: "fr" | "ht" } = $props();
  const t = $derived(translator(locale));
  const tk = (k: string) => t(k as MessageKey);
  const ROWS = [
    [1, 2, 3, 4, 17, 5, 6, 7, 8],
    [9, 10, 11, 12, 13, 18, 14, 15, 16],
  ];
</script>

<div class="ribbons" aria-label={t("mk.marquee.label")} role="region" use:inview>
  {#each ROWS as row, r (r)}
    <div class="ribbon" class:amber={r === 1}>
      <div class="row">
        <!-- Deux copies à la suite : la boucle se raccorde sans saut. -->
        {#each [0, 1] as copy (copy)}
          <ul class="track" aria-hidden={copy === 1 ? "true" : undefined}>
            {#each row as i (i)}
              <li>{tk(`mk.marquee.${i}`)}</li>
            {/each}
          </ul>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .ribbons {
    position: relative;
    height: 230px;
    overflow: hidden;
    border-top: 1px solid var(--c-line);
  }
  .ribbon {
    position: absolute;
    left: -5%;
    right: -5%;
    top: 50%;
    padding: 14px 0;
    background: var(--c-primary-deep);
    color: var(--c-paper);
    transform: translateY(-120%) rotate(-2.5deg);
    overflow: hidden;
  }
  .ribbon.amber {
    background: var(--c-accent);
    color: var(--c-ink);
    transform: translateY(15%) rotate(2deg);
  }
  .row {
    display: flex;
    width: max-content;
  }
  .ribbons:global(.playing) .row {
    animation: slide 48s linear infinite;
  }
  .ribbons:global(.playing) .amber .row {
    animation-direction: reverse;
    animation-duration: 56s;
  }
  .ribbons:hover .row {
    animation-play-state: paused !important;
  }
  .track {
    display: flex;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: inline-flex;
    align-items: center;
    font: 600 var(--fs-19) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
    white-space: nowrap;
  }
  /* Séparateur : un point, comme sur une banderole. */
  li::after {
    content: "";
    width: 7px;
    height: 7px;
    margin: 0 var(--s-5);
    border-radius: 50%;
    background: currentColor;
    opacity: 0.55;
  }
  @keyframes slide {
    to {
      transform: translateX(-50%);
    }
  }
  @media (max-width: 760px) {
    .ribbons {
      height: 190px;
    }
    li {
      font-size: var(--fs-16);
    }
  }
  /* Animations réduites : les rubans restent croisés, immobiles, le second décalé. */
  @media (prefers-reduced-motion: reduce) {
    .ribbons:global(.playing) .row {
      animation: none;
    }
    .amber .row {
      transform: translateX(-18%);
    }
  }
</style>
