<!--
  « Pensé pour Haïti et sa diaspora » (SOC-12) : fond pétrole profond, rosace guillochée de la carte de membre en
  filigrane, et pour chaque point un petit objet qui le montre : le téléphone hors ligne qui garde les présences,
  les deux langues côte à côte, le reçu en gourdes et en dollars, le fil des zones jusqu'à la section communale.
-->
<script lang="ts">
  import { translator, type MessageKey } from "$lib/i18n";

  let { locale }: { locale: "fr" | "ht" } = $props();
  const t = $derived(translator(locale));
  const tk = (k: string) => t(k as MessageKey);

  /** Rosace guillochée (hypotrochoïdes), le motif de sécurité des billets et de la carte de membre. */
  function hypotrochoid(R: number, r: number, d: number, steps = 1600): string {
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    const turns = r / gcd(R, r);
    let p = "";
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * 2 * Math.PI * turns;
      const x = (R - r) * Math.cos(a) + d * Math.cos(((R - r) / r) * a);
      const y = (R - r) * Math.sin(a) - d * Math.sin(((R - r) / r) * a);
      p += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return `${p}Z`;
  }
  const ROSETTE = [
    hypotrochoid(100, 36, 62),
    hypotrochoid(100, 36, 44),
    hypotrochoid(90, 30, 30),
    hypotrochoid(80, 28, 52),
  ];
  const ZONES = ["mk.field.v.z1", "mk.field.v.z2", "mk.field.v.z3", "mk.field.v.z4"];
</script>

<section class="field" aria-labelledby="field-title">
  <svg class="rosette" viewBox="-170 -170 340 340" aria-hidden="true">
    {#each ROSETTE as d, i (i)}<path {d} />{/each}
  </svg>
  <div class="wrap">
    <h2 id="field-title">{t("mk.field.title")}</h2>
    <div class="grid">
      <div class="item">
        <!-- Téléphone hors ligne : les présences attendent le réseau, le tampon est déjà posé. -->
        <div class="vignette" aria-hidden="true">
          <div class="phone">
            <p class="phone-bar"><span class="nosignal"></span>{t("mk.field.v.offline")}</p>
            {#each ["9:02 AM", "9:05 AM", "9:11 AM"] as time (time)}
              <p class="scan"><span class="dot"></span>{t("mk.field.v.scan")}<span class="time">{time}</span></p>
            {/each}
            <p class="queue">{t("mk.field.v.queue")}</p>
            <span class="stamp">{t("mk.hero.stamp")}</span>
          </div>
        </div>
        <h3>{t("mk.field.offline")}</h3>
        <p>{t("mk.field.offline.text")}</p>
      </div>

      <div class="item">
        <!-- Deux bulles : le même message en français et en créole. -->
        <div class="vignette bubbles" aria-hidden="true">
          <p class="bubble fr"><span class="tag">FR</span>{t("mk.field.v.fr")}</p>
          <p class="bubble ht"><span class="tag">KR</span>{t("mk.field.v.ht")}</p>
        </div>
        <h3>{t("mk.field.lang")}</h3>
        <p>{t("mk.field.lang.text")}</p>
      </div>

      <div class="item">
        <!-- Reçu perforé : la cotisation en gourdes, celle de la diaspora en dollars, le numéro de reçu. -->
        <div class="vignette" aria-hidden="true">
          <div class="receipt">
            <p class="r-row"><span>{t("mk.field.v.dues")}</span><strong>250 HTG</strong></p>
            <p class="r-row"><span>{t("mk.field.v.diaspora")}</span><strong>10 USD</strong></p>
            <p class="r-no">{t("mk.field.v.receipt")} 2026-001913</p>
          </div>
        </div>
        <h3>{t("mk.field.pay")}</h3>
        <p>{t("mk.field.pay.text")}</p>
      </div>

      <div class="item">
        <!-- Le fil des zones : chaque responsable ne voit que la sienne et ce qu'elle contient. -->
        <div class="vignette" aria-hidden="true">
          <ol class="tree">
            {#each ZONES as z, i (z)}
              <li style:--depth={i}><span class="pin"></span>{tk(z)}</li>
            {/each}
          </ol>
        </div>
        <h3>{t("mk.field.map")}</h3>
        <p>{t("mk.field.map.text")}</p>
      </div>
    </div>
  </div>
</section>

<style>
  .field {
    position: relative;
    overflow: hidden;
    padding: var(--s-24) 0;
    background: var(--c-primary-deep);
    color: var(--c-surface);
  }
  .rosette {
    position: absolute;
    right: -160px;
    top: -140px;
    width: 640px;
    height: 640px;
    fill: none;
    stroke: var(--c-accent);
    stroke-width: 0.5;
    opacity: 0.16;
    pointer-events: none;
  }
  .wrap {
    position: relative;
    width: min(1200px, 100% - 2 * var(--s-6));
    margin-inline: auto;
  }
  h2 {
    margin: 0;
    font: 600 clamp(30px, 3.6vw, 42px) / 1.12 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--s-8);
    margin-top: var(--s-10);
  }
  h3 {
    margin: var(--s-5) 0 0;
    font: 600 var(--fs-19) / 1.25 var(--font-display);
  }
  .item > p {
    margin: var(--s-2) 0 0;
    line-height: 1.6;
    color: color-mix(in srgb, var(--c-surface) 76%, transparent);
  }
  .vignette {
    height: 168px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-lg);
    background: rgb(255 255 255 / 5%);
    border: 1px solid rgb(255 255 255 / 9%);
  }
  .vignette p {
    margin: 0;
  }

  /* Téléphone */
  .phone {
    position: relative;
    width: 150px;
    padding: var(--s-2) var(--s-3) var(--s-3);
    border: 5px solid var(--c-ink);
    border-radius: 18px;
    background: var(--c-surface);
    color: var(--c-ink);
    font-size: 11px;
    transform: rotate(-3deg);
  }
  .phone-bar {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 6px !important;
    font-weight: 600;
    color: var(--c-warning-text);
  }
  .nosignal {
    position: relative;
    width: 10px;
    height: 8px;
    border-left: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
  }
  .nosignal::after {
    content: "";
    position: absolute;
    left: -3px;
    top: 3px;
    width: 14px;
    height: 2px;
    background: currentColor;
    transform: rotate(-35deg);
  }
  .scan {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 0;
    border-bottom: 1px solid var(--c-line-soft);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--c-warning);
  }
  .time {
    margin-left: auto;
    color: var(--c-ink-2);
    font-variant-numeric: tabular-nums;
  }
  .queue {
    margin-top: 6px !important;
    font-weight: 600;
  }
  .stamp {
    position: absolute;
    right: -24px;
    top: 4px;
    padding: 2px 6px;
    border: 2px solid var(--c-stamp);
    border-radius: 4px;
    color: var(--c-stamp);
    background: color-mix(in srgb, var(--c-surface) 85%, transparent);
    font: 700 11px / 1 var(--font-display);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    transform: rotate(-14deg);
  }

  /* Bulles */
  .bubbles {
    flex-direction: column;
    align-items: stretch;
    gap: var(--s-2);
    padding: 0 var(--s-5);
  }
  .bubble {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    max-width: 88%;
    padding: 8px 12px;
    border-radius: 14px;
    font-size: var(--fs-13);
    line-height: 1.3;
  }
  .bubble.fr {
    align-self: flex-start;
    background: var(--c-surface);
    color: var(--c-ink);
    border-bottom-left-radius: 4px;
  }
  .bubble.ht {
    align-self: flex-end;
    background: var(--c-accent-bright);
    color: var(--c-on-accent);
    border-bottom-right-radius: 4px;
  }
  .tag {
    flex: none;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgb(0 0 0 / 8%);
    font-size: 10px;
    font-weight: 700;
  }

  /* Reçu perforé */
  .receipt {
    width: 210px;
    padding: var(--s-4) var(--s-4) var(--s-3);
    background: var(--c-card-cream);
    color: var(--c-ink);
    font-size: 12px;
    transform: rotate(2deg);
    -webkit-mask:
      radial-gradient(circle 5px at 50% 0, #0000 98%, #000) top / 14px 51% repeat-x,
      radial-gradient(circle 5px at 50% 100%, #0000 98%, #000) bottom / 14px 51% repeat-x;
    mask:
      radial-gradient(circle 5px at 50% 0, #0000 98%, #000) top / 14px 51% repeat-x,
      radial-gradient(circle 5px at 50% 100%, #0000 98%, #000) bottom / 14px 51% repeat-x;
  }
  .r-row {
    display: flex;
    justify-content: space-between;
    gap: var(--s-2);
    padding: 4px 0;
    border-bottom: 1px dashed rgb(28 27 25 / 25%);
  }
  .r-row strong {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .r-no {
    margin-top: 6px !important;
    color: var(--c-ink-2);
    font-size: 11px;
  }

  /* Fil des zones */
  .tree {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .tree li {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: calc(var(--depth) * 16px);
    padding: 4px 10px;
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 10%);
    font-size: var(--fs-13);
    white-space: nowrap;
  }
  .tree li:last-child {
    background: var(--c-accent-bright);
    color: var(--c-on-accent);
    font-weight: 600;
  }
  .pin {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    border: 2px solid currentColor;
  }

  @media (max-width: 1080px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 620px) {
    .field {
      padding: var(--s-14) 0;
    }
    .wrap {
      width: calc(100% - 2 * var(--s-4));
    }
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .rosette {
      width: 420px;
      height: 420px;
      right: -200px;
    }
  }
</style>
