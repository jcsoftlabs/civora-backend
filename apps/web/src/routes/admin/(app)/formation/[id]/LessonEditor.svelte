<!--
  Édition d'une leçon (FOR-01) : type, titre et texte en français et en créole, fichier (vidéo, audio, document)
  envoyé directement au stockage avec sa progression, et constructeur de quiz : questions, réponses, bonnes
  réponses cochées. Le quiz part en JSON ; l'API le valide et en garde les réponses pour elle.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { enhance } from "$app/forms";
  import { Button, Field } from "@civora/ui";
  import { UploadError, uploadDirect } from "$lib/upload-client";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { Lesson, QuizQuestion } from "./+page.server";

  interface Props {
    lesson: Lesson | null;
    locale: "fr" | "ht";
    oncancel: () => void;
    ondone: () => void;
  }
  let { lesson, locale, oncancel, ondone }: Props = $props();
  const t = $derived(translator(locale));
  const tk = (k: string) => t(k as MessageKey);
  const KINDS = ["text", "video", "audio", "document"] as const;
  const ACCEPT = {
    video: "video/mp4,video/webm",
    audio: "audio/mpeg,audio/mp4,audio/aac,audio/x-m4a",
    document: "application/pdf,image/png,image/jpeg,image/webp",
  } as const;

  let kind = $derived<Lesson["kind"]>(lesson?.kind ?? "text");
  let mediaFileId = $derived(lesson?.mediaFileId ?? "");
  let progress = $state<number | null>(null);
  let uploadError = $state<string | null>(null);
  let pending = $state(false);
  let error = $state<string | null>(null);

  const newId = () => crypto.randomUUID().slice(0, 8);
  const blankQuestion = (): QuizQuestion => ({
    id: newId(),
    question: { fr: "" },
    choices: [
      { id: newId(), text: { fr: "" } },
      { id: newId(), text: { fr: "" } },
    ],
    correct: [],
  });
  // Copie de travail du quiz, prise une fois à l'ouverture : l'éditeur est recréé pour chaque leçon.
  let questions = $state<QuizQuestion[]>(
    untrack(() => structuredClone($state.snapshot(lesson?.quiz ?? [])) as QuizQuestion[]),
  );
  /** Questions complètes seulement (texte, deux réponses remplies, une bonne réponse). */
  const cleaned = $derived(
    questions
      .map((q) => ({
        ...q,
        question: { fr: q.question.fr.trim(), ...(q.question.ht?.trim() ? { ht: q.question.ht.trim() } : {}) },
        choices: q.choices.filter((c) => c.text.fr.trim()).map((c) => ({ id: c.id, text: { fr: c.text.fr.trim() } })),
      }))
      .map((q) => ({ ...q, correct: q.correct.filter((c) => q.choices.some((x) => x.id === c)) })),
  );
  const incomplete = $derived(cleaned.some((q) => !q.question.fr || q.choices.length < 2 || q.correct.length === 0));

  function toggleCorrect(q: QuizQuestion, choiceId: string) {
    q.correct = q.correct.includes(choiceId) ? q.correct.filter((c) => c !== choiceId) : [...q.correct, choiceId];
  }

  async function pick(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    uploadError = null;
    progress = 0;
    try {
      mediaFileId = await uploadDirect(file, "training_media", (p) => (progress = p));
    } catch (err) {
      uploadError = tk(`error.${err instanceof UploadError ? err.code : "upload_failed"}`);
      mediaFileId = lesson?.mediaFileId ?? "";
    } finally {
      progress = null;
    }
  }
</script>

<form
  method="POST"
  action={lesson ? "?/updateLesson" : "?/addLesson"}
  class="editor"
  use:enhance={({ cancel }) => {
    if (incomplete) {
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
  {#if lesson}<input type="hidden" name="id" value={lesson.id} />{/if}
  <input type="hidden" name="quiz" value={JSON.stringify(cleaned)} />
  <input type="hidden" name="mediaFileId" value={kind === "text" ? "" : mediaFileId} />

  <fieldset class="kinds">
    <legend>{t("admin.lesson.kind")}</legend>
    {#each KINDS as k (k)}
      <label class:on={kind === k}>
        <input type="radio" name="kind" value={k} bind:group={kind} />
        <span>{tk(`admin.lesson.kind.${k}`)}</span>
      </label>
    {/each}
  </fieldset>

  <div class="two">
    <Field label={t("admin.lesson.title")} name="titleFr" required maxlength={160} value={lesson?.title.fr ?? ""} />
    <Field label={t("admin.lesson.titleHt")} name="titleHt" maxlength={160} value={lesson?.title.ht ?? ""} />
  </div>

  {#if kind !== "text"}
    <div class="media">
      <label class="area">
        <span>{t("admin.lesson.media")}</span>
        <input type="file" accept={ACCEPT[kind]} onchange={pick} />
        <small>{tk(`admin.lesson.media.hint.${kind}`)}</small>
      </label>
      {#if progress !== null}
        <div
          class="bar"
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style:width="{Math.round(progress * 100)}%"></span>
        </div>
      {:else if mediaFileId}
        <p class="ok">{t("admin.lesson.media.attached")}</p>
      {/if}
      {#if uploadError}<p class="error" role="alert">{uploadError}</p>{/if}
    </div>
  {/if}

  <div class="two">
    <label class="area">
      <span>{t("admin.lesson.body")}</span>
      <textarea name="bodyFr" rows="6" maxlength="20000">{lesson?.body?.fr ?? ""}</textarea>
    </label>
    <label class="area">
      <span>{t("admin.lesson.bodyHt")}</span>
      <textarea name="bodyHt" rows="6" maxlength="20000">{lesson?.body?.ht ?? ""}</textarea>
    </label>
  </div>

  <section class="quiz" aria-labelledby="quiz-{lesson?.id ?? 'new'}">
    <h4 id="quiz-{lesson?.id ?? 'new'}">{t("admin.lesson.quiz")}</h4>
    <p class="muted">{t("admin.lesson.quiz.lead")}</p>
    {#each questions as q, qi (q.id)}
      <div class="question">
        <div class="q-head">
          <span class="q-num">{qi + 1}</span>
          <div class="q-fields">
            <Field
              label={format(t("admin.lesson.quiz.question"), { n: String(qi + 1) })}
              bind:value={q.question.fr}
              maxlength={500}
            />
            <Field
              label={t("admin.lesson.quiz.questionHt")}
              value={q.question.ht ?? ""}
              oninput={(e) => (q.question.ht = e.currentTarget.value)}
              maxlength={500}
            />
          </div>
          <button
            type="button"
            class="icon"
            aria-label={format(t("admin.lesson.quiz.removeQuestion"), { n: String(qi + 1) })}
            onclick={() => (questions = questions.filter((x) => x.id !== q.id))}>×</button
          >
        </div>
        <ul class="choices">
          {#each q.choices as c, ci (c.id)}
            <li class:right={q.correct.includes(c.id)}>
              <label class="tick">
                <input type="checkbox" checked={q.correct.includes(c.id)} onchange={() => toggleCorrect(q, c.id)} />
                <span class="sr-only">{t("admin.lesson.quiz.correct")}</span>
              </label>
              <input
                class="choice"
                aria-label={format(t("admin.lesson.quiz.choice"), { n: String(ci + 1) })}
                placeholder={format(t("admin.lesson.quiz.choice"), { n: String(ci + 1) })}
                bind:value={c.text.fr}
                maxlength="200"
              />
              {#if q.choices.length > 2}
                <button
                  type="button"
                  class="icon small"
                  aria-label={t("admin.lesson.quiz.removeChoice")}
                  onclick={() => (q.choices = q.choices.filter((x) => x.id !== c.id))}>×</button
                >
              {/if}
            </li>
          {/each}
        </ul>
        {#if q.choices.length < 6}
          <button
            type="button"
            class="add"
            onclick={() => (q.choices = [...q.choices, { id: newId(), text: { fr: "" } }])}
          >
            + {t("admin.lesson.quiz.addChoice")}
          </button>
        {/if}
      </div>
    {/each}
    {#if questions.length < 30}
      <button type="button" class="add" onclick={() => (questions = [...questions, blankQuestion()])}>
        + {t("admin.lesson.quiz.addQuestion")}
      </button>
    {/if}
  </section>

  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="row end">
    <Button variant="ghost" onclick={oncancel}>{t("common.cancel")}</Button>
    <Button type="submit" {pending} disabled={progress !== null}>{t("admin.lesson.save")}</Button>
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
  .kinds {
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  legend {
    width: 100%;
    padding: 0;
    margin-bottom: var(--s-2);
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .kinds label {
    position: relative;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--s-4);
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
    font-size: var(--fs-14);
    cursor: pointer;
  }
  .kinds input {
    position: absolute;
    opacity: 0;
  }
  .kinds label.on {
    background: var(--c-ink);
    border-color: var(--c-ink);
    color: var(--c-surface);
  }
  .area {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .area small,
  .muted {
    margin: 0;
    font-weight: 400;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  textarea,
  .choice {
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
  .media {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .bar {
    height: 8px;
    border-radius: var(--r-pill);
    background: var(--c-line-soft);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--c-primary);
    transition: width 0.2s linear;
  }
  .ok {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--c-success-text);
    font-weight: 600;
  }
  .quiz {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding-top: var(--s-4);
    border-top: 1px solid var(--c-line-soft);
  }
  h4 {
    margin: 0;
    font: 700 var(--fs-16) / 1.2 var(--font-display);
  }
  .question {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    padding: var(--s-4);
    border-radius: var(--r-md);
    background: var(--c-paper);
  }
  .q-head {
    display: flex;
    align-items: flex-start;
    gap: var(--s-3);
  }
  .q-num {
    flex: none;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    margin-top: 26px;
    border-radius: var(--r-pill);
    background: var(--c-ink);
    color: var(--c-surface);
    font: 700 var(--fs-13) / 1 var(--font-display);
  }
  .q-fields {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-2);
  }
  .choices {
    margin: 0 0 0 42px;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .choices li {
    display: flex;
    align-items: center;
    gap: var(--s-2);
  }
  .choice {
    flex: 1;
  }
  /* Bonne réponse : la case passe au vert et la ligne est soulignée d'un trait. */
  .choices li.right .choice {
    border-color: var(--c-success);
    box-shadow: inset 3px 0 0 var(--c-success);
  }
  .tick input {
    width: 20px;
    height: 20px;
    accent-color: var(--c-success);
  }
  .icon {
    flex: none;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: var(--r-pill);
    background: transparent;
    color: var(--c-ink-2);
    font-size: var(--fs-19);
    cursor: pointer;
  }
  .icon:hover {
    background: var(--c-surface);
  }
  .add {
    align-self: flex-start;
    min-height: 36px;
    margin-left: 42px;
    padding: 0 var(--s-3);
    border: 1px dashed var(--c-ink-3);
    border-radius: var(--r-pill);
    background: transparent;
    color: var(--c-ink);
    font: 600 var(--fs-13) / 1 var(--font-ui);
    cursor: pointer;
  }
  .quiz > .add {
    margin-left: 0;
  }
  .kinds label:has(input:focus-visible),
  textarea:focus-visible,
  .choice:focus-visible,
  .icon:focus-visible,
  .add:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
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
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  @media (max-width: 760px) {
    .two,
    .q-fields {
      grid-template-columns: minmax(0, 1fr);
    }
    .choices,
    .add {
      margin-left: 0;
    }
  }
</style>
