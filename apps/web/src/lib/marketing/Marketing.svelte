<!--
  Site commercial (SOC-12), premier contact avec les organisations : promesse et capture réelle du produit,
  ce que civora remplace, un bloc par module avec sa capture, publics, terrain haïtien, sécurité, tarifs,
  questions, demande de démonstration. Sur le modèle de qomon.com, à l'identité civora : la carte de membre
  posée sur le tableau de bord et le tampon « Présent » (la seule animation de la page).
  Les captures viennent du jeu de démonstration (`pnpm db:demo`, puis `pnpm --filter @civora/web screenshots`).
-->
<script lang="ts">
  import { MemberCard } from "@civora/ui";
  import { resolve } from "$app/paths";
  import { translator, type MessageKey } from "$lib/i18n";
  import Audiences from "./Audiences.svelte";
  import DemoForm from "./DemoForm.svelte";
  import FieldSection from "./FieldSection.svelte";
  import Faq from "./Faq.svelte";
  import Pricing from "./Pricing.svelte";

  interface Props {
    locale: "fr" | "ht";
    form: { ok?: boolean; code?: string; values?: Record<string, string> } | null;
  }
  let { locale, form }: Props = $props();
  const t = $derived(translator(locale));
  const tk = (k: string) => t(k as MessageKey);
  const shot = (name: string) => `/marketing/${locale}/${name}.jpg`;
  let menu = $state(false);

  const MODULES = [
    { key: "members", shot: "members" },
    { key: "dues", shot: "dues" },
    { key: "events", shot: "events" },
    { key: "organs", shot: "organs" },
    { key: "comm", shot: "push" },
    { key: "training", shot: "training" },
  ] as const;
  const NAV = [
    ["fonctionnalites", "mk.nav.features"],
    ["pour-qui", "mk.nav.audiences"],
    ["tarifs", "mk.nav.pricing"],
    ["questions", "mk.nav.faq"],
  ] as const;
</script>

<svelte:head>
  <title>{t("mk.meta.title")}</title>
  <meta name="description" content={t("mk.meta.description")} />
  <meta property="og:title" content={t("mk.meta.title")} />
  <meta property="og:description" content={t("mk.meta.description")} />
  <meta property="og:type" content="website" />
  <meta property="og:image" content={shot("dashboard")} />
</svelte:head>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<header class="top">
  <div class="bar wrap">
    <a class="brand" href="#haut" aria-label="civora">
      <span class="mark" aria-hidden="true"></span>civora
    </a>
    <nav class="links" class:open={menu} aria-label={t("mk.nav.label")}>
      {#each NAV as [id, key] (id)}
        <a href="#{id}" onclick={() => (menu = false)}>{tk(key)}</a>
      {/each}
      <form method="POST" action="/langue" class="lang">
        <input type="hidden" name="lang" value={locale === "fr" ? "ht" : "fr"} />
        <button type="submit" aria-label={t("mk.lang.label")}>{t("mk.lang")}</button>
      </form>
      <a class="btn ghost" href="#demo" onclick={() => (menu = false)}>{t("mk.nav.demo")}</a>
      <a class="btn" href={resolve("/creer")}>{t("mk.nav.create")}</a>
    </nav>
    <button
      type="button"
      class="burger"
      aria-expanded={menu}
      aria-label={t(menu ? "mk.nav.close" : "mk.nav.open")}
      onclick={() => (menu = !menu)}
    >
      <span></span><span></span>
    </button>
  </div>
</header>

<main id="haut">
  <section class="hero wrap">
    <div class="hero-text">
      <h1>{t("mk.hero.title")}</h1>
      <p class="lead">{t("mk.hero.lead")}</p>
      <div class="ctas">
        <a class="btn big" href={resolve("/creer")}>{t("mk.nav.create")}</a>
        <a class="btn big ghost" href="#demo">{t("mk.nav.demo")}</a>
      </div>
      <ul class="points">
        <li>{t("mk.hero.point1")}</li>
        <li>{t("mk.hero.point2")}</li>
        <li>{t("mk.hero.point3")}</li>
      </ul>
    </div>
    <div class="hero-visual">
      <figure class="screen">
        <img src={shot("dashboard")} alt={t("mk.hero.shot")} width="1200" height="750" fetchpriority="high" />
      </figure>
      <div class="card" aria-hidden="true">
        <MemberCard
          partyName="Parti Horizon"
          brandColor="#0F6E66"
          memberName="Nadège Pierre-Louis"
          memberNumber="000001"
          location="Carrefour, Ouest"
          year="2026"
          labels={{ card: t("create.card.label"), number: t("create.card.number"), member: t("create.card.member") }}
        />
        <span class="stamp">{t("mk.hero.stamp")}</span>
      </div>
    </div>
  </section>

  <section class="replace wrap" aria-labelledby="replace-title">
    <div>
      <h2 id="replace-title">{t("mk.replace.title")}</h2>
      <p class="lead">{t("mk.replace.lead")}</p>
    </div>
    <div class="replace-list">
      <ul>
        {#each [1, 2, 3, 4, 5] as i (i)}<li>{tk(`mk.replace.i${i}`)}</li>{/each}
      </ul>
      <p class="replace-end">{t("mk.replace.end")}</p>
    </div>
  </section>

  <section id="fonctionnalites" class="features" aria-labelledby="features-title">
    <div class="wrap section-head">
      <h2 id="features-title">{t("mk.features.title")}</h2>
      <p class="lead">{t("mk.features.lead")}</p>
    </div>
    {#each MODULES as m, i (m.key)}
      <article class="module wrap" class:flip={i % 2 === 1} aria-labelledby="m-{m.key}">
        <div class="module-text">
          <h3 id="m-{m.key}">{tk(`mk.m.${m.key}.title`)}</h3>
          <p>{tk(`mk.m.${m.key}.lead`)}</p>
          <ul class="ticks">
            {#each [1, 2, 3] as b (b)}<li>{tk(`mk.m.${m.key}.b${b}`)}</li>{/each}
          </ul>
          <p class="replaces"><span>{t("mk.replaces")}</span> {tk(`mk.m.${m.key}.r`)}</p>
        </div>
        <figure class="screen">
          <img
            src={shot(m.shot)}
            alt={tk(`mk.m.${m.key}.shot`)}
            width="1200"
            height="750"
            loading="lazy"
            decoding="async"
          />
        </figure>
      </article>
    {/each}

    <div class="soon wrap" aria-labelledby="soon-title">
      <div>
        <h3 id="soon-title">{t("mk.soon.title")}</h3>
        <p>{t("mk.soon.lead")}</p>
      </div>
      <ul>
        {#each ["votes", "app", "elections"] as k (k)}
          <li><span class="badge">{t("mk.soon.badge")}</span>{tk(`mk.soon.${k}`)}</li>
        {/each}
      </ul>
    </div>
  </section>

  <Audiences {locale} />

  <FieldSection {locale} />

  <section class="security wrap" aria-labelledby="sec-title">
    <div>
      <h2 id="sec-title">{t("mk.sec.title")}</h2>
      <p class="lead">{t("mk.sec.lead")}</p>
    </div>
    <ul class="ticks">
      {#each [1, 2, 3, 4, 5] as i (i)}<li>{tk(`mk.sec.i${i}`)}</li>{/each}
    </ul>
  </section>

  <section id="tarifs" class="wrap" aria-labelledby="price-title">
    <Pricing {locale} />
  </section>

  <section id="questions" class="wrap narrow" aria-labelledby="faq-title">
    <Faq {locale} />
  </section>

  <section id="demo" class="demo" aria-labelledby="demo-title">
    <div class="wrap demo-grid">
      <div>
        <h2 id="demo-title">{t("mk.demo.title")}</h2>
        <p class="lead">{t("mk.demo.lead")}</p>
        <div class="cta-alt">
          <p>{t("mk.demo.or")}</p>
          <a class="btn" href={resolve("/creer")}>{t("mk.nav.create")}</a>
        </div>
      </div>
      <DemoForm {locale} {form} />
    </div>
  </section>
</main>

<footer class="foot">
  <div class="wrap foot-grid">
    <div>
      <a class="brand" href="#haut"><span class="mark" aria-hidden="true"></span>civora</a>
      <p>{t("mk.footer.tagline")}</p>
    </div>
    <nav aria-label={t("mk.footer.product")}>
      <p class="foot-title">{t("mk.footer.product")}</p>
      {#each NAV as [id, key] (id)}<a href="#{id}">{tk(key)}</a>{/each}
    </nav>
    <nav aria-label={t("mk.footer.contact")}>
      <p class="foot-title">{t("mk.footer.contact")}</p>
      <a href="#demo">{t("mk.nav.demo")}</a>
      <a href={resolve("/creer")}>{t("mk.nav.create")}</a>
    </nav>
  </div>
  <p class="wrap rights">{t("mk.footer.rights")}</p>
</footer>

<!-- eslint-enable svelte/no-navigation-without-resolve -->

<style>
  :global(html) {
    scroll-behavior: smooth;
    scroll-padding-top: 88px;
  }
  @media (prefers-reduced-motion: reduce) {
    :global(html) {
      scroll-behavior: auto;
    }
  }
  .wrap {
    width: min(1200px, 100% - 2 * var(--s-6));
    margin-inline: auto;
  }
  .narrow {
    width: min(820px, 100% - 2 * var(--s-6));
  }
  h1,
  h2,
  h3 {
    margin: 0;
    font-family: var(--font-display);
    letter-spacing: var(--tracking-display);
    color: var(--c-ink);
  }
  h1 {
    font-size: clamp(38px, 5.2vw, 60px);
    font-weight: 600;
    line-height: 1.08;
  }
  h2 {
    font-size: clamp(30px, 3.6vw, 42px);
    font-weight: 600;
    line-height: 1.12;
  }
  h3 {
    font-size: var(--fs-26);
    font-weight: 600;
    line-height: 1.2;
  }
  p {
    margin: 0;
  }
  .lead {
    margin-top: var(--s-4);
    max-width: 36em;
    font-size: var(--fs-19);
    line-height: 1.55;
    color: var(--c-ink-2);
  }

  /* En-tête */
  .top {
    position: sticky;
    top: 0;
    z-index: 20;
    background: color-mix(in srgb, var(--c-paper) 92%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--c-line);
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-4);
    min-height: 72px;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    color: var(--c-ink);
    text-decoration: none;
    font: 700 var(--fs-22) / 1 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  /* Le logotype : un tampon rond à double cercle, comme sur un procès-verbal. */
  .mark {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 3px solid var(--c-primary);
    box-shadow:
      inset 0 0 0 3px var(--c-paper),
      inset 0 0 0 6px var(--c-primary);
  }
  .links {
    display: flex;
    align-items: center;
    gap: var(--s-1);
  }
  .links > a:not(.btn) {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--s-3);
    color: var(--c-ink);
    text-decoration: none;
    font-size: var(--fs-15);
    font-weight: 500;
    border-radius: var(--r-pill);
  }
  .links > a:not(.btn):hover {
    background: var(--c-line-soft);
  }
  .lang button {
    min-height: 44px;
    padding: 0 var(--s-3);
    border: 0;
    background: none;
    color: var(--c-ink-2);
    font: 500 var(--fs-15) / 1 var(--font-ui);
    cursor: pointer;
  }
  .btn {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 var(--s-5);
    border: 1.5px solid var(--c-primary);
    border-radius: var(--r-pill);
    background: var(--c-primary);
    color: var(--c-on-primary);
    font: 600 var(--fs-15) / 1 var(--font-ui);
    text-decoration: none;
    white-space: nowrap;
  }
  .btn:hover {
    background: var(--c-primary-hover);
    border-color: var(--c-primary-hover);
  }
  .btn.ghost {
    background: transparent;
    color: var(--c-ink);
    border-color: var(--c-ink);
  }
  .btn.ghost:hover {
    background: var(--c-ink);
    color: var(--c-surface);
  }
  .btn.big {
    min-height: 52px;
    padding: 0 var(--s-6);
    font-size: var(--fs-16);
  }
  .burger {
    display: none;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: var(--r-pill);
    background: none;
    cursor: pointer;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 6px;
  }
  .burger span {
    width: 20px;
    height: 2px;
    background: var(--c-ink);
  }

  /* Promesse */
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
    gap: var(--s-14);
    align-items: center;
    padding: var(--s-14) 0 var(--s-24);
  }
  .ctas {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-3);
    margin-top: var(--s-8);
  }
  .points {
    margin: var(--s-8) 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    font-size: var(--fs-15);
    color: var(--c-ink-2);
  }
  .points li,
  .ticks li {
    position: relative;
    padding-left: 28px;
  }
  .points li::before,
  .ticks li::before {
    content: "";
    position: absolute;
    left: 2px;
    top: 0.45em;
    width: 12px;
    height: 7px;
    border-left: 2.5px solid var(--c-primary);
    border-bottom: 2.5px solid var(--c-primary);
    transform: rotate(-45deg);
  }
  .hero-visual {
    position: relative;
    padding-bottom: var(--s-14);
  }
  .screen {
    margin: 0;
    border-radius: 14px;
    overflow: hidden;
    background: var(--c-surface);
    border: 1px solid var(--c-line);
    box-shadow:
      0 1px 2px rgb(28 27 25 / 6%),
      0 24px 60px -24px rgb(11 59 55 / 28%);
  }
  .screen img {
    display: block;
    width: 100%;
    height: auto;
  }
  .card {
    position: absolute;
    left: -8%;
    bottom: 0;
    width: 52%;
    transform: rotate(-5deg);
    filter: drop-shadow(0 18px 30px rgb(11 59 55 / 30%));
  }
  /* Tampon « Présent » : encre rouge brique, légère rotation ; il s'écrase une fois à l'arrivée. */
  .stamp {
    position: absolute;
    right: -10%;
    top: -14%;
    padding: 6px 14px;
    border: 3px solid var(--c-stamp);
    border-radius: 8px;
    color: var(--c-stamp);
    font: 700 var(--fs-22) / 1 var(--font-display);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    background: color-mix(in srgb, var(--c-surface) 70%, transparent);
    transform: rotate(-14deg);
    animation: stamp 0.5s cubic-bezier(0.2, 1.4, 0.4, 1) 0.6s both;
  }
  @keyframes stamp {
    from {
      opacity: 0;
      transform: rotate(-14deg) scale(1.9);
    }
    to {
      opacity: 1;
      transform: rotate(-14deg) scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .stamp {
      animation: none;
    }
  }

  /* Ce que civora remplace */
  .replace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--s-14);
    padding: var(--s-24) 0;
    border-top: 1px solid var(--c-line);
  }
  .replace-list ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
  }
  /* Chaque outil est barré d'un trait d'encre, comme sur une liste qu'on raye. */
  .replace-list li {
    padding: var(--s-4) 0;
    border-bottom: 1px dashed var(--c-line);
    font-size: var(--fs-19);
    color: var(--c-ink-2);
    text-decoration: line-through;
    text-decoration-color: var(--c-stamp);
    text-decoration-thickness: 2px;
  }
  .replace-end {
    margin-top: var(--s-6);
    font-size: var(--fs-19);
    line-height: 1.5;
    font-weight: 500;
  }

  /* Modules */
  .features {
    padding: var(--s-24) 0;
    background: var(--c-surface);
    border-block: 1px solid var(--c-line);
  }
  .section-head {
    margin-bottom: var(--s-14);
  }
  .module {
    display: grid;
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
    gap: var(--s-14);
    align-items: center;
    padding: var(--s-14) 0;
  }
  .module.flip .module-text {
    order: 2;
  }
  .module-text > p {
    margin-top: var(--s-3);
    font-size: var(--fs-16);
    line-height: 1.6;
    color: var(--c-ink-2);
  }
  .ticks {
    margin: var(--s-5) 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    font-size: var(--fs-16);
  }
  .replaces {
    margin-top: var(--s-5) !important;
    padding-top: var(--s-4);
    border-top: 1px solid var(--c-line);
    font-size: var(--fs-14) !important;
  }
  .replaces span {
    font-weight: 600;
    color: var(--c-ink);
    margin-right: var(--s-1);
  }
  .soon {
    display: grid;
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
    gap: var(--s-14);
    margin-top: var(--s-10);
    padding: var(--s-8);
    border-radius: var(--r-lg);
    background: var(--c-paper);
  }
  .soon p {
    margin-top: var(--s-2);
    color: var(--c-ink-2);
  }
  .soon ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }
  .soon li {
    display: flex;
    align-items: baseline;
    gap: var(--s-3);
    font-size: var(--fs-16);
  }
  .badge {
    flex: none;
    padding: 3px 10px;
    border-radius: var(--r-pill);
    background: var(--c-accent-tint);
    color: var(--c-on-accent);
    font-size: var(--fs-13);
    font-weight: 600;
  }

  .security {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--s-14);
    padding: var(--s-24) 0;
  }
  .security .ticks {
    margin: 0;
    gap: var(--s-4);
    font-size: var(--fs-16);
    line-height: 1.5;
  }
  #tarifs {
    padding: var(--s-24) 0;
    border-top: 1px solid var(--c-line);
  }
  #questions {
    padding: 0 0 var(--s-24);
  }

  .demo {
    padding: var(--s-24) 0;
    background: var(--c-surface);
    border-top: 1px solid var(--c-line);
  }
  .demo-grid {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    gap: var(--s-14);
    align-items: start;
  }
  .cta-alt {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-4);
    margin-top: var(--s-10);
    padding-top: var(--s-6);
    border-top: 1px solid var(--c-line);
    font-weight: 500;
  }

  .foot {
    padding: var(--s-14) 0 var(--s-8);
    background: var(--c-rail);
    color: color-mix(in srgb, var(--c-surface) 75%, transparent);
  }
  .foot .brand {
    color: var(--c-surface);
  }
  .foot .mark {
    border-color: var(--c-accent);
    box-shadow:
      inset 0 0 0 3px var(--c-rail),
      inset 0 0 0 6px var(--c-accent);
  }
  .foot-grid {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: var(--s-8);
  }
  .foot-grid p {
    margin-top: var(--s-3);
    max-width: 28em;
    line-height: 1.5;
  }
  .foot nav {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
  }
  .foot nav a {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    color: color-mix(in srgb, var(--c-surface) 85%, transparent);
    text-decoration: none;
  }
  .foot nav a:hover {
    color: var(--c-surface);
    text-decoration: underline;
  }
  .foot-title {
    margin: 0 0 var(--s-2) !important;
    color: var(--c-surface);
    font-weight: 600;
  }
  .rights {
    margin-top: var(--s-10);
    padding-top: var(--s-5);
    border-top: 1px solid rgb(255 255 255 / 12%);
    font-size: var(--fs-13);
  }

  a:focus-visible,
  button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  @media (max-width: 1080px) {
    .links {
      display: none;
      position: absolute;
      top: 72px;
      left: 0;
      right: 0;
      flex-direction: column;
      align-items: stretch;
      gap: var(--s-1);
      padding: var(--s-4) var(--s-6) var(--s-6);
      background: var(--c-paper);
      border-bottom: 1px solid var(--c-line);
    }
    .links.open {
      display: flex;
    }
    .links .btn {
      margin-top: var(--s-2);
    }
    .lang button {
      padding-left: var(--s-3);
    }
    .burger {
      display: inline-flex;
    }
    .hero,
    .replace,
    .module,
    .soon,
    .security,
    .demo-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--s-8);
    }
    .module.flip .module-text {
      order: 0;
    }
    .hero-visual {
      margin-inline: 6%;
    }
  }
  @media (max-width: 720px) {
    .wrap,
    .narrow {
      width: calc(100% - 2 * var(--s-4));
    }
    .hero,
    .replace,
    .features,
    .security,
    #tarifs,
    .demo {
      padding-block: var(--s-14);
    }
    .module {
      padding: var(--s-8) 0;
    }
    .foot-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .card {
      left: -4%;
      width: 78%;
    }
    .stamp {
      right: 0;
      font-size: var(--fs-16);
    }
  }
</style>
