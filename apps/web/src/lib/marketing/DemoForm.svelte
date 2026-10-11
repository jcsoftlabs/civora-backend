<!--
  Demande de démonstration (SOC-12) : nom, organisation, type, taille, téléphone ou WhatsApp, e-mail,
  message. Envoyée par l'action `demo` de la page d'accueil, qui la relaie à l'API (e-mail à l'équipe).
  Un champ invisible piège les robots. Rien n'est stocké.
-->
<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button, Field } from "@civora/ui";
  import { translator, type MessageKey } from "$lib/i18n";

  interface Props {
    locale: "fr" | "ht";
    form: { ok?: boolean; code?: string; values?: Record<string, string> } | null;
  }
  let { locale, form }: Props = $props();
  const t = $derived(translator(locale));
  const tk = (k: string) => t(k as MessageKey);
  const v = $derived(form?.values ?? {});
  let pending = $state(false);
  const KINDS = ["party", "association", "ngo", "union", "other"] as const;
  const SIZES = ["s", "m", "l"] as const;
  const error = $derived(
    form?.code === "contact_required"
      ? t("mk.demo.contact")
      : form?.code
        ? tk(
            `error.${["rate_limited", "demo_unavailable", "invalid_request"].includes(form.code) ? form.code : "generic"}`,
          )
        : null,
  );
</script>

{#if form?.ok}
  <div class="done" role="status">
    <span class="stamp" aria-hidden="true">{t("mk.demo.stamp")}</span>
    <p>{t("mk.demo.done")}</p>
  </div>
{:else}
  <form
    method="POST"
    action="?/demo"
    class="form"
    use:enhance={() => {
      pending = true;
      return async ({ update }) => {
        await update({ reset: false });
        pending = false;
      };
    }}
  >
    <div class="two">
      <Field
        label={t("mk.demo.name")}
        name="name"
        required
        minlength={2}
        maxlength={120}
        autocomplete="name"
        value={v.name ?? ""}
      />
      <Field
        label={t("mk.demo.org")}
        name="organization"
        required
        minlength={2}
        maxlength={160}
        autocomplete="organization"
        value={v.organization ?? ""}
      />
    </div>
    <div class="two">
      <label class="select">
        <span>{t("mk.demo.kind")}</span>
        <select name="kind" required>
          {#each KINDS as k (k)}<option value={k} selected={v.kind === k}>{tk(`mk.demo.kind.${k}`)}</option>{/each}
        </select>
      </label>
      <label class="select">
        <span>{t("mk.demo.size")}</span>
        <select name="size" required>
          {#each SIZES as s (s)}<option value={s} selected={v.size === s}>{tk(`mk.demo.size.${s}`)}</option>{/each}
        </select>
      </label>
    </div>
    <div class="two">
      <Field
        label={t("mk.demo.phone")}
        hint={t("mk.demo.phone.hint")}
        name="phone"
        type="tel"
        inputmode="tel"
        autocomplete="tel"
        maxlength={30}
        value={v.phone ?? ""}
      />
      <Field
        label={t("mk.demo.email")}
        name="email"
        type="email"
        autocomplete="email"
        maxlength={200}
        value={v.email ?? ""}
      />
    </div>
    <label class="area">
      <span>{t("mk.demo.message")}</span>
      <textarea name="message" rows="4" maxlength="2000" placeholder={t("mk.demo.message.hint")}
        >{v.message ?? ""}</textarea
      >
    </label>
    <!-- Piège à robots : invisible et hors du parcours au clavier. -->
    <div class="trap" aria-hidden="true">
      <input type="text" name="website" tabindex="-1" autocomplete="off" />
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="row">
      <Button type="submit" {pending}>{t("mk.demo.submit")}</Button>
      <p class="privacy">{t("mk.demo.privacy")}</p>
    </div>
  </form>
{/if}

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    padding: var(--s-8);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-paper);
  }
  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-4);
  }
  .select,
  .area {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    font-size: var(--fs-14);
    font-weight: 600;
  }
  select,
  textarea {
    min-height: 44px;
    padding: var(--s-2) var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 400 var(--fs-15) / 1.45 var(--font-ui);
  }
  textarea {
    resize: vertical;
  }
  .trap {
    position: absolute;
    left: -10000px;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-4);
  }
  .privacy {
    margin: 0;
    flex: 1;
    min-width: 200px;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .error {
    margin: 0;
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-sm);
    background: var(--c-danger-tint);
    color: var(--c-danger-text);
    font-size: var(--fs-14);
  }
  .done {
    display: flex;
    align-items: center;
    gap: var(--s-6);
    padding: var(--s-8);
    border-radius: var(--r-lg);
    background: var(--c-paper);
    font-size: var(--fs-19);
    line-height: 1.5;
  }
  .done p {
    margin: 0;
  }
  .stamp {
    flex: none;
    padding: 6px 12px;
    border: 3px solid var(--c-stamp);
    border-radius: 8px;
    color: var(--c-stamp);
    font: 700 var(--fs-16) / 1 var(--font-display);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    transform: rotate(-10deg);
  }
  select:focus-visible,
  textarea:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  @media (max-width: 720px) {
    .form {
      padding: var(--s-5);
    }
    .two {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
