<!--
  Formations du parti (FOR-01 à FOR-04) : une carte par formation, avec son état (brouillon ou publiée), ses
  leçons, ses certificats et les statuts pour lesquels elle est obligatoire. Hors formule : option verrouillée.
-->
<script lang="ts">
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";
  import { Badge, Button, Field, Locked } from "@civora/ui";
  import { counted, format, translator, type MessageKey } from "$lib/i18n";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData & { locale: "fr" | "ht" }; form: ActionData } = $props();
  const t = $derived(translator(data.locale));
  const tk = (k: string) => t(k as MessageKey);
  const label = (l: { fr: string; ht?: string }) => (data.locale === "ht" && l.ht ? l.ht : l.fr);
  const statusName = (id: string) => {
    const s = data.statuses.find((x) => x.id === id);
    return s ? label(s.label) : "";
  };
  let creating = $state(false);
  let pending = $state(false);
</script>

<main>
  <header class="head">
    <div>
      <p class="crumb">{data.party.name}</p>
      <h1>{t("admin.training.title")}</h1>
    </div>
    {#if !data.locked}
      <div class="head-actions">
        <a class="outline" href={resolve("/admin/formation/certificat")}>{t("admin.course.certificate.edit")}</a>
        <Button onclick={() => (creating = !creating)} aria-expanded={creating}>{t("admin.training.create")}</Button>
      </div>
    {/if}
  </header>

  {#if data.locked}
    <Locked
      title={t("admin.training.title")}
      message={format(t("plan.lockedIn"), { tier: tk(`plan.${data.locked}`) })}
    />
  {:else}
    {#if creating}
      <form
        method="POST"
        action="?/create"
        class="create"
        use:enhance={() => {
          pending = true;
          return async ({ update }) => {
            await update();
            pending = false;
          };
        }}
      >
        <Field label={t("admin.course.title")} name="titleFr" required minlength={1} maxlength={160} />
        <Field label={t("admin.course.titleHt")} name="titleHt" maxlength={160} />
        {#if form?.code}<p class="error" role="alert">{tk(`error.${form.code}`)}</p>{/if}
        <div class="row">
          <Button type="submit" {pending}>{t("admin.training.create")}</Button>
          <Button variant="ghost" onclick={() => (creating = false)}>{t("common.cancel")}</Button>
        </div>
      </form>
    {/if}

    {#if data.courses.length === 0}
      <section class="empty">
        <h2>{t("admin.training.empty.title")}</h2>
        <p>{t("admin.training.empty.lead")}</p>
      </section>
    {:else}
      <ul class="grid">
        {#each data.courses as c (c.id)}
          <li>
            <a
              class="card"
              class:draft={!c.publishedAt}
              href={resolve("/admin/(app)/formation/[id]", { id: c.id })}
              aria-label={format(t("admin.training.open"), { title: label(c.title) })}
            >
              <span class="top">
                <Badge tone={c.publishedAt ? "success" : "neutral"}>
                  {t(c.publishedAt ? "admin.training.published" : "admin.training.draft")}
                </Badge>
              </span>
              <span class="name">{label(c.title)}</span>
              {#if c.mandatoryForStatusIds?.length}
                <span class="mandatory">
                  {format(t("admin.training.mandatory"), {
                    statuses: c.mandatoryForStatusIds.map(statusName).filter(Boolean).join(", "),
                  })}
                </span>
              {/if}
              <span class="foot">
                <span>{counted(t, "count.module", c.moduleCount)}, {counted(t, "count.chapter", c.lessonCount)}</span>
                <span class="seal" class:none={c.completions === 0}>
                  {format(t("admin.training.completions"), { n: String(c.completions) })}
                </span>
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
    padding: var(--s-6) var(--s-8) var(--s-10);
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--s-4);
  }
  .crumb {
    margin: 0 0 var(--s-2);
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  h1 {
    margin: 0;
    font: 600 var(--fs-32) / 1.12 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .create {
    max-width: 560px;
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    padding: var(--s-5);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .row {
    display: flex;
    gap: var(--s-2);
  }
  .error {
    margin: 0;
    color: var(--c-danger-text);
    font-size: var(--fs-14);
  }
  .empty {
    max-width: 560px;
    padding: var(--s-8);
    border: 1px dashed var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .empty h2 {
    margin: 0 0 var(--s-2);
    font: 600 var(--fs-22) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .empty p {
    margin: 0;
    color: var(--c-ink-2);
    line-height: 1.5;
  }
  .grid {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--s-4);
  }
  .card {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding: var(--s-5);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
    color: var(--c-ink);
    text-decoration: none;
  }
  .card:hover {
    border-color: var(--c-ink-3);
  }
  .card:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .card.draft {
    border-style: dashed;
  }
  .name {
    font: 600 var(--fs-19) / 1.25 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .mandatory {
    font-size: var(--fs-13);
    color: var(--c-warning-text);
    font-weight: 600;
  }
  .foot {
    margin-top: auto;
    padding-top: var(--s-3);
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid var(--c-line-soft);
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  /* Petit sceau : le nombre de certificats délivrés. */
  .seal {
    padding: 3px 10px;
    border: 1.5px solid var(--c-accent);
    border-radius: var(--r-pill);
    color: var(--c-on-accent);
    background: var(--c-accent-tint);
    font-weight: 600;
  }
  .seal.none {
    border-color: var(--c-line);
    background: transparent;
    color: var(--c-ink-2);
    font-weight: 500;
  }
  @media (max-width: 760px) {
    main {
      padding: var(--s-5) var(--s-4) var(--s-8);
    }
  }
  .head-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  .outline {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--s-4);
    border: 1px solid var(--c-ink);
    border-radius: var(--r-pill);
    color: var(--c-ink);
    font: 600 var(--fs-14) / 1 var(--font-ui);
    text-decoration: none;
  }
  .outline:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
</style>
