<!--
  « Pour toutes les organisations » (SOC-12) : trois cartes de membre posées de biais, chacune aux couleurs d'une
  organisation fictive (parti en pétrole, association en prune sur badge, syndicat en brique). Elles montrent en
  un coup d'œil la marque blanche : chaque organisation a sa carte, à son nom et à sa couleur.
-->
<script lang="ts">
  import { resolve } from "$app/paths";
  import { MemberCard } from "@civora/ui";
  import { translator, type MessageKey } from "$lib/i18n";

  let { locale }: { locale: "fr" | "ht" } = $props();
  const t = $derived(translator(locale));
  const tk = (k: string) => t(k as MessageKey);
  const labels = $derived({
    card: t("create.card.label"),
    number: t("create.card.number"),
    member: t("create.card.member"),
  });
  const AUDIENCES = [
    {
      key: "party",
      type: "party",
      org: "Parti Horizon",
      color: "#0F6E66",
      member: "Nadège Pierre-Louis",
      number: "000001",
      place: "Carrefour, Ouest",
      vertical: false,
      tilt: -4,
    },
    {
      key: "npo",
      type: "association",
      org: "Association des jeunes de Jacmel",
      color: "#7A2E5C",
      member: "Rose Michel",
      number: "000214",
      place: "Jacmel, Sud-Est",
      vertical: true,
      tilt: 3,
    },
    {
      key: "union",
      type: "union",
      org: "Syndicat Lakay",
      color: "#B5452B",
      member: "Wilner Augustin",
      number: "001087",
      place: "Cap-Haïtien, Nord",
      vertical: false,
      tilt: -2,
    },
  ] as const;
</script>

<section id="pour-qui" class="audiences" aria-labelledby="aud-title">
  <div class="wrap">
    <h2 id="aud-title">{t("mk.aud.title")}</h2>
    <div class="grid">
      {#each AUDIENCES as a (a.key)}
        <div class="aud">
          <div class="stage" aria-hidden="true">
            <div class="card" class:vertical={a.vertical} style:--tilt="{a.tilt}deg">
              <MemberCard
                partyName={a.org}
                brandColor={a.color}
                memberName={a.member}
                memberNumber={a.number}
                location={a.place}
                year="2026"
                orientation={a.vertical ? "vertical" : "horizontal"}
                {labels}
              />
            </div>
          </div>
          <h3>{tk(`mk.aud.${a.key}`)}</h3>
          <p>{tk(`mk.aud.${a.key}.text`)}</p>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
          <a class="link" href="{resolve('/creer')}?type={a.type}">{tk(`mk.aud.${a.key}.cta`)}</a>
        </div>
      {/each}
    </div>
    <p class="words">{t("mk.aud.words")}</p>
  </div>
</section>

<style>
  .audiences {
    padding: var(--s-24) 0;
  }
  .wrap {
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s-8);
    margin-top: var(--s-10);
  }
  /* Socle commun : la carte repose sur une plaque papier, ombre portée, légère inclinaison. */
  .stage {
    height: 260px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-lg);
    background:
      radial-gradient(circle at 1px 1px, rgb(28 27 25 / 10%) 1px, transparent 0) 0 0 / 14px 14px,
      var(--c-surface);
    border: 1px solid var(--c-line);
  }
  .card {
    width: min(270px, 82%);
    transform: rotate(var(--tilt));
    filter: drop-shadow(0 16px 24px rgb(11 59 55 / 22%));
  }
  .card.vertical {
    width: min(150px, 46%);
  }
  h3 {
    margin: var(--s-5) 0 0;
    font: 600 var(--fs-26) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .aud > p {
    margin: var(--s-3) 0 0;
    line-height: 1.6;
    color: var(--c-ink-2);
  }
  .link {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    margin-top: var(--s-2);
    color: var(--c-primary);
    font-weight: 600;
    text-underline-offset: 3px;
  }
  .link:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .words {
    margin: var(--s-10) 0 0;
    padding: var(--s-4) var(--s-5);
    border-left: 3px solid var(--c-accent);
    background: var(--c-accent-tint);
    font-weight: 500;
  }
  @media (max-width: 960px) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--s-10);
    }
    .stage {
      height: 230px;
    }
  }
  @media (max-width: 620px) {
    .audiences {
      padding: var(--s-14) 0;
    }
    .wrap {
      width: calc(100% - 2 * var(--s-4));
    }
  }
</style>
