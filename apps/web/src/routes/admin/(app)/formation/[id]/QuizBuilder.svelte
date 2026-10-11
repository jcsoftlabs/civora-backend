<!--
  Constructeur du quiz d'un module (FOR-02) : questions en français et en créole, réponses, bonnes réponses
  cochées. Le quiz part en JSON dans le champ caché « quiz » ; l'API le valide et garde les réponses pour elle.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { Field } from "@civora/ui";
  import { format, translator } from "$lib/i18n";
  import type { QuizQuestion } from "./+page.server";

  interface Props {
    quiz: QuizQuestion[] | null;
    locale: "fr" | "ht";
    /** Appelé avec vrai si une question est incomplète : l'éditeur refuse alors l'envoi. */
    onvalidity?: (incomplete: boolean) => void;
  }
  let { quiz, locale, onvalidity }: Props = $props();
  const t = $derived(translator(locale));

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
  // Copie de travail du quiz, prise une fois à l'ouverture : l'éditeur est recréé pour chaque module.
  let questions = $state<QuizQuestion[]>(untrack(() => structuredClone($state.snapshot(quiz ?? [])) as QuizQuestion[]));
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
  const missing = $derived(cleaned.some((q) => !q.question.fr || q.choices.length < 2 || q.correct.length === 0));

  function toggleCorrect(q: QuizQuestion, choiceId: string) {
    q.correct = q.correct.includes(choiceId) ? q.correct.filter((c) => c !== choiceId) : [...q.correct, choiceId];
  }

  $effect(() => onvalidity?.(missing));
</script>

<input type="hidden" name="quiz" value={JSON.stringify(cleaned)} />
<section class="quiz" aria-label={t("admin.lesson.quiz")}>
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

<style>
  .quiz {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding-top: var(--s-4);
    border-top: 1px solid var(--c-line-soft);
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
    font: 600 var(--fs-13) / 1.12 var(--font-display);
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
  .choice:focus-visible,
  .icon:focus-visible,
  .add:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .muted {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .choice {
    min-height: 44px;
    padding: var(--s-2) var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 400 var(--fs-15) / 1.45 var(--font-ui);
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
    .q-fields {
      grid-template-columns: minmax(0, 1fr);
    }
    .choices,
    .add {
      margin-left: 0;
    }
  }
</style>
