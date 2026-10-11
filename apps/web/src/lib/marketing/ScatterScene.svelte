<!--
  Scène « outils éparpillés » (site commercial, SOC-12), sur le modèle de qomon.com : les cinq outils que civora
  remplace (groupe de discussion, tableur, cahier, reçu, liste de présence) flottent, reliés par des chemins en
  pointillé ; un curseur saute de l'un à l'autre sans jamais trouver l'information complète. Décorative : le texte
  de la section dit la même chose. Tourne seulement à l'écran ; immobile si les animations sont réduites.
-->
<script lang="ts">
  import { inview } from "./inview";

  // Centres des tuiles, dans l'ordre où le curseur les visite.
  const TILES = [
    { x: 92, y: 86, icon: "chat" },
    { x: 262, y: 54, icon: "sheet" },
    { x: 398, y: 142, icon: "book" },
    { x: 318, y: 262, icon: "receipt" },
    { x: 128, y: 238, icon: "list" },
  ] as const;
</script>

<div class="scene" aria-hidden="true" use:inview>
  <svg viewBox="0 0 480 320">
    <!-- Chemins en pointillé entre les outils : ils défilent, rien ne se rejoint. -->
    <g class="paths">
      <path d="M92 86 C 150 20, 210 20, 262 54" />
      <path d="M262 54 C 340 60, 400 80, 398 142" />
      <path d="M398 142 C 410 210, 380 250, 318 262" />
      <path d="M318 262 C 250 300, 180 300, 128 238" />
      <path d="M128 238 C 60 200, 40 140, 92 86" />
      <path class="stray" d="M262 54 C 250 140, 200 180, 128 238" />
    </g>
    {#each TILES as tile, i (tile.icon)}
      <g class="tile" style:--i={i} transform="translate({tile.x - 30} {tile.y - 30})">
        <g class="float">
          <rect class="card" width="60" height="60" rx="14" />
          <g class="icon" transform="translate(18 18)">
            {#if tile.icon === "chat"}
              <path d="M2 4h20v12H9l-5 4v-4H2z" />
              <path d="M6 9h12M6 12.5h8" />
            {:else if tile.icon === "sheet"}
              <rect x="2" y="3" width="20" height="18" rx="2" />
              <path d="M2 9h20M2 15h20M9 3v18M15 3v18" />
            {:else if tile.icon === "book"}
              <path d="M5 2h13v20H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
              <path d="M7 2v20M10 7h5" />
            {:else if tile.icon === "receipt"}
              <path d="M5 2h14v20l-2.3-1.6L14.3 22 12 20.4 9.7 22l-2.4-1.6L5 22z" />
              <path d="M8 7h8M8 11h8M8 15h5" />
            {:else}
              <rect x="4" y="3" width="16" height="19" rx="2" />
              <path d="M9 3V1.5h6V3M8 9l1.5 1.5L12 8M8 15l1.5 1.5L12 14M14 9.5h3M14 15.5h3" />
            {/if}
          </g>
        </g>
      </g>
    {/each}
    <!-- Curseur : il va d'un outil à l'autre, marque un temps, repart. -->
    <g class="cursor">
      <circle class="ring" r="14" />
      <path d="M0 0 L0 22 L6 16.5 L10.5 26 L14.5 24.2 L10 15 L18 15 Z" />
    </g>
  </svg>
</div>

<style>
  .scene {
    width: 100%;
    max-width: 480px;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }
  .paths path {
    fill: none;
    stroke: var(--c-ink-3);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-dasharray: 1 9;
  }
  .paths .stray {
    stroke: var(--c-line);
  }
  .card {
    fill: var(--c-surface);
    stroke: var(--c-line);
    stroke-width: 1.5;
  }
  .icon {
    fill: none;
    stroke: var(--c-ink-2);
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .float {
    transform-box: fill-box;
    transform-origin: center;
  }
  .cursor path {
    fill: var(--c-ink);
    stroke: var(--c-surface);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .ring {
    fill: none;
    stroke: var(--c-primary);
    stroke-width: 2;
    opacity: 0;
  }
  /* Position de repos (sans animation) : le curseur sur le premier outil. */
  .cursor {
    transform: translate(104px, 96px);
  }
  .scene:global(.playing) .paths path {
    animation: march 1.6s linear infinite;
  }
  .scene:global(.playing) .float {
    animation: bob 5s ease-in-out infinite;
    animation-delay: calc(var(--i) * -1.1s);
  }
  .scene:global(.playing) .tile .card {
    animation: focus 12s ease infinite;
    animation-delay: calc(var(--i) * 2.4s);
  }
  .scene:global(.playing) .cursor {
    animation: hop 12s cubic-bezier(0.6, 0, 0.3, 1) infinite;
  }
  .scene:global(.playing) .ring {
    animation: click 2.4s ease-out infinite;
    animation-delay: 0.5s;
  }
  @keyframes march {
    to {
      stroke-dashoffset: -20;
    }
  }
  @keyframes bob {
    50% {
      transform: translateY(-6px) rotate(-2deg);
    }
  }
  @keyframes focus {
    0%,
    16% {
      stroke: var(--c-primary);
      stroke-width: 2.5;
    }
    20%,
    100% {
      stroke: var(--c-line);
      stroke-width: 1.5;
    }
  }
  /* Cinq arrêts de 2,4 s : 1,2 s de trajet, 1,2 s sur l'outil. */
  @keyframes hop {
    0%,
    10% {
      transform: translate(104px, 96px);
    }
    20%,
    30% {
      transform: translate(274px, 64px);
    }
    40%,
    50% {
      transform: translate(410px, 152px);
    }
    60%,
    70% {
      transform: translate(330px, 272px);
    }
    80%,
    90% {
      transform: translate(140px, 248px);
    }
    100% {
      transform: translate(104px, 96px);
    }
  }
  @keyframes click {
    0% {
      opacity: 0.9;
      r: 4;
    }
    40%,
    100% {
      opacity: 0;
      r: 20;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .scene:global(.playing) * {
      animation: none !important;
    }
  }
</style>
