<!--
  Connexion au back-office (SEC-04) : code reçu par e-mail, puis 2FA pour les titulaires de poste.
  À gauche, le parti à ses couleurs ; à droite, une seule action à la fois.
-->
<script lang="ts">
  import { organizationKind } from "$lib/i18n/org";
  import { enhance } from "$app/forms";
  import { Button, Field, cardBackground } from "@civora/ui";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData & { locale: "fr" | "ht" }; form: ActionData } = $props();
  const orgKind = organizationKind();
  const t = $derived(translator(data.locale, orgKind()));
  const bg = $derived(cardBackground(data.party.brandColor));
  let pending = $state(false);
  let restart = $state(false);

  const challengeId = $derived(restart ? null : (form?.challengeId ?? null));
  const email = $derived(form?.email ?? "");
  const error = $derived(form?.code ? t(`error.${form.code}` as MessageKey) : undefined);

  const submit = () => {
    pending = true;
    restart = false;
    return async ({ update }: { update: () => Promise<void> }) => {
      await update();
      pending = false;
    };
  };
</script>

<main>
  <section class="party" style:--panel={bg.background} style:--panel-text={bg.text} aria-hidden="true">
    {#if data.party.logoUrl}<img src={data.party.logoUrl} alt="" class="logo" />{/if}
    <p class="name">{data.party.name}</p>
    <p class="space">{t("admin.title")}</p>
  </section>

  <section class="form">
    <h1>{t("admin.login.title")}</h1>
    {#if !challengeId}
      <p class="lead">{t("admin.login.lead")}</p>
      <form method="POST" action="?/request" use:enhance={submit}>
        <Field
          label={t("admin.login.email")}
          name="email"
          type="email"
          autocomplete="email"
          required
          value={email}
          {error}
        />
        <Button type="submit" {pending}>{t("admin.login.send")}</Button>
      </form>
    {:else}
      <p class="lead" role="status">{format(t("admin.login.sent"), { email })}</p>
      <form method="POST" action="?/verify" use:enhance={submit}>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="challengeId" value={challengeId} />
        <Field
          label={t("admin.login.code")}
          name="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9 ]*"
          required
          class="code"
          {error}
        />
        <Button type="submit" {pending}>{t("admin.login.submit")}</Button>
      </form>
      <div class="secondary">
        <form method="POST" action="?/request" use:enhance={submit}>
          <input type="hidden" name="email" value={email} />
          <Button type="submit" variant="ghost" size="sm">{t("admin.login.resend")}</Button>
        </form>
        <Button variant="ghost" size="sm" onclick={() => (restart = true)}>{t("admin.login.other")}</Button>
      </div>
    {/if}
  </section>
</main>

<style>
  main {
    min-height: 100dvh;
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
  }
  .party {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: var(--s-2);
    padding: var(--s-14) var(--s-10);
    background: var(--panel);
    color: var(--panel-text);
  }
  /* Le grand disque de la carte de membre, en filigrane. */
  .party::before {
    content: "";
    position: absolute;
    right: -30%;
    top: -20%;
    width: 90%;
    aspect-ratio: 1;
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--panel-text) 22%, transparent);
    box-shadow:
      0 0 0 28px color-mix(in srgb, var(--panel-text) 4%, transparent),
      0 0 0 29px color-mix(in srgb, var(--panel-text) 16%, transparent);
  }
  .logo {
    width: 64px;
    height: 64px;
    border-radius: var(--r-pill);
    object-fit: cover;
    background: var(--c-surface);
  }
  .name {
    margin: 0;
    font: 600 var(--fs-52) / 1.12 var(--font-display);
    letter-spacing: var(--tracking-display);
    max-width: 12ch;
  }
  .space {
    margin: 0;
    font: 500 var(--fs-16) / 1.4 var(--font-ui);
    opacity: 0.8;
  }
  .form {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--s-4);
    width: 100%;
    max-width: 440px;
    margin: 0 auto;
    padding: var(--s-14) var(--s-6);
  }
  h1 {
    margin: 0;
    font: 600 var(--fs-32) / 1.12 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .lead {
    margin: 0;
    color: var(--c-ink-2);
    font-size: var(--fs-15);
    line-height: 1.5;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }
  .form :global(input.code) {
    font: 600 var(--fs-26) / 1.12 var(--font-display);
    letter-spacing: 0.3em;
    font-variant-numeric: tabular-nums;
  }
  .secondary {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  @media (max-width: 760px) {
    main {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
    }
    .party {
      padding: var(--s-8) var(--s-4) var(--s-6);
    }
    .name {
      font-size: var(--fs-32);
    }
    .form {
      justify-content: flex-start;
      padding: var(--s-8) var(--s-4);
    }
  }
</style>
