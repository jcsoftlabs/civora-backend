<!--
  L'application des membres (site commercial, SOC-12) : trois téléphones en éventail sur fond pétrole profond,
  avec les vraies captures de l'app (jeu de démonstration, `apps/mobile/scripts/screenshots.sh`). Les téléphones
  s'ouvrent en éventail à l'arrivée de la section ; immobiles si les animations sont réduites.
-->
<script lang="ts">
  import { translator, type MessageKey } from "$lib/i18n";
  import { reveal } from "./reveal";

  let { locale }: { locale: "fr" | "ht" } = $props();
  const t = $derived(translator(locale));
  const tk = (k: string) => t(k as MessageKey);
  const PHONES = ["act", "wallet", "news"] as const;
</script>

<section id="application" class="app" aria-labelledby="app-title">
  <div class="wrap grid">
    <div class="text">
      <h2 id="app-title">{t("mk.app.title")}</h2>
      <p class="lead">{t("mk.app.lead")}</p>
      <ul>
        {#each [1, 2, 3, 4] as i (i)}<li>{tk(`mk.app.b${i}`)}</li>{/each}
      </ul>
      <p class="soon"><span class="dot" aria-hidden="true"></span>{t("mk.app.soon")}</p>
    </div>
    <div class="phones" use:reveal={0.3}>
      {#each PHONES as p, i (p)}
        <figure class="phone p{i}">
          <img
            src="/marketing/{locale}/app-{p}.jpg"
            alt={tk(`mk.app.shot.${p}`)}
            width="672"
            height="1382"
            loading="lazy"
            decoding="async"
          />
        </figure>
      {/each}
    </div>
  </div>
</section>

<style>
  .app {
    padding: var(--s-24) 0;
    background: var(--c-primary-deep);
    color: var(--c-paper);
    overflow: hidden;
  }
  .wrap {
    width: min(1200px, 100% - 2 * var(--s-6));
    margin-inline: auto;
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    gap: var(--s-14);
    align-items: center;
  }
  h2 {
    margin: 0 0 var(--s-4);
    font: 600 var(--fs-40) / 1.1 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .lead {
    margin: 0 0 var(--s-6);
    font-size: var(--fs-19);
    line-height: 1.5;
    color: rgb(243 240 234 / 0.82);
  }
  ul {
    margin: 0 0 var(--s-8);
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }
  li {
    position: relative;
    padding-left: var(--s-6);
    font-size: var(--fs-16);
    line-height: 1.5;
  }
  /* Puce : petite pastille ambre, comme la pastille « cotisation réglée » de la carte. */
  li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.45em;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--c-accent);
  }
  .soon {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    margin: 0;
    padding: var(--s-2) var(--s-4);
    border: 1px solid rgb(243 240 234 / 0.3);
    border-radius: var(--r-pill);
    font: 600 var(--fs-14) / 1.3 var(--font-ui);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c-accent);
  }
  .phones {
    position: relative;
    height: 620px;
  }
  .phone {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 250px;
    margin: 0;
    padding: 8px;
    border-radius: 40px;
    background: var(--c-ink);
    box-shadow: 0 30px 60px -30px rgb(0 0 0 / 0.6);
    transition: transform 0.9s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .phone img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 32px;
  }
  /* Position finale : éventail, le téléphone du milieu devant et plus haut. */
  .p0 {
    transform: translate(-112%, -46%) rotate(-8deg);
  }
  .p1 {
    z-index: 2;
    transform: translate(-50%, -54%);
  }
  .p2 {
    transform: translate(12%, -46%) rotate(8deg);
  }
  /* Avant l'arrivée : les trois téléphones empilés, puis ils s'ouvrent en éventail. */
  .phones:global(.reveal:not(.in)) .phone {
    transform: translate(-50%, -48%) rotate(0deg) scale(0.94);
  }
  @media (max-width: 1080px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 720px) {
    .wrap {
      width: calc(100% - 2 * var(--s-4));
    }
    h2 {
      font-size: var(--fs-32);
    }
    .phones {
      height: 470px;
    }
    .phone {
      width: 190px;
      padding: 6px;
      border-radius: 32px;
    }
    .phone img {
      border-radius: 26px;
    }
    .p0 {
      transform: translate(-96%, -46%) rotate(-8deg);
    }
    .p2 {
      transform: translate(-4%, -46%) rotate(8deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .phone {
      transition: none;
    }
    .phones:global(.reveal:not(.in)) .p0 {
      transform: translate(-112%, -46%) rotate(-8deg);
    }
    .phones:global(.reveal:not(.in)) .p1 {
      transform: translate(-50%, -54%);
    }
    .phones:global(.reveal:not(.in)) .p2 {
      transform: translate(12%, -46%) rotate(8deg);
    }
  }
</style>
