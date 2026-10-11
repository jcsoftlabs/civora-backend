<!--
  Carte de membre : objet signature (skill ui-design), inspirée des documents de sécurité : rosace guillochée
  ton sur ton coupée par le bord, micro-texte au nom du parti, filet intérieur, numéro frappé, pastille de l'année,
  QR code de vérification (ADH-11). Deux formats : carte (horizontale) ou badge (vertical, fente du cordon).
  Couleur principale du parti pour le fond, seconde couleur (facultative) pour le disque et la pastille.
  Une seule animation : le reflet passe quand `shineKey` change ; aucune si les animations sont réduites.
-->
<script lang="ts">
  import { luminance, partyTheme, secondaryTheme } from "../theme.js";
  import QrCode from "./QrCode.svelte";

  interface Props {
    partyName: string;
    brandColor: string;
    secondaryColor?: string | null;
    memberName: string;
    memberNumber: string;
    location: string;
    year?: string;
    logoUrl?: string | null;
    /** Lien de vérification signé ; sans lien, pas de QR. */
    verifyUrl?: string | null;
    orientation?: "horizontal" | "vertical";
    labels: { card: string; number: string; member?: string; qr?: string };
    /** Change pour relancer le reflet. */
    shineKey?: string;
  }
  let {
    partyName,
    brandColor,
    secondaryColor = null,
    memberName,
    memberNumber,
    location,
    year = String(new Date().getFullYear()),
    logoUrl = null,
    verifyUrl = null,
    orientation = "horizontal",
    labels,
    shineKey = "",
  }: Props = $props();

  const theme = $derived(partyTheme(brandColor));
  const second = $derived(secondaryTheme(secondaryColor));
  /** Seconde couleur très claire (blanc, jaune pâle) : en grand aplat translucide, elle délaverait le fond. */
  const lightSecond = $derived(!!second && luminance(second["--c-secondary"]) > 0.6);
  const initials = $derived(
    partyName
      .split(/\s+/)
      .filter((w) => w.length > 2 || /^[A-Z]/.test(w))
      .slice(0, 3)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join(""),
  );

  /** Rosace guillochée : hypotrochoïdes superposées (le motif des billets). */
  function hypotrochoid(R: number, r: number, d: number, steps = 1400): string {
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    const turns = r / gcd(R, r);
    let path = "";
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 2 * Math.PI * turns;
      const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
      const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
      path += `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    return `${path}Z`;
  }
  const ROSETTE = [hypotrochoid(100, 36, 62), hypotrochoid(100, 36, 44), hypotrochoid(90, 30, 30)];
  const micro = $derived(`${partyName}  `.repeat(12));
  const vertical = $derived(orientation === "vertical");
</script>

<figure
  class="card"
  class:vertical
  class:has-second={!!second}
  class:light-second={lightSecond}
  style:--card-deep={theme["--c-primary-deep"]}
  style:--card-main={theme["--c-primary"]}
  style:--card-second={second?.["--c-secondary"] ?? null}
  style:--card-on-second={second?.["--c-on-secondary"] ?? null}
  aria-label="{labels.card} {partyName}, {memberName}, {labels.number} {memberNumber}"
>
  <span class="disc" aria-hidden="true"></span>
  <svg class="rosette" viewBox="-170 -170 340 340" aria-hidden="true">
    {#each ROSETTE as d, i (i)}<path {d} />{/each}
  </svg>
  <span class="frame" aria-hidden="true"></span>
  {#if vertical}<span class="slot" aria-hidden="true"></span>{/if}
  <span class="micro" aria-hidden="true">{micro}</span>
  {#key shineKey}<span class="shine" aria-hidden="true"></span>{/key}

  <header>
    {#if logoUrl}
      <img src={logoUrl} alt="" class="logo" />
    {:else}
      <span class="seal" aria-hidden="true">{initials || "•"}</span>
    {/if}
    <span class="party">{partyName}</span>
    <span class="year" aria-label="{labels.member ?? labels.card} {year}">{year}</span>
  </header>

  <div class="number">
    <span class="label">{labels.number}</span>
    <span class="value">{memberNumber}</span>
  </div>

  <footer>
    <div class="who">
      <span class="name">{memberName}</span>
      <span class="place">{location}</span>
    </div>
    {#if verifyUrl}
      <QrCode value={verifyUrl} label={labels.qr ?? labels.card} size={vertical ? 92 : 62} />
    {/if}
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
    padding: 22px 24px 20px;
    display: grid;
    grid-template-rows: auto 1fr auto;
    row-gap: var(--s-2);
    border-radius: 18px;
    color: var(--c-card-cream);
    background: var(--card-deep);
    box-shadow:
      var(--shadow-object),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    transform: rotate(-2.5deg);
    transition: background-color var(--dur-base);
  }
  /* Badge : format vertical 54 × 86 mm, fente du cordon en haut, QR en grand. */
  .card.vertical {
    max-width: 240px;
    aspect-ratio: 0.628;
    padding: 46px 20px 22px;
    transform: rotate(2deg);
    text-align: center;
  }
  .slot {
    position: absolute;
    top: 14px;
    left: 50%;
    width: 46px;
    height: 9px;
    transform: translateX(-50%);
    border-radius: var(--r-pill);
    background: var(--c-paper);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.45);
  }

  /* Volume : grand disque de la seconde couleur du parti (sinon sa couleur vive), en aplat, coupé par le bord. */
  .disc {
    position: absolute;
    z-index: -2;
    right: -28%;
    bottom: -55%;
    width: 95%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--card-main);
    opacity: 0.4;
  }
  .has-second .disc {
    background: var(--card-second);
    opacity: 0.55;
  }
  .light-second .disc {
    opacity: 0.16;
  }
  .vertical .disc {
    right: -45%;
    bottom: -18%;
    width: 150%;
  }
  .rosette {
    position: absolute;
    z-index: -1;
    right: -24%;
    bottom: -46%;
    width: 88%;
    aspect-ratio: 1;
    opacity: 0.32;
  }
  .vertical .rosette {
    right: -40%;
    bottom: -10%;
    width: 140%;
  }
  .rosette path {
    fill: none;
    stroke: var(--c-card-cream);
    stroke-width: 0.45;
  }
  .rosette path:nth-child(2) {
    opacity: 0.7;
  }
  .rosette path:nth-child(3) {
    opacity: 0.5;
  }
  .frame {
    position: absolute;
    inset: 8px;
    z-index: -1;
    border-radius: 12px;
    pointer-events: none;
    border: 0.5px solid color-mix(in srgb, var(--c-card-cream) 28%, transparent);
  }
  .micro {
    position: absolute;
    left: 14px;
    right: 14px;
    bottom: 9px;
    z-index: -1;
    overflow: hidden;
    white-space: nowrap;
    font: 500 4.5px / 1 var(--font-ui);
    letter-spacing: 0.08em;
    color: var(--c-card-cream);
    opacity: 0.4;
  }
  .shine {
    position: absolute;
    inset: -40% auto -40% -60%;
    width: 38%;
    z-index: 1;
    pointer-events: none;
    background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.24), transparent);
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
    min-width: 0;
  }
  .vertical header {
    flex-direction: column;
    gap: var(--s-2);
  }
  .seal,
  .logo {
    width: 38px;
    height: 38px;
    border-radius: var(--r-pill);
    flex: none;
  }
  .vertical .seal,
  .vertical .logo {
    width: 46px;
    height: 46px;
  }
  .seal {
    display: grid;
    place-items: center;
    border: 1.5px solid currentColor;
    outline: 0.5px solid currentColor;
    outline-offset: 2px;
    font: 800 var(--fs-13) / 1 var(--font-display);
    letter-spacing: 0.02em;
  }
  .logo {
    object-fit: cover;
    background: var(--c-surface);
  }
  .party {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 700 var(--fs-16) / 1.15 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .vertical .party {
    flex: none;
    max-width: 100%;
    white-space: normal;
  }
  .year {
    flex: none;
    padding: 4px 9px;
    border-radius: var(--r-pill);
    background: var(--c-accent-bright);
    color: var(--c-on-accent);
    font: 700 var(--fs-12) / 1 var(--font-ui);
    font-variant-numeric: tabular-nums;
  }
  .has-second .year {
    background: var(--card-second);
    color: var(--card-on-second);
  }
  .vertical .year {
    position: absolute;
    top: 26px;
    right: 18px;
  }
  .number {
    align-self: center;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .label {
    font: 500 var(--fs-12) / 1 var(--font-ui);
    opacity: 0.72;
  }
  /* Numéro frappé : ombre sombre dessous, lumière dessus. */
  .value {
    font: 800 var(--fs-40) / 1 var(--font-display);
    letter-spacing: 0.04em;
    font-variant-numeric: tabular-nums;
    text-shadow:
      0 1px 0 rgba(0, 0, 0, 0.45),
      0 -1px 0 rgba(255, 255, 255, 0.14);
  }
  .vertical .value {
    font-size: var(--fs-32);
  }
  footer {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--s-3);
    padding-bottom: 6px;
  }
  .vertical footer {
    flex-direction: column-reverse;
    align-items: center;
    gap: var(--s-3);
    padding-bottom: 8px;
  }
  .who {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .name {
    font: 700 var(--fs-16) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .place {
    font: 400 var(--fs-12) / 1.3 var(--font-ui);
    opacity: 0.78;
  }
  .card :global(.qr) {
    border-radius: 6px;
    box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.2);
  }
  @media (prefers-reduced-motion: reduce) {
    .shine {
      display: none;
    }
  }
</style>
