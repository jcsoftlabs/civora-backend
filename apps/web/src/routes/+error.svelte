<script lang="ts">
  import { page } from "$app/state";
  import { Button } from "@civora/ui";
  import { translator, isLocale } from "$lib/i18n";

  const lang = page.data.locale;
  const t = translator(isLocale(lang) ? lang : "fr");
  const notFound = $derived(page.status === 404);
</script>

<main>
  <h1>{t(notFound ? "error.notFound.title" : "error.title")}</h1>
  <p>{t(notFound ? "error.notFound.lead" : "error.lead")}</p>
  <Button href="/">{t("error.back")}</Button>
</main>

<style>
  main {
    max-width: 640px;
    margin: 0 auto;
    padding: var(--s-24) var(--s-4);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--s-4);
  }
  h1 {
    margin: 0;
    font-size: var(--fs-40);
    font-weight: 600;
  }
  p {
    margin: 0;
    color: var(--c-ink-2);
    font-size: var(--fs-16);
  }
</style>
