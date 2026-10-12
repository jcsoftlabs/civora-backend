<!--
  Carte de membre : objet signature (skill ui-design), inspirée des documents de sécurité : rosace guillochée
  ton sur ton coupée par le bord, micro-texte au nom du parti, filet intérieur, numéro frappé, pastille de l'année,
  QR code de vérification (ADH-11). Deux formats : carte (horizontale) ou badge (vertical, fente du cordon).
  Couleur principale du parti pour le fond, seconde couleur (facultative) pour le disque et la pastille.
  Une seule animation : le reflet passe quand `shineKey` change ; aucune si les animations sont réduites.
-->
<script lang="ts">
  import { cardBackground, discOpacity, secondaryTheme } from "../theme.js";
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
    /**
     * Modèle du parti (ADH-13) : fond, couleurs, motif, champs. Absent : la carte par défaut, inchangée.
     * Les valeurs suivent cardDesign de @civora/shared.
     */
    design?: {
      background?: { kind?: "color" | "image"; color?: string | null; veil?: number };
      textColor?: string | null;
      accentColor?: string | null;
      pattern?: "rosette" | "waves" | "none";
      showLogo?: boolean;
      qrSide?: "front" | "back";
    } | null;
    backgroundUrl?: string | null;
    photoUrl?: string | null;
    /** Intitulé au-dessus du numéro (« Carte de membre »). */
    title?: string | null;
    /** Lignes sous le nom : statut, ancienneté. */
    details?: string[];
    /** Face montrée : recto (défaut) ou verso. */
    side?: "front" | "back";
    back?: { text?: string | null; signatory?: { name: string; role: string; signatureUrl?: string | null } | null };
    showPhoto?: boolean;
    showNumber?: boolean;
    showLocation?: boolean;
    /** Pastille de validité ; null : masquée. */
    validity?: string | null;
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
    design = null,
    backgroundUrl = null,
    photoUrl = null,
    title = null,
    details = [],
    side = "front",
    back = {},
    showPhoto = false,
    showNumber = true,
    showLocation = true,
    validity = undefined,
  }: Props = $props();
  const pill = $derived(validity === undefined ? year : validity);
  const pattern = $derived(design?.pattern ?? "rosette");
  const qrBack = $derived(design?.qrSide === "back");
  const showLogo = $derived(design?.showLogo ?? true);
  const bgOverride = $derived(
    design?.background?.kind !== "image" && design?.background?.color ? design.background.color : null,
  );

  const bg = $derived(cardBackground(bgOverride ?? brandColor));
  const second = $derived(secondaryTheme(secondaryColor));
  /** Opacité du disque : la plus forte qui laisse le texte lisible par-dessus. */
  const discAlpha = $derived(second ? discOpacity(bg.background, bg.text, second["--c-secondary"]) : 0.4);
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
  /** Ondes fines et serrées (motif « ondes »), comme sur un billet de banque. */
  const WAVES = Array.from({ length: 14 }, (_, i) => {
    let d = "";
    for (let x = 0; x <= 340; x += 6) {
      const y = 24 + i * 13 + Math.sin((x / 340) * Math.PI * 3 + i * 0.5) * 9;
      d += `${x ? "L" : "M"}${x} ${y.toFixed(1)}`;
    }
    return d;
  });
  const ROSETTE = [hypotrochoid(100, 36, 62), hypotrochoid(100, 36, 44), hypotrochoid(90, 30, 30)];
  const micro = $derived(`${partyName}  `.repeat(12));
  const vertical = $derived(orientation === "vertical");
</script>

<figure
  class="card"
  class:vertical
  class:has-second={!!second}
  style:--card-deep={bg.background}
  style:--card-main={bg.depth}
  style:--card-text={design?.textColor ?? bg.text}
  style:--card-accent={design?.accentColor ?? null}
  class:back={side === "back"}
  style:--disc-alpha={discAlpha}
  class:light-bg={!bg.dark}
  style:--card-second={second?.["--c-secondary"] ?? null}
  style:--card-on-second={second?.["--c-on-secondary"] ?? null}
  aria-label="{labels.card} {partyName}, {memberName}, {labels.number} {memberNumber}"
>
  {#if design?.background?.kind === "image" && backgroundUrl}
    <img class="bg-image" src={backgroundUrl} alt="" aria-hidden="true" />
    <span class="veil" style:opacity={design.background.veil ?? 0.35} aria-hidden="true"></span>
  {/if}
  <span class="disc" aria-hidden="true"></span>
  {#if pattern === "rosette"}
    <svg class="rosette" viewBox="-170 -170 340 340" aria-hidden="true">
      {#each ROSETTE as d, i (i)}<path {d} />{/each}
    </svg>
  {:else if pattern === "waves"}
    <svg class="waves" viewBox="0 0 340 214" preserveAspectRatio="none" aria-hidden="true">
      {#each WAVES as d, i (i)}<path {d} />{/each}
    </svg>
  {/if}
  <span class="frame" aria-hidden="true"></span>
  {#if vertical}<span class="slot" aria-hidden="true"></span>{/if}
  {#if side === "front"}<span class="micro" aria-hidden="true">{micro}</span>{/if}
  {#key shineKey}<span class="shine" aria-hidden="true"></span>{/key}

  {#if side === "back"}
    <div class="back-body">
      <p class="back-party">{partyName}</p>
      {#if back.text}<p class="back-text">{back.text}</p>{/if}
      <div class="back-foot">
        {#if back.signatory}
          <div class="signatory">
            {#if back.signatory.signatureUrl}<img src={back.signatory.signatureUrl} alt="" class="signature" />{/if}
            <span class="sig-line" aria-hidden="true"></span>
            <span class="sig-name">{back.signatory.name}</span>
            <span class="sig-role">{back.signatory.role}</span>
          </div>
        {/if}
        {#if verifyUrl && qrBack}
          <QrCode value={verifyUrl} label={labels.qr ?? labels.card} size={vertical ? 92 : 70} />
        {/if}
      </div>
    </div>
  {:else}
    <header>
      {#if logoUrl && showLogo}
        <img src={logoUrl} alt="" class="logo" />
      {:else}
        <span class="seal" aria-hidden="true">{initials || "•"}</span>
      {/if}
      <span class="party">{partyName}</span>
      {#if pill}<span class="year" aria-label="{labels.member ?? labels.card} {pill}">{pill}</span>{/if}
    </header>

    <div class="middle">
      <div class="number">
        <span class="label">{title ?? labels.number}</span>
        {#if showNumber}<span class="value">{memberNumber}</span>{/if}
      </div>
      {#if showPhoto}
        <span class="photo">
          {#if photoUrl}<img src={photoUrl} alt="" />{/if}
        </span>
      {/if}
    </div>

    <footer>
      <div class="who">
        <span class="name">{memberName}</span>
        {#if showLocation && location}<span class="place">{location}</span>{/if}
        {#each details as line, i (i)}<span class="place">{line}</span>{/each}
      </div>
      {#if verifyUrl && !qrBack}
        <QrCode value={verifyUrl} label={labels.qr ?? labels.card} size={vertical ? 92 : 62} />
      {/if}
    </footer>
  {/if}
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
    color: var(--card-text);
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

  .bg-image {
    position: absolute;
    inset: 0;
    z-index: -4;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .veil {
    position: absolute;
    inset: 0;
    z-index: -3;
    background: #000;
  }
  .waves {
    position: absolute;
    inset: 0;
    z-index: -1;
    width: 100%;
    height: 100%;
    opacity: 0.28;
  }
  .waves path {
    fill: none;
    stroke: var(--card-text);
    stroke-width: 0.6;
  }
  .middle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
  }
  .vertical .middle {
    flex-direction: column-reverse;
  }
  .photo {
    flex: none;
    width: 64px;
    height: 80px;
    border-radius: 8px;
    overflow: hidden;
    background: color-mix(in srgb, var(--card-text) 18%, transparent);
  }
  .photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .back-body {
    grid-row: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    min-height: 0;
  }
  .back-party {
    margin: 0;
    font: 600 var(--fs-14) / 1.2 var(--font-display);
  }
  .back-text {
    margin: 0;
    font: 400 var(--fs-12) / 1.45 var(--font-ui);
    opacity: 0.9;
    overflow: hidden;
  }
  .back-foot {
    margin-top: auto;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--s-3);
  }
  .signatory {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .signature {
    max-width: 120px;
    max-height: 36px;
    object-fit: contain;
    filter: brightness(1.6) grayscale(1);
  }
  .sig-line {
    width: 130px;
    height: 0;
    border-top: 0.5px solid var(--card-text);
  }
  .sig-name {
    font: 600 var(--fs-12) / 1.2 var(--font-ui);
  }
  .sig-role {
    font: 400 var(--fs-12) / 1.2 var(--font-ui);
    opacity: 0.78;
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
  /* Opacité calculée (discOpacity) : le texte reste lisible là où il passe sur le disque. */
  .has-second .disc {
    background: var(--card-second);
    opacity: var(--disc-alpha);
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
    stroke: var(--card-text);
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
    border: 0.5px solid color-mix(in srgb, var(--card-text) 28%, transparent);
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
    color: var(--card-text);
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
    font: 600 var(--fs-13) / 1.12 var(--font-display);
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
    font: 600 var(--fs-16) / 1.15 var(--font-display);
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
  .card[style*="--card-accent"] .year {
    background: var(--card-accent);
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
    font: 600 var(--fs-40) / 1.12 var(--font-display);
    letter-spacing: 0.04em;
    font-variant-numeric: tabular-nums;
    text-shadow:
      0 1px 0 rgba(0, 0, 0, 0.45),
      0 -1px 0 rgba(255, 255, 255, 0.14);
  }
  /* Sur une couleur claire, le relief s'inverse : lumière dessous, ombre légère dessus. */
  .light-bg .value {
    text-shadow:
      0 1px 0 rgba(255, 255, 255, 0.5),
      0 -1px 0 rgba(0, 0, 0, 0.12);
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
    font: 600 var(--fs-16) / 1.2 var(--font-display);
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
