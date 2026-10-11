<!--
  Vérification d'une carte de membre (ADH-11), ouverte par le scan du QR à l'entrée d'un rassemblement.
  Un tampon (objet signature) : VALIDE en vert ou NON VALIDE en rouge, avec le strict nécessaire pour comparer.
  Seul moment animé : le tampon qui se pose. Lisible en plein soleil : grands contrastes, texte large.
-->
<script lang="ts">
  import { formatTime } from "$lib/datetime";
  import { Badge } from "@civora/ui";
  import { translator } from "$lib/i18n";
  import type { PageData } from "./$types";

  let { data }: { data: PageData & { locale: "fr" | "ht" } } = $props();
  const t = $derived(translator(data.locale));
  const r = $derived(data.result);
  // Heure du contrôle, à l'heure d'Haïti, avec AM ou PM.
  const time = $derived(r.checkedAt ? formatTime(r.checkedAt) : "");
</script>

<svelte:head><title>{t("verify.title")}</title><meta name="robots" content="noindex" /></svelte:head>

<main>
  <p class="party display">{r.party ?? t("verify.title")}</p>

  <div class="stamp" class:valid={r.valid} role="status">
    <span>{r.valid ? t("verify.valid") : t("verify.invalid")}</span>
  </div>

  {#if r.valid && r.member}
    <section class="who">
      {#if r.member.photoUrl}<img src={r.member.photoUrl} alt={t("verify.photo")} class="photo" />{/if}
      <p class="name display">{r.member.name}</p>
      <p class="number">{t("verify.number")} <strong class="num">{r.member.number}</strong></p>
      {#if r.duesUpToDate}
        <Badge tone="success">{t("verify.dues.ok")}</Badge>
      {:else}
        <Badge tone="warning">{t("verify.dues.late")}</Badge>
      {/if}
      <p class="time">{t("verify.checked")} {time}</p>
    </section>
  {:else}
    <p class="lead">{t("verify.invalid.lead")}</p>
  {/if}
</main>

<style>
  main {
    min-height: 100dvh;
    max-width: 480px;
    margin: 0 auto;
    padding: var(--s-10) var(--s-4);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-6);
    text-align: center;
  }
  .party {
    margin: 0;
    font-size: var(--fs-22);
    font-weight: 600;
    color: var(--c-ink);
  }
  /* Tampon encreur : bord double, texture irrégulière, légère rotation, se pose une fois. */
  .stamp {
    --ink: var(--c-stamp);
    display: grid;
    place-items: center;
    padding: var(--s-4) var(--s-8);
    border: 4px solid var(--ink);
    outline: 1.5px solid var(--ink);
    outline-offset: 4px;
    border-radius: var(--r-md);
    color: var(--ink);
    transform: rotate(-6deg);
    font: 600 var(--fs-52) / 1.12 var(--font-display);
    letter-spacing: 0.02em;
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -0.85 1.2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E");
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -0.85 1.2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E");
    animation: stamp 420ms var(--ease-stamp) both;
  }
  .stamp.valid {
    --ink: var(--c-success);
  }
  @keyframes stamp {
    from {
      transform: rotate(-6deg) scale(1.6);
      opacity: 0;
    }
    to {
      transform: rotate(-6deg) scale(1);
      opacity: 1;
    }
  }
  .who {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-3);
  }
  .photo {
    width: 120px;
    height: 120px;
    border-radius: var(--r-lg);
    object-fit: cover;
    box-shadow: var(--shadow-object);
  }
  .name {
    margin: 0;
    font-size: var(--fs-32);
    font-weight: 600;
  }
  .number {
    margin: 0;
    font-size: var(--fs-16);
    color: var(--c-ink-2);
  }
  .number strong {
    color: var(--c-ink);
    font-size: var(--fs-19);
  }
  .time,
  .lead {
    margin: 0;
    font-size: var(--fs-14);
    color: var(--c-ink-2);
    max-width: 30em;
  }
  @media (prefers-reduced-motion: reduce) {
    .stamp {
      animation: none;
    }
  }
</style>
