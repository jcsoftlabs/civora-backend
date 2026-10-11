<!--
  2FA des titulaires de poste. Activation : trois étapes numérotées, QR code et clé à saisir à la main.
  Ensuite, à chaque connexion : le code à six chiffres de l'application.
-->
<script lang="ts">
  import { organizationKind } from "$lib/i18n/org";
  import { enhance } from "$app/forms";
  import { Button, Field, QrCode } from "@civora/ui";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData & { locale: "fr" | "ht" }; form: ActionData } = $props();
  const orgKind = organizationKind();
  const t = $derived(translator(data.locale, orgKind()));
  const error = $derived(form?.code ? t(`error.${form.code}` as MessageKey) : undefined);
  let pending = $state(false);
</script>

<main>
  <div class="panel">
    {#if data.mode === "setup"}
      <h1>{t("admin.mfa.setup.title")}</h1>
      <p class="lead">{t("admin.mfa.setup.lead")}</p>
      <ol>
        <li>{t("admin.mfa.step1")}</li>
        <li>
          {t("admin.mfa.step2")}
          <div class="qr">
            <QrCode value={data.otpauthUri ?? ""} label={t("admin.mfa.qr")} size={176} />
            <div class="manual">
              <p>{t("admin.mfa.manual")}</p>
              <code>{data.secret}</code>
            </div>
          </div>
        </li>
        <li>{t("admin.mfa.step3")}</li>
      </ol>
    {:else}
      <h1>{t("admin.mfa.title")}</h1>
      <p class="lead">{format(t("admin.mfa.lead"), { party: data.party.name })}</p>
    {/if}

    <form
      method="POST"
      use:enhance={() => {
        pending = true;
        return async ({ update }) => {
          // Pas de rechargement des données : le QR affiché reste celui que la personne a scanné.
          await update({ invalidateAll: false });
          pending = false;
        };
      }}
    >
      <Field
        label={t("admin.mfa.code")}
        name="code"
        inputmode="numeric"
        autocomplete="one-time-code"
        pattern="[0-9 ]*"
        required
        class="code"
        {error}
      />
      <Button type="submit" {pending}>
        {t(data.mode === "setup" ? "admin.mfa.activate" : "admin.mfa.verify")}
      </Button>
    </form>
    <form method="POST" action="/admin/deconnexion">
      <Button type="submit" variant="ghost" size="sm">{t("admin.logout")}</Button>
    </form>
  </div>
</main>

<style>
  main {
    min-height: 100dvh;
    display: grid;
    place-items: start center;
    padding: var(--s-14) var(--s-4);
  }
  .panel {
    width: 100%;
    max-width: 560px;
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
    padding: var(--s-8);
    border-radius: var(--r-lg);
    background: var(--c-surface);
    border: 1px solid var(--c-line);
  }
  h1 {
    margin: 0;
    font: 600 var(--fs-32) / 1.12 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .lead {
    margin: 0;
    color: var(--c-ink-2);
    line-height: 1.5;
  }
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
    counter-reset: step;
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }
  li {
    counter-increment: step;
    position: relative;
    padding-left: 44px;
    line-height: 1.5;
  }
  li::before {
    content: counter(step);
    position: absolute;
    left: 0;
    top: -2px;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--c-primary);
    color: var(--c-on-primary);
    font: 600 var(--fs-14) / 1.12 var(--font-display);
  }
  .qr {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-5);
    margin-top: var(--s-3);
  }
  /* QR sur blanc, entouré d'un filet : la meilleure lecture par l'appareil photo. */
  .qr :global(.qr) {
    --qr-bg: var(--c-surface);
    border: 1px solid var(--c-line);
    border-radius: var(--r-sm);
  }
  .manual {
    flex: 1;
    min-width: 180px;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .manual p {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  code {
    font: 600 var(--fs-15) / 1.6 var(--font-ui);
    letter-spacing: 0.06em;
    font-variant-numeric: tabular-nums;
    word-break: break-word;
    user-select: all;
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-sm);
    background: var(--c-paper);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }
  .panel :global(input.code) {
    font: 600 var(--fs-26) / 1.12 var(--font-display);
    letter-spacing: 0.3em;
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 560px) {
    .panel {
      padding: var(--s-5);
    }
  }
</style>
