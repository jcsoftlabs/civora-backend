<!--
  Carte de membre : objet signature (skill ui-design). Fond profond de la couleur du parti, motif de sécurité ondulé,
  numéro en grand, légère inclinaison, reflet métallisé. Une seule animation : le reflet passe quand `shineKey` change
  (par exemple à chaque nouvelle couleur choisie). Aucune animation si la personne les a réduites.
  Textes fournis par l'application (`labels`).
-->
<script lang="ts">
  import { partyTheme } from "../theme.js";

  interface Props {
    partyName: string;
    brandColor: string;
    memberName: string;
    memberNumber: string;
    location: string;
    logoUrl?: string | null;
    labels: { card: string; number: string };
    /** Change pour relancer le reflet. */
    shineKey?: string;
  }
  let {
    partyName,
    brandColor,
    memberName,
    memberNumber,
    location,
    logoUrl = null,
    labels,
    shineKey = "",
  }: Props = $props();

  const theme = $derived(partyTheme(brandColor));
  const initials = $derived(
    partyName
      .split(/\s+/)
      .filter((w) => w.length > 2 || /^[A-Z]/.test(w))
      .slice(0, 3)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join(""),
  );
</script>

<figure
  class="card"
  style:--card-deep={theme["--c-primary-deep"]}
  style:--card-main={theme["--c-primary"]}
  aria-label="{labels.card} {partyName}, {memberName}, {labels.number} {memberNumber}"
>
  <svg class="guilloche" viewBox="0 0 340 214" preserveAspectRatio="none" aria-hidden="true">
    {#each Array.from({ length: 14 }, (_, i) => i) as i (i)}
      <path
        d="M -10 {20 + i * 14} C 60 {6 + i * 14}, 120 {34 + i * 14}, 180 {20 + i * 14} S 290 {6 + i * 14}, 350 {20 +
          i * 14}"
      />
    {/each}
  </svg>
  {#key shineKey}<span class="shine" aria-hidden="true"></span>{/key}

  <header>
    {#if logoUrl}
      <img src={logoUrl} alt="" class="logo" />
    {:else}
      <span class="seal" aria-hidden="true">{initials || "•"}</span>
    {/if}
    <span class="party">{partyName}</span>
  </header>

  <div class="number">
    <span class="label">{labels.number}</span>
    <span class="value">{memberNumber}</span>
  </div>

  <footer>
    <span class="name">{memberName}</span>
    <span class="place">{location}</span>
  </footer>
</figure>

<style>
  .card {
    position: relative;
    margin: 0;
    overflow: hidden;
    isolation: isolate;
    width: 100%;
    max-width: 380px;
    aspect-ratio: 1.586;
    padding: var(--s-5);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    border-radius: var(--r-lg);
    color: var(--c-card-cream);
    background: var(--card-deep);
    box-shadow: var(--shadow-object);
    transform: rotate(-2.5deg);
    transition: background-color var(--dur-base);
  }
  .guilloche {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    opacity: 0.22;
  }
  /* Bande de la couleur vive du parti, comme sur une carte imprimée. */
  .card::before {
    content: "";
    position: absolute;
    z-index: -1;
    right: 0;
    top: 0;
    bottom: 0;
    width: 28%;
    background: var(--card-main);
    opacity: 0.55;
  }
  .guilloche path {
    fill: none;
    stroke: var(--c-card-cream);
    stroke-width: 0.6;
  }
  .shine {
    position: absolute;
    inset: -40% auto -40% -60%;
    width: 40%;
    z-index: 1;
    pointer-events: none;
    background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.28), transparent);
    transform: skewX(-18deg);
    animation: sweep 1.1s var(--ease-stamp) both;
  }
  @keyframes sweep {
    from {
      left: -60%;
    }
    to {
      left: 130%;
    }
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--s-3);
  }
  .seal,
  .logo {
    width: 36px;
    height: 36px;
    border-radius: var(--r-pill);
    flex: none;
  }
  .seal {
    display: grid;
    place-items: center;
    border: 1.5px solid currentColor;
    font: 800 var(--fs-13) / 1 var(--font-display);
    letter-spacing: 0.02em;
  }
  .logo {
    object-fit: cover;
    background: var(--c-surface);
  }
  .party {
    font: 700 var(--fs-16) / 1.15 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .number {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .label {
    font: 500 var(--fs-12) / 1 var(--font-ui);
    opacity: 0.75;
  }
  .value {
    font: 800 var(--fs-40) / 1 var(--font-display);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: var(--s-3);
  }
  .name {
    font: 600 var(--fs-15) / 1.2 var(--font-ui);
  }
  .place {
    font: 400 var(--fs-12) / 1.3 var(--font-ui);
    opacity: 0.8;
    text-align: right;
    max-width: 55%;
  }
  @media (prefers-reduced-motion: reduce) {
    .shine {
      display: none;
    }
  }
</style>
