<!--
  Une formation (FOR-01 à FOR-04). Contenu : leçons dans l'ordre (monter, descendre, modifier, supprimer) et
  réglages, avec l'aperçu du certificat au nom du parti. Suivi : concernés, en cours, terminés par zone (FOR-03).
-->
<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import { hasFeature } from "@civora/shared";
  import { Badge, Button, Field } from "@civora/ui";
  import { formatDateTime } from "$lib/datetime";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { ActionData, PageData } from "./$types";
  import LessonEditor from "./LessonEditor.svelte";

  let { data, form }: { data: PageData & { locale: "fr" | "ht" }; form: ActionData } = $props();
  const t = $derived(translator(data.locale));
  const tk = (k: string) => t(k as MessageKey);
  const c = $derived(data.course);
  const label = (l: { fr: string; ht?: string }) => (data.locale === "ht" && l.ht ? l.ht : l.fr);
  const base = $derived(resolve("/admin/(app)/formation/[id]", { id: c.id }));

  let editing = $state<string | null>(null);
  let pending = $state<string | null>(null);
  const f = $derived(form as { ok?: boolean; done?: string; code?: string } | null);
  const message = $derived(
    f?.code
      ? { bad: true, text: tk(`error.${f.code}`) }
      : f?.done === "published"
        ? { bad: false, text: t("admin.course.published.ok") }
        : f?.done === "unpublished"
          ? { bad: false, text: t("admin.course.unpublished.ok") }
          : f?.done === "saved"
            ? { bad: false, text: t("admin.course.saved") }
            : f?.done
              ? { bad: false, text: tk(`admin.lesson.${f.done.replace("lesson", "").toLowerCase() || "saved"}`) }
              : null,
  );
  const submit = (key: string) => () => {
    pending = key;
    return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
      await update({ reset: false });
      pending = null;
    };
  };
  /** Nouvel ordre après avoir monté (−1) ou descendu (+1) une leçon. */
  const moved = (i: number, dir: -1 | 1) => {
    const ids = c.lessons.map((l) => l.id);
    [ids[i], ids[i + dir]] = [ids[i + dir]!, ids[i]!];
    return ids.join(",");
  };
  const certificates = $derived(data.me.tier ? hasFeature(data.me.tier, "training.certificates") : false);
  const rate = (r: { target: number; completed: number }) =>
    r.target ? Math.round((r.completed / r.target) * 100) : null;
</script>

<main>
  <header class="head">
    <div>
      <a class="back" href={resolve("/admin/formation")}>← {t("admin.course.back")}</a>
      <h1>{label(c.title)}</h1>
      <p class="state">
        <Badge tone={c.publishedAt ? "success" : "neutral"}>
          {t(c.publishedAt ? "admin.training.published" : "admin.training.draft")}
        </Badge>
        {#if c.publishedAt}<span class="muted">{formatDateTime(c.publishedAt)}</span>{/if}
      </p>
    </div>
    <form method="POST" action={c.publishedAt ? "?/unpublish" : "?/publish"} use:enhance={submit("publish")}>
      <Button type="submit" variant={c.publishedAt ? "secondary" : "primary"} pending={pending === "publish"}>
        {t(c.publishedAt ? "admin.course.unpublish" : "admin.course.publish")}
      </Button>
    </form>
  </header>

  <nav class="tabs" aria-label={label(c.title)}>
    <!-- eslint-disable svelte/no-navigation-without-resolve -->
    <a href={base} aria-current={data.tab === "content" ? "page" : undefined}>{t("admin.course.tab.content")}</a>
    <a href="{base}?vue=suivi" aria-current={data.tab === "progress" ? "page" : undefined}
      >{t("admin.course.tab.progress")}</a
    >
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  </nav>

  {#if message}<p class="msg" class:bad={message.bad} role="status">{message.text}</p>{/if}

  {#if data.tab === "content"}
    <div class="layout">
      <section class="lessons" aria-labelledby="lessons-title">
        <h2 id="lessons-title">{t("admin.course.lessons")}</h2>
        <p class="muted">{t("admin.course.lessons.lead")}</p>
        {#if c.lessons.length === 0 && editing !== "new"}<p class="empty">{t("admin.course.lessons.none")}</p>{/if}
        <ol>
          {#each c.lessons as l, i (l.id)}
            <li>
              {#if editing === l.id}
                <LessonEditor
                  lesson={l}
                  locale={data.locale}
                  oncancel={() => (editing = null)}
                  ondone={() => (editing = null)}
                />
              {:else}
                <div class="lesson">
                  <span class="step" aria-hidden="true">{i + 1}</span>
                  <span class="body">
                    <strong>{label(l.title)}</strong>
                    <span class="muted">
                      {tk(`admin.lesson.kind.${l.kind}`)}
                      {#if l.quiz?.length}· {format(t("admin.lesson.quiz.count"), { n: String(l.quiz.length) })}{/if}
                    </span>
                  </span>
                  <span class="tools">
                    <form method="POST" action="?/reorder" use:enhance={submit(`up-${l.id}`)}>
                      <input type="hidden" name="order" value={i > 0 ? moved(i, -1) : ""} />
                      <button
                        type="submit"
                        class="icon"
                        disabled={i === 0}
                        aria-label={format(t("admin.lesson.up"), { title: label(l.title) })}>↑</button
                      >
                    </form>
                    <form method="POST" action="?/reorder" use:enhance={submit(`down-${l.id}`)}>
                      <input type="hidden" name="order" value={i < c.lessons.length - 1 ? moved(i, 1) : ""} />
                      <button
                        type="submit"
                        class="icon"
                        disabled={i === c.lessons.length - 1}
                        aria-label={format(t("admin.lesson.down"), { title: label(l.title) })}>↓</button
                      >
                    </form>
                    <Button size="sm" variant="ghost" onclick={() => (editing = l.id)}>{t("admin.lesson.edit")}</Button>
                    <form method="POST" action="?/deleteLesson" use:enhance={submit(`del-${l.id}`)}>
                      <input type="hidden" name="id" value={l.id} />
                      <Button type="submit" size="sm" variant="ghost" pending={pending === `del-${l.id}`}
                        >{t("admin.lesson.delete")}</Button
                      >
                    </form>
                  </span>
                </div>
              {/if}
            </li>
          {/each}
        </ol>
        {#if editing === "new"}
          <LessonEditor
            lesson={null}
            locale={data.locale}
            oncancel={() => (editing = null)}
            ondone={() => (editing = null)}
          />
        {:else}
          <div>
            <Button variant="secondary" onclick={() => (editing = "new")}>{t("admin.course.addLesson")}</Button>
          </div>
        {/if}
      </section>

      <aside class="side">
        <form method="POST" action="?/settings" use:enhance={submit("settings")} class="settings">
          <h2>{t("admin.course.settings")}</h2>
          <Field label={t("admin.course.title")} name="titleFr" required maxlength={160} value={c.title.fr} />
          <Field label={t("admin.course.titleHt")} name="titleHt" maxlength={160} value={c.title.ht ?? ""} />
          <label class="area">
            <span>{t("admin.course.description")}</span>
            <textarea name="descriptionFr" rows="3" maxlength="5000">{c.description?.fr ?? ""}</textarea>
          </label>
          <label class="area">
            <span>{t("admin.course.descriptionHt")}</span>
            <textarea name="descriptionHt" rows="3" maxlength="5000">{c.description?.ht ?? ""}</textarea>
          </label>
          <Field
            label={t("admin.course.threshold")}
            hint={t("admin.course.threshold.hint")}
            name="passThresholdPercent"
            type="number"
            min="1"
            max="100"
            value={String(c.passThresholdPercent)}
          />
          <Field
            label={t("admin.course.attempts")}
            hint={t("admin.course.attempts.hint")}
            name="maxAttempts"
            type="number"
            min="1"
            max="20"
            value={c.maxAttempts ? String(c.maxAttempts) : ""}
          />
          {#if data.statuses.length}
            <fieldset class="statuses">
              <legend>{t("admin.course.mandatory")}</legend>
              {#each data.statuses as s (s.id)}
                <label>
                  <input
                    type="checkbox"
                    name="mandatoryForStatusIds"
                    value={s.id}
                    checked={c.mandatoryForStatusIds.includes(s.id)}
                  />
                  <span>{label(s.label)}</span>
                </label>
              {/each}
              <small>{t("admin.course.mandatory.hint")}</small>
            </fieldset>
          {/if}
          <Button type="submit" pending={pending === "settings"}>{t("admin.course.save")}</Button>
        </form>

        <!-- Aperçu du certificat : double filet, au nom du parti, comme le PDF délivré. -->
        <figure class="cert" aria-label={t("admin.course.certificate")}>
          <p class="cert-party">{data.party.name}</p>
          <p class="cert-title">{t("admin.course.certificate.title")}</p>
          <p class="cert-small">{t("admin.course.certificate.awarded")}</p>
          <p class="cert-name">{t("admin.course.certificate.member")}</p>
          <p class="cert-course">{label(c.title)}</p>
          <p class="cert-seal" aria-hidden="true">{new Date().getFullYear()}</p>
        </figure>
        {#if !certificates}<p class="muted">{t("admin.course.certificate.locked")}</p>{/if}
      </aside>
    </div>
  {:else if data.progress}
    {@const p = data.progress}
    <section class="progress">
      <p class="muted">{t(p.mandatory ? "admin.progress.leadMandatory" : "admin.progress.lead")}</p>
      {#if p.zone}
        <dl class="kpis">
          <div>
            <dt>{t("admin.progress.target")}</dt>
            <dd>{p.zone.target}</dd>
          </div>
          <div>
            <dt>{t("admin.progress.started")}</dt>
            <dd>{p.zone.started}</dd>
          </div>
          <div>
            <dt>{t("admin.progress.completed")}</dt>
            <dd>{p.zone.completed}</dd>
            {#if rate(p.zone) !== null}
              <dd class="meter" aria-hidden="true"><span style:width="{rate(p.zone)}%"></span></dd>
              <dd class="sub">{rate(p.zone)} %</dd>
            {/if}
          </div>
        </dl>
      {/if}
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{t("admin.dash.col.zone")}</th>
              <th scope="col" class="end">{t("admin.progress.target")}</th>
              <th scope="col" class="end">{t("admin.progress.started")}</th>
              <th scope="col" class="end">{t("admin.progress.completed")}</th>
              <th scope="col">{t("admin.progress.rate")}</th>
            </tr>
          </thead>
          <tbody>
            {#each [...p.children].sort((a, b) => b.target - a.target) as r (r.code)}
              {@const pct = rate(r)}
              <tr class:empty={r.target === 0}>
                <th scope="row">
                  {#if r.level !== "section_communale" && r.level !== "diaspora_ville"}
                    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
                    <a href="{base}?vue=suivi&zone={r.code}">{r.name}</a>
                  {:else}
                    {r.name}
                  {/if}
                </th>
                <td class="end num">{r.target}</td>
                <td class="end num">{r.started}</td>
                <td class="end num">{r.completed}</td>
                <td>
                  {#if pct !== null}
                    <span class="rate"
                      ><span class="meter small" aria-hidden="true"><span style:width="{pct}%"></span></span>{pct} %</span
                    >
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if page.url.searchParams.has("zone")}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a class="back" href="{base}?vue=suivi">← {t("admin.dash.haiti")}</a>
      {/if}
    </section>
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
  .back {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    text-underline-offset: 3px;
  }
  h1 {
    margin: var(--s-2) 0;
    font: 800 var(--fs-32) / 1.05 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  h2 {
    margin: 0;
    font: 700 var(--fs-19) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .state {
    margin: 0;
    display: flex;
    align-items: center;
    gap: var(--s-2);
  }
  .muted,
  .sub,
  small {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    line-height: 1.45;
  }
  .tabs {
    display: flex;
    gap: var(--s-6);
    border-bottom: 1px solid var(--c-line);
  }
  .tabs a {
    padding-bottom: var(--s-3);
    margin-bottom: -1px;
    border-bottom: 3px solid transparent;
    color: var(--c-ink-2);
    text-decoration: none;
    font: 700 var(--fs-22) / 1.1 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .tabs a[aria-current="page"] {
    color: var(--c-ink);
    border-bottom-color: var(--c-primary);
  }
  .msg {
    margin: 0;
    padding: var(--s-3) var(--s-4);
    border-radius: var(--r-md);
    background: var(--c-success-tint);
    color: var(--c-success-text);
    font-size: var(--fs-14);
  }
  .msg.bad {
    background: var(--c-danger-tint);
    color: var(--c-danger-text);
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: var(--s-6);
    align-items: start;
  }
  .lessons,
  .settings,
  .progress {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }
  .lessons ol {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .lesson {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-4);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
  }
  .step {
    flex: none;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--c-primary);
    color: var(--c-on-primary);
    font: 800 var(--fs-14) / 1 var(--font-display);
  }
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .icon {
    width: 36px;
    height: 36px;
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
    background: var(--c-surface);
    color: var(--c-ink);
    cursor: pointer;
  }
  .icon:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .empty {
    margin: 0;
    padding: var(--s-6);
    border: 1px dashed var(--c-line);
    border-radius: var(--r-lg);
    color: var(--c-ink-2);
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    position: sticky;
    top: var(--s-6);
  }
  .settings {
    padding: var(--s-5);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
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
  .statuses {
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
  }
  .statuses legend {
    padding: 0;
    margin-bottom: var(--s-2);
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .statuses label {
    min-height: 36px;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    font-size: var(--fs-14);
  }
  .statuses input {
    accent-color: var(--c-primary);
  }
  /* Certificat miniature : papier, double filet, nom en grand, sceau ambre de l'année. */
  .cert {
    position: relative;
    margin: 0;
    padding: var(--s-6) var(--s-5);
    background: var(--c-surface);
    border: 2px solid var(--c-ink);
    outline: 1px solid var(--c-ink);
    outline-offset: -8px;
    text-align: center;
    box-shadow: var(--shadow-object);
    transform: rotate(-1deg);
  }
  .cert p {
    margin: 0;
  }
  .cert-party {
    font: 700 var(--fs-12) / 1 var(--font-ui);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--c-primary);
  }
  .cert-title {
    margin-top: var(--s-2) !important;
    font: 800 var(--fs-19) / 1.1 var(--font-display);
  }
  .cert-small {
    margin-top: var(--s-3) !important;
    font-size: var(--fs-12);
    color: var(--c-ink-2);
  }
  .cert-name {
    font: 700 var(--fs-16) / 1.3 var(--font-display);
    border-bottom: 1px dashed var(--c-ink-3);
    padding-bottom: 2px;
  }
  .cert-course {
    margin-top: var(--s-2) !important;
    font-size: var(--fs-13);
    font-weight: 600;
  }
  .cert-seal {
    position: absolute;
    right: 14px;
    bottom: 12px;
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--c-accent-bright);
    color: var(--c-on-accent);
    font: 800 var(--fs-12) / 1 var(--font-display);
    box-shadow:
      0 0 0 3px var(--c-surface),
      0 0 0 4px var(--c-accent);
  }
  .kpis {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .kpis > div {
    padding: var(--s-4) var(--s-5);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .kpis > div + div {
    border-left: 1px solid var(--c-line);
  }
  dt {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  dd {
    margin: 0;
    font: 800 var(--fs-32) / 1.05 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  dd.sub {
    font: 400 var(--fs-13) / 1.3 var(--font-ui);
  }
  .meter {
    height: 6px;
    margin: var(--s-2) 0 2px;
    border-radius: var(--r-pill);
    background: var(--c-line-soft);
    overflow: hidden;
  }
  .meter span {
    display: block;
    height: 100%;
    background: var(--c-success);
  }
  .meter.small {
    width: 72px;
    margin: 0;
  }
  .scroll {
    overflow-x: auto;
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-14);
  }
  th,
  td {
    padding: var(--s-3) var(--s-4);
    text-align: left;
    border-bottom: 1px solid var(--c-line-soft);
    white-space: nowrap;
  }
  thead th {
    font-size: var(--fs-13);
    font-weight: 600;
    color: var(--c-ink-2);
  }
  tbody th a {
    color: var(--c-ink);
    text-underline-offset: 3px;
  }
  tr.empty {
    color: var(--c-ink-3);
  }
  .end {
    text-align: right;
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  .rate {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
  }
  .back:focus-visible,
  .tabs a:focus-visible,
  .icon:focus-visible,
  textarea:focus-visible,
  tbody th a:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  @media (max-width: 1100px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .side {
      position: static;
    }
  }
  @media (max-width: 760px) {
    main {
      padding: var(--s-5) var(--s-4) var(--s-8);
    }
    .lesson {
      flex-wrap: wrap;
    }
  }
</style>
