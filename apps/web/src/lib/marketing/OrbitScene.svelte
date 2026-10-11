<!--
  Scène « tout au même endroit » (site commercial, SOC-12), sur le modèle de qomon.com : le sceau civora au
  centre, les modules en orbite sur un cercle en pointillé ; ils tournent lentement en restant droits, une onde
  part du centre. Décorative : les modules sont décrits plus bas. Tourne seulement à l'écran ; immobile si les
  animations sont réduites.
-->
<script lang="ts">
  import { translator, type MessageKey } from "$lib/i18n";
  import { inview } from "./inview";

  let { locale }: { locale: "fr" | "ht" } = $props();
  const t = $derived(translator(locale));
  const tk = (k: string) => t(k as MessageKey);
  const MODULES = ["members", "dues", "events", "votes", "training", "communication", "organs", "dashboard"] as const;
</script>

<div class="orbit" aria-hidden="true" use:inview>
  <span class="wave"></span>
  <span class="wave late"></span>
  <span class="seal"><span class="mark"></span></span>
  <div class="ring">
    {#each MODULES as m, i (m)}
      <div class="slot" style:--a="{(360 / MODULES.length) * i}deg">
        <div class="upright">
          <span class="tile">
            <svg viewBox="0 0 24 24">
              {#if m === "members"}
                <circle cx="9" cy="8" r="3.2" />
                <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
                <circle cx="17" cy="9" r="2.4" />
                <path d="M15.6 14.2c2.4-.3 4.3 1.3 4.9 4.3" />
              {:else if m === "dues"}
                <ellipse cx="10" cy="7" rx="6" ry="2.6" />
                <path d="M4 7v4c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6V7" />
                <path d="M8 15.6c.6 1.2 3 2.1 6 2.1 3.3 0 6-1.2 6-2.6v-4c0-1.1-1.6-2-4-2.4" />
              {:else if m === "events"}
                <path d="M3.5 7.5h17v3a1.8 1.8 0 0 0 0 3.6v3.4h-17v-3.4a1.8 1.8 0 0 0 0-3.6z" />
                <path d="M9 8v1.5M9 11.5v1M9 14.5V16" />
              {:else if m === "votes"}
                <path d="M4 11.5h16v8.5H4z" />
                <path d="M8.5 11.5V4h7v7.5" />
                <path d="M10.5 7.5l1.3 1.3 2.2-2.6M7 14.5h10" />
              {:else if m === "training"}
                <path d="M12 6.5c-2-1.6-4.8-2-8-1.6v12.6c3.2-.4 6 0 8 1.6 2-1.6 4.8-2 8-1.6V4.9c-3.2-.4-6 0-8 1.6z" />
                <path d="M12 6.5v12.6" />
              {:else if m === "communication"}
                <path d="M4 10v4h3l6 4V6L7 10z" />
                <path d="M16.5 9.5a3.5 3.5 0 0 1 0 5M7 14l1.5 5h2.5l-1.3-4.3" />
              {:else if m === "organs"}
                <rect x="9" y="3.5" width="6" height="4.5" rx="1.2" />
                <rect x="3" y="15.5" width="5" height="4.5" rx="1.2" />
                <rect x="9.5" y="15.5" width="5" height="4.5" rx="1.2" />
                <rect x="16" y="15.5" width="5" height="4.5" rx="1.2" />
                <path d="M12 8v4M5.5 15.5V12h13v3.5M12 12v3.5" />
              {:else}
                <path d="M4 20h16" />
                <rect x="5.5" y="12" width="3" height="5.5" rx="1" />
                <rect x="10.5" y="8" width="3" height="9.5" rx="1" />
                <rect x="15.5" y="4.5" width="3" height="13" rx="1" />
              {/if}
            </svg>
          </span>
          <span class="name">{tk(`admin.nav.${m}`)}</span>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .orbit {
    --r: 150px;
    position: relative;
    width: calc(var(--r) * 2 + 120px);
    max-width: 100%;
    aspect-ratio: 1;
    margin-inline: auto;
  }
  /* Cercle en pointillé, tracé par une bordure. */
  .orbit::before {
    content: "";
    position: absolute;
    inset: 60px;
    border: 2px dashed var(--c-line);
    border-radius: 50%;
  }
  .seal {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 84px;
    height: 84px;
    margin: -42px 0 0 -42px;
    display: grid;
    place-items: center;
    border-radius: 24px;
    background: var(--c-primary);
    box-shadow: 0 0 0 10px var(--c-primary-tint);
  }
  /* La marque civora : une carte de membre stylisée. */
  .mark {
    width: 38px;
    height: 26px;
    border: 3px solid var(--c-on-primary);
    border-radius: 6px;
    position: relative;
  }
  .mark::after {
    content: "";
    position: absolute;
    left: 5px;
    right: 12px;
    bottom: 4px;
    height: 3px;
    border-radius: 2px;
    background: var(--c-accent);
  }
  .wave {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 84px;
    height: 84px;
    margin: -42px 0 0 -42px;
    border-radius: 50%;
    border: 2px solid var(--c-primary);
    opacity: 0;
  }
  .ring {
    position: absolute;
    inset: 0;
  }
  .slot {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 0;
    height: 0;
    transform: rotate(var(--a)) translateY(calc(var(--r) * -1)) rotate(calc(var(--a) * -1));
  }
  .upright {
    position: absolute;
    left: 0;
    top: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    transform: translate(-50%, -26px);
  }
  .tile {
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    border: 1px solid var(--c-line);
    border-radius: 14px;
    background: var(--c-surface);
    box-shadow: 0 6px 16px -10px rgb(28 27 25 / 0.35);
  }
  .tile svg {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: var(--c-primary-deep);
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .name {
    padding: 2px 8px;
    border-radius: var(--r-pill);
    background: var(--c-paper);
    font: 600 var(--fs-12) / 1.3 var(--font-ui);
    color: var(--c-ink-2);
    white-space: nowrap;
  }
  .orbit:global(.playing) .ring {
    animation: spin 60s linear infinite;
  }
  /* Chaque module tourne en sens inverse : il reste droit pendant l'orbite. */
  .orbit:global(.playing) .upright {
    animation: counter 60s linear infinite;
  }
  .orbit:global(.playing) .wave {
    animation: wave 3.2s ease-out infinite;
  }
  .orbit:global(.playing) .wave.late {
    animation-delay: 1.6s;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes counter {
    from {
      transform: translate(-50%, -26px) rotate(0deg);
    }
    to {
      transform: translate(-50%, -26px) rotate(-360deg);
    }
  }
  @keyframes wave {
    0% {
      opacity: 0.6;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(2.6);
    }
  }
  @media (max-width: 520px) {
    .orbit {
      --r: 112px;
    }
    .name {
      display: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .orbit:global(.playing) * {
      animation: none !important;
    }
  }
</style>
