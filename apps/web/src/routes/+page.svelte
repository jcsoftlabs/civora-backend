<script lang="ts">
  import { Badge } from "@civora/ui";
  import { translator } from "$lib/i18n";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const t = $derived(translator(data.locale));
  const other = $derived(data.locale === "fr" ? "ht" : "fr");
</script>

<svelte:head><title>{t("app.name")}</title></svelte:head>

<main>
  <header>
    <span class="brand display">{t("app.name")}</span>
    <form method="POST" action="/langue">
      <input type="hidden" name="lang" value={other} />
      <button type="submit" class="lang">{t("lang.switch")}</button>
    </form>
  </header>

  <section class="hero">
    <Badge tone="accent">{t("home.status")}</Badge>
    <h1>{t("home.title")}</h1>
    <p>{t("home.lead")}</p>
  </section>

  <!-- Le billet de rassemblement : objet du militantisme, bord perforé. -->
  <div class="ticket" aria-hidden="true">
    <span class="display">{t("app.tagline")}</span>
  </div>
</main>

<style>
  main {
    max-width: 960px;
    margin: 0 auto;
    padding: var(--s-6) var(--s-4) var(--s-24);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .brand {
    font-size: var(--fs-26);
    font-weight: 600;
    color: var(--c-primary-deep);
  }
  .lang {
    min-height: var(--touch-min);
    padding: 0 var(--s-4);
    border: 1.5px solid var(--c-line);
    border-radius: var(--r-pill);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 600 var(--fs-14) / 1 var(--font-ui);
    cursor: pointer;
  }
  .hero {
    margin-top: var(--s-24);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--s-4);
  }
  h1 {
    margin: 0;
    font-size: clamp(var(--fs-40), 8vw, var(--fs-82));
    font-weight: 600;
    letter-spacing: var(--tracking-display);
    line-height: 1.1;
  }
  p {
    margin: 0;
    max-width: 36em;
    font-size: var(--fs-19);
    color: var(--c-ink-2);
  }
  .ticket {
    position: relative;
    margin-top: var(--s-14);
    padding: var(--s-6) var(--s-8);
    background: var(--c-primary-deep);
    color: var(--c-card-cream);
    border-radius: var(--r-lg);
    max-width: 520px;
    transform: rotate(-1.5deg);
    box-shadow: var(--shadow-object);
    font-size: var(--fs-22);
    font-weight: 600;
    -webkit-mask:
      radial-gradient(circle 12px at 0 50%, #0000 98%, #000) left / 51% 100% no-repeat,
      radial-gradient(circle 12px at 100% 50%, #0000 98%, #000) right / 51% 100% no-repeat;
    mask:
      radial-gradient(circle 12px at 0 50%, #0000 98%, #000) left / 51% 100% no-repeat,
      radial-gradient(circle 12px at 100% 50%, #0000 98%, #000) right / 51% 100% no-repeat;
  }
  .ticket::after {
    content: "";
    position: absolute;
    top: var(--s-3);
    bottom: var(--s-3);
    right: 30%;
    border-left: 2px dashed color-mix(in srgb, var(--c-card-cream) 45%, transparent);
  }
</style>
