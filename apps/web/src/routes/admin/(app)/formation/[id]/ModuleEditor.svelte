<!--
  Édition d'un module (FOR-01, FOR-02) : titre et présentation en français et en créole, et quiz de fin de
  module, facultatif. Avec un quiz, le module suivant ne s'ouvre qu'une fois le quiz réussi ; sans quiz, dès que
  tous les chapitres ont été vus.
-->
<script lang="ts">
  import { organizationKind } from "$lib/i18n/org";
  import { enhance } from "$app/forms";
  import { Button, Field, Switch } from "@civora/ui";
  import { translator, type MessageKey } from "$lib/i18n";
  import type { CourseModule } from "./+page.server";
  import QuizBuilder from "./QuizBuilder.svelte";

  interface Props {
    module: CourseModule | null;
    locale: "fr" | "ht";
    oncancel: () => void;
    ondone: () => void;
  }
  let { module: m, locale, oncancel, ondone }: Props = $props();
  const orgKind = organizationKind();
  const t = $derived(translator(locale, orgKind()));
  const tk = (k: string) => t(k as MessageKey);

  let withQuiz = $derived(!!m?.quiz?.length);
  let incomplete = $state(false);
  let pending = $state(false);
  let error = $state<string | null>(null);
</script>

<form
  method="POST"
  action={m ? "?/updateModule" : "?/addModule"}
  class="editor"
  use:enhance={({ cancel }) => {
    if (withQuiz && incomplete) {
      error = t("error.quiz_invalid");
      cancel();
      return;
    }
    pending = true;
    return async ({ update, result }) => {
      await update({ reset: false });
      pending = false;
      if (result.type === "success") ondone();
      else if (result.type === "failure") error = tk(`error.${(result.data as { code?: string })?.code ?? "generic"}`);
    };
  }}
>
  {#if m}<input type="hidden" name="id" value={m.id} />{/if}
  <div class="two">
    <Field label={t("admin.module.title")} name="titleFr" required maxlength={160} value={m?.title.fr ?? ""} />
    <Field label={t("admin.module.titleHt")} name="titleHt" maxlength={160} value={m?.title.ht ?? ""} />
  </div>
  <div class="two">
    <label class="area">
      <span>{t("admin.module.description")}</span>
      <textarea name="descriptionFr" rows="2" maxlength="2000">{m?.description?.fr ?? ""}</textarea>
    </label>
    <label class="area">
      <span>{t("admin.module.descriptionHt")}</span>
      <textarea name="descriptionHt" rows="2" maxlength="2000">{m?.description?.ht ?? ""}</textarea>
    </label>
  </div>

  <Switch
    label={t("admin.module.quiz")}
    bind:checked={withQuiz}
    description={t(withQuiz ? "admin.module.quiz.on" : "admin.module.quiz.off")}
    onLabel={t("common.yes")}
    offLabel={t("common.no")}
  />
  {#if withQuiz}
    <QuizBuilder quiz={m?.quiz ?? null} {locale} onvalidity={(v) => (incomplete = v)} />
  {:else}
    <input type="hidden" name="quiz" value="[]" />
  {/if}

  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="row end">
    <Button variant="ghost" onclick={oncancel}>{t("common.cancel")}</Button>
    <Button type="submit" {pending}>{t(m ? "admin.module.save" : "admin.module.create")}</Button>
  </div>
</form>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    padding: var(--s-5);
    border: 1px solid var(--c-primary);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-3);
  }
  .area {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    font-size: var(--fs-14);
    font-weight: 600;
  }
  textarea {
    min-height: 44px;
    padding: var(--s-2) var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 400 var(--fs-15) / 1.45 var(--font-ui);
    resize: vertical;
  }
  .error {
    margin: 0;
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-sm);
    background: var(--c-danger-tint);
    color: var(--c-danger-text);
    font-size: var(--fs-14);
  }
  .row {
    display: flex;
    gap: var(--s-2);
  }
  .row.end {
    justify-content: flex-end;
  }
  textarea:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  @media (max-width: 760px) {
    .two {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
