<!--
  Connexion à la console de l'éditeur (SOC-10) : adresse, code reçu par e-mail, double authentification.
  Le tampon civora en tête : la console est un outil interne, sobre, sans animation.
-->
<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button, Field, QrCode } from "@civora/ui";
  import { translator, type MessageKey } from "$lib/i18n";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData & { locale: "fr" | "ht" }; form: ActionData } = $props();
  const t = $derived(translator(data.locale));
  const tk = (k: string) => t(k as MessageKey);
  const f = $derived(form as { sent?: boolean | string; email?: string; challengeId?: string; code?: string } | null);
  const codeStep = $derived(data.step === "email" && !!f?.sent);
  let pending = $state(false);
  const submit = () => {
    pending = true;
    return async ({ update }: { update: () => Promise<void> }) => {
      await update();
      pending = false;
    };
  };
</script>

<svelte:head><title>{t("con.name")}</title></svelte:head>

<main>
  <section class="card" aria-labelledby="title">
    <p class="brand"><span class="mark" aria-hidden="true"></span>{t("con.name")}</p>
    {#if data.step === "email" && !codeStep}
      <h1 id="title">{t("con.name")}</h1>
      <p class="lead">{t("con.login.lead")}</p>
      <form method="POST" action="?/request" use:enhance={submit}>
        <Field
          label={t("con.login.email")}
          name="email"
          type="email"
          autocomplete="email"
          required
          value={f?.email ?? ""}
        />
        <Button type="submit" {pending}>{t("con.login.send")}</Button>
      </form>
    {:else if codeStep}
      <h1 id="title">{t("con.login.code")}</h1>
      <p class="lead">{t("con.login.sent")}</p>
      <form method="POST" action="?/verify" use:enhance={submit}>
        <input type="hidden" name="challengeId" value={f?.challengeId ?? ""} />
        <input type="hidden" name="email" value={f?.email ?? ""} />
        <Field
          label={t("con.login.code")}
          hint={t("con.login.code.hint")}
          name="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength={6}
          required
        />
        <Button type="submit" {pending}>{t("con.login.verify")}</Button>
      </form>
    {:else if data.step === "setup" && data.setup}
      <h1 id="title">{t("con.login.setup.title")}</h1>
      <p class="lead">{t("con.login.setup.lead")}</p>
      <div class="qr"><QrCode value={data.setup.uri} label={t("con.login.setup.title")} size={176} /></div>
      <p class="secret">{t("con.login.setup.secret")} <code>{data.setup.secret}</code></p>
      <form method="POST" action="?/mfa" use:enhance={submit}>
        <Field
          label={t("con.login.mfa.code")}
          name="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength={6}
          required
        />
        <Button type="submit" {pending}>{t("con.login.mfa.submit")}</Button>
      </form>
    {:else}
      <h1 id="title">{t("con.login.mfa.title")}</h1>
      <p class="lead">{t("con.login.mfa.lead")}</p>
      <form method="POST" action="?/mfa" use:enhance={submit}>
        <Field
          label={t("con.login.mfa.code")}
          name="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength={6}
          required
        />
        <Button type="submit" {pending}>{t("con.login.mfa.submit")}</Button>
      </form>
    {/if}
    {#if f?.code}<p class="error" role="alert">{tk(`error.${f.code}`)}</p>{/if}
    {#if codeStep || data.step !== "email"}
      <form method="POST" action="?/restart" class="restart">
        <button type="submit">{t("con.login.restart")}</button>
      </form>
    {/if}
  </section>
</main>

<style>
  main {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: var(--s-6) var(--s-4);
    background: var(--c-rail);
  }
  .card {
    width: min(440px, 100%);
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    padding: var(--s-8);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .brand {
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    font-weight: 600;
    color: var(--c-ink-2);
  }
  .mark {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2.5px solid var(--c-primary);
    box-shadow:
      inset 0 0 0 2.5px var(--c-surface),
      inset 0 0 0 5px var(--c-primary);
  }
  h1 {
    margin: 0;
    font: 600 var(--fs-26) / 1.15 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .lead {
    margin: 0;
    color: var(--c-ink-2);
    line-height: 1.5;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }
  .qr {
    align-self: center;
    padding: var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
  }
  .secret {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    overflow-wrap: anywhere;
  }
  code {
    font: 600 var(--fs-13) / 1.4 var(--font-ui);
    letter-spacing: 0.08em;
    color: var(--c-ink);
  }
  .error {
    margin: 0;
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-sm);
    background: var(--c-danger-tint);
    color: var(--c-danger-text);
    font-size: var(--fs-14);
  }
  .restart button {
    min-height: 44px;
    border: 0;
    background: none;
    color: var(--c-ink-2);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
    font: 500 var(--fs-14) / 1 var(--font-ui);
  }
</style>
