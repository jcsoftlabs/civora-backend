<!--
  Une formation (FOR-01 à FOR-04). Contenu : le parcours, module par module ; chaque module a ses chapitres
  (texte, vidéo, audio, document, YouTube, Vimeo) et, s'il le faut, son quiz. Entre deux modules, le cadenas dit
  ce qui ouvre le suivant. Réglages et aperçu du certificat au modèle du parti. Suivi : concernés, en cours,
  terminés par zone (FOR-03).
-->
<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import { hasFeature } from "@civora/shared";
  import { Badge, Button, Field } from "@civora/ui";
  import { formatDateTime } from "$lib/datetime";
  import { counted, format, translator, type MessageKey } from "$lib/i18n";
  import type { ActionData, PageData } from "./$types";
  import ChapterEditor from "./ChapterEditor.svelte";
  import ModuleEditor from "./ModuleEditor.svelte";

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
              ? { bad: false, text: tk(`admin.course.done.${f.done}`) }
              : null,
  );
  const submit = (key: string) => () => {
    pending = key;
    return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
      await update({ reset: false });
      pending = null;
    };
  };
  /** Nouvel ordre après avoir monté (-1) ou descendu (+1) un élément. */
  const moved = (list: Array<{ id: string }>, i: number, dir: -1 | 1) => {
    const ids = list.map((x) => x.id);
    if (i + dir < 0 || i + dir >= ids.length) return "";
    [ids[i], ids[i + dir]] = [ids[i + dir]!, ids[i]!];
    return ids.join(",");
  };
  const GLYPH: Record<string, string> = {
    text: "T",
    video: "▶",
    audio: "♪",
    document: "▤",
    youtube: "▶",
    vimeo: "▶",
  };
  const chapterCount = $derived(c.modules.reduce((n, m) => n + m.chapters.length, 0));
  const tpl = $derived(data.template);
  const certTitle = $derived(tpl?.title ? label(tpl.title) : t("admin.course.certificate.title"));
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
        <h2 id="lessons-title">{t("admin.course.path")}</h2>
        <p class="muted">
          {t("admin.course.path.lead")}
          {#if c.modules.length}
            {counted(t, "count.module", c.modules.length)}, {counted(t, "count.chapter", chapterCount)}.
          {/if}
        </p>
        {#if c.modules.length === 0 && editing !== "module:new"}
          <p class="empty">{t("admin.course.path.none")}</p>
        {/if}
        <ol class="path">
          {#each c.modules as m, mi (m.id)}
            <li class="module">
              {#if editing === `module:${m.id}`}
                <ModuleEditor
                  module={m}
                  locale={data.locale}
                  oncancel={() => (editing = null)}
                  ondone={() => (editing = null)}
                />
              {:else}
                <header class="m-head">
                  <span class="m-num">{format(t("admin.module.number"), { n: String(mi + 1) })}</span>
                  <span class="m-title">
                    <strong>{label(m.title)}</strong>
                    {#if m.description}<span class="muted">{label(m.description)}</span>{/if}
                  </span>
                  <span class="tools">
                    <form method="POST" action="?/reorderModules" use:enhance={submit(`mup-${m.id}`)}>
                      <input type="hidden" name="order" value={moved(c.modules, mi, -1)} />
                      <button
                        type="submit"
                        class="icon"
                        disabled={mi === 0}
                        aria-label={format(t("admin.lesson.up"), { title: label(m.title) })}>↑</button
                      >
                    </form>
                    <form method="POST" action="?/reorderModules" use:enhance={submit(`mdown-${m.id}`)}>
                      <input type="hidden" name="order" value={moved(c.modules, mi, 1)} />
                      <button
                        type="submit"
                        class="icon"
                        disabled={mi === c.modules.length - 1}
                        aria-label={format(t("admin.lesson.down"), { title: label(m.title) })}>↓</button
                      >
                    </form>
                    <Button size="sm" variant="ghost" onclick={() => (editing = `module:${m.id}`)}
                      >{t("admin.lesson.edit")}</Button
                    >
                    <form method="POST" action="?/deleteModule" use:enhance={submit(`mdel-${m.id}`)}>
                      <input type="hidden" name="id" value={m.id} />
                      <Button type="submit" size="sm" variant="ghost" pending={pending === `mdel-${m.id}`}
                        >{t("admin.module.delete")}</Button
                      >
                    </form>
                  </span>
                </header>
              {/if}

              <ol class="chapters">
                {#each m.chapters as ch, ci (ch.id)}
                  <li>
                    {#if editing === `chapter:${ch.id}`}
                      <ChapterEditor
                        chapter={ch}
                        moduleId={m.id}
                        locale={data.locale}
                        oncancel={() => (editing = null)}
                        ondone={() => (editing = null)}
                      />
                    {:else}
                      <div class="chapter">
                        <span class="glyph {ch.kind}" aria-hidden="true">{GLYPH[ch.kind]}</span>
                        <span class="body">
                          <strong>{label(ch.title)}</strong>
                          <span class="muted">{tk(`admin.chapter.kind.${ch.kind}`)}</span>
                        </span>
                        <span class="tools">
                          <form method="POST" action="?/reorderChapters" use:enhance={submit(`up-${ch.id}`)}>
                            <input type="hidden" name="moduleId" value={m.id} />
                            <input type="hidden" name="order" value={moved(m.chapters, ci, -1)} />
                            <button
                              type="submit"
                              class="icon"
                              disabled={ci === 0}
                              aria-label={format(t("admin.lesson.up"), { title: label(ch.title) })}>↑</button
                            >
                          </form>
                          <form method="POST" action="?/reorderChapters" use:enhance={submit(`down-${ch.id}`)}>
                            <input type="hidden" name="moduleId" value={m.id} />
                            <input type="hidden" name="order" value={moved(m.chapters, ci, 1)} />
                            <button
                              type="submit"
                              class="icon"
                              disabled={ci === m.chapters.length - 1}
                              aria-label={format(t("admin.lesson.down"), { title: label(ch.title) })}>↓</button
                            >
                          </form>
                          <Button size="sm" variant="ghost" onclick={() => (editing = `chapter:${ch.id}`)}
                            >{t("admin.lesson.edit")}</Button
                          >
                          <form method="POST" action="?/deleteChapter" use:enhance={submit(`del-${ch.id}`)}>
                            <input type="hidden" name="id" value={ch.id} />
                            <Button type="submit" size="sm" variant="ghost" pending={pending === `del-${ch.id}`}
                              >{t("admin.chapter.delete")}</Button
                            >
                          </form>
                        </span>
                      </div>
                    {/if}
                  </li>
                {/each}
              </ol>
              {#if editing === `chapter:new:${m.id}`}
                <ChapterEditor
                  chapter={null}
                  moduleId={m.id}
                  locale={data.locale}
                  oncancel={() => (editing = null)}
                  ondone={() => (editing = null)}
                />
              {:else}
                <button type="button" class="add" onclick={() => (editing = `chapter:new:${m.id}`)}>
                  + {t("admin.module.addChapter")}
                </button>
              {/if}
              {#if m.quiz?.length}
                <p class="gate">
                  <span class="gate-mark" aria-hidden="true">?</span>
                  {format(t("admin.module.quiz.summary"), {
                    q: counted(t, "count.question", m.quiz.length),
                    p: String(c.passThresholdPercent),
                  })}
                </p>
              {/if}
            </li>
            {#if mi < c.modules.length - 1}
              <li class="lock">
                <span class="padlock" aria-hidden="true"></span>
                {format(t(m.quiz?.length ? "admin.module.lock.quiz" : "admin.module.lock.read"), {
                  next: String(mi + 2),
                  prev: String(mi + 1),
                })}
              </li>
            {/if}
          {/each}
        </ol>
        {#if editing === "module:new"}
          <ModuleEditor
            module={null}
            locale={data.locale}
            oncancel={() => (editing = null)}
            ondone={() => (editing = null)}
          />
        {:else}
          <div>
            <Button variant="secondary" onclick={() => (editing = "module:new")}>{t("admin.course.addModule")}</Button>
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

        <!-- Aperçu du certificat au modèle du parti : double filet à sa couleur, signataires, comme le PDF. -->
        <figure
          class="cert"
          aria-label={t("admin.course.certificate")}
          style:--cert-accent={tpl?.accentColor ?? "var(--c-primary)"}
        >
          <p class="cert-party">{data.party.name}</p>
          <p class="cert-title">{certTitle}</p>
          <p class="cert-small">{tpl?.mention ? label(tpl.mention) : t("admin.course.certificate.awarded")}</p>
          <p class="cert-name">{t("admin.course.certificate.member")}</p>
          <p class="cert-course">{label(c.title)}</p>
          {#if tpl?.signatories.length}
            <p class="cert-signers">
              {#each tpl.signatories as sg, si (si)}<span>{sg.name}</span>{/each}
            </p>
          {/if}
          <p class="cert-seal" aria-hidden="true">{new Date().getFullYear()}</p>
        </figure>
        {#if certificates}
          <a class="cert-link" href={resolve("/admin/formation/certificat")}>{t("admin.course.certificate.edit")}</a>
        {:else}
          <p class="muted">{t("admin.course.certificate.locked")}</p>
        {/if}
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
    font: 600 var(--fs-32) / 1.12 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  h2 {
    margin: 0;
    font: 600 var(--fs-19) / 1.2 var(--font-display);
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
    font: 600 var(--fs-22) / 1.1 var(--font-display);
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
  .path {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
  }
  .module {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    padding: var(--s-4);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .m-head {
    display: flex;
    align-items: center;
    gap: var(--s-3);
  }
  .m-num {
    flex: none;
    padding: var(--s-1) var(--s-3);
    border-radius: var(--r-pill);
    background: var(--c-primary);
    color: var(--c-on-primary);
    font: 600 var(--fs-13) / 1.2 var(--font-display);
  }
  .m-title {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--fs-16);
  }
  .chapters {
    margin: 0;
    padding: 0 0 0 var(--s-5);
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    border-left: 2px solid var(--c-line-soft);
    margin-left: var(--s-3);
  }
  .chapter {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-md);
    background: var(--c-paper);
  }
  .glyph {
    flex: none;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: var(--r-sm);
    background: var(--c-surface);
    border: 1px solid var(--c-line);
    font: 600 var(--fs-13) / 1.12 var(--font-display);
  }
  .glyph.youtube,
  .glyph.vimeo,
  .glyph.video {
    background: var(--c-ink);
    border-color: var(--c-ink);
    color: var(--c-surface);
  }
  .add {
    align-self: flex-start;
    min-height: 40px;
    margin-left: calc(var(--s-3) + var(--s-5));
    padding: 0 var(--s-3);
    border: 1px dashed var(--c-ink-3);
    border-radius: var(--r-pill);
    background: transparent;
    color: var(--c-ink);
    font: 600 var(--fs-13) / 1 var(--font-ui);
    cursor: pointer;
  }
  /* Quiz de fin de module : la porte qu'il faut passer. */
  .gate {
    margin: var(--s-1) 0 0;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-md);
    background: var(--c-accent-tint);
    font-size: var(--fs-13);
    font-weight: 600;
  }
  .gate-mark {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--c-accent-bright);
    color: var(--c-on-accent);
    font: 600 var(--fs-13) / 1.12 var(--font-display);
  }
  /* Entre deux modules : un filet pointillé et un cadenas qui dit ce qui ouvre la suite. */
  .lock {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    margin-left: var(--s-6);
    padding: var(--s-3) 0 var(--s-3) var(--s-5);
    border-left: 2px dashed var(--c-ink-3);
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .padlock {
    position: relative;
    flex: none;
    width: 16px;
    height: 12px;
    margin-top: 6px;
    border-radius: 3px;
    background: var(--c-ink);
  }
  .padlock::before {
    content: "";
    position: absolute;
    left: 3px;
    top: -8px;
    width: 10px;
    height: 10px;
    border: 2px solid var(--c-ink);
    border-bottom: 0;
    border-radius: 6px 6px 0 0;
    box-sizing: border-box;
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
    border: 2px solid var(--cert-accent);
    outline: 1px solid var(--cert-accent);
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
    color: var(--cert-accent);
    font: 600 var(--fs-19) / 1.1 var(--font-display);
  }
  .cert-small {
    margin-top: var(--s-3) !important;
    font-size: var(--fs-12);
    color: var(--c-ink-2);
  }
  .cert-name {
    font: 600 var(--fs-16) / 1.3 var(--font-display);
    border-bottom: 1px dashed var(--c-ink-3);
    padding-bottom: 2px;
  }
  .cert-course {
    margin-top: var(--s-2) !important;
    font-size: var(--fs-13);
    font-weight: 600;
  }
  .cert-signers {
    margin-top: var(--s-4) !important;
    display: flex;
    justify-content: center;
    gap: var(--s-4);
    font-size: var(--fs-12);
  }
  .cert-signers span {
    min-width: 70px;
    padding-top: 4px;
    border-top: 1px solid var(--c-ink);
  }
  .cert-link {
    font-size: var(--fs-14);
    font-weight: 600;
    color: var(--c-primary);
    text-underline-offset: 3px;
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
    font: 600 var(--fs-12) / 1.12 var(--font-display);
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
    font: 600 var(--fs-32) / 1.12 var(--font-display);
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
  .add:focus-visible,
  .cert-link:focus-visible,
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
    .m-head,
    .chapter {
      flex-wrap: wrap;
    }
    .chapters {
      padding-left: var(--s-3);
      margin-left: 0;
    }
  }
</style>
