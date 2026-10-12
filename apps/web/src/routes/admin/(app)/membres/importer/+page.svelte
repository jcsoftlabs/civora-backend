<!--
  Assistant d'import des membres (ADH-07 à ADH-09), en quatre étapes : le fichier (déposé sur la page d'un cahier
  d'adhésion, ou une feuille Google Sheets), les colonnes, la vérification (zones à corriger, doublons à fusionner
  ou rejeter, lignes à reprendre), puis l'import par le worker et les invitations (e-mail, liens WhatsApp).
-->
<script lang="ts">
  import { organizationKind } from "$lib/i18n/org";
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import { SvelteURLSearchParams } from "svelte/reactivity";
  import { resolve } from "$app/paths";
  import { formatDayTime } from "$lib/datetime";
  import { Badge, Button, Field, Skeleton } from "@civora/ui";
  import Lookup from "$lib/components/Lookup.svelte";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData & { locale: "fr" | "ht" }; form: ActionData } = $props();
  const orgKind = organizationKind();
  const t = $derived(translator(data.locale, orgKind()));
  const tk = (k: string) => t(k as MessageKey);
  const n = (v: number) => v.toLocaleString(data.locale === "ht" ? "fr-HT" : "fr-FR");

  const FIELDS = [
    "firstName",
    "lastName",
    "fullName",
    "phone",
    "email",
    "birthDate",
    "nin",
    "nif",
    "commune",
    "section",
    "city",
    "country",
    "status",
    "joinedAt",
    "tags",
  ] as const;
  const view = $derived(data.view);
  const summary = $derived(view?.report?.summary ?? null);
  const step = $derived(
    !view
      ? 0
      : view.state === "mapping" || (view.state === "preview" && page.url.searchParams.get("step") === "columns")
        ? 1
        : view.state === "preview"
          ? 2
          : 3,
  );
  const STEPS = ["file", "columns", "review", "import"] as const;
  let pending = $state<string | null>(null);
  const submit = (key: string) => () => {
    pending = key;
    return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
      await update({ reset: false });
      pending = null;
    };
  };
  const code = $derived((form as { code?: string } | null)?.code ?? null);

  // Pendant l'import, l'avancement se rafraîchit toutes les 2 secondes.
  $effect(() => {
    if (view?.state !== "queued" && view?.state !== "running") return;
    const timer = setInterval(() => invalidateAll(), 2000);
    return () => clearInterval(timer);
  });

  let mapping = $state<Record<string, string>>({});
  $effect(() => {
    const saved = view?.settings?.mapping;
    if (saved) mapping = Object.fromEntries(FIELDS.map((f) => [f, saved[f] === undefined ? "" : String(saved[f])]));
  });
  /** Exemple de la première ligne ; une pièce d'identité n'est montrée qu'en partie. */
  function example(field: string): string {
    const i = mapping[field];
    if (i === undefined || i === "" || !view?.table) return "";
    const v = view.table.sample.find((r) => r[Number(i)])?.[Number(i)] ?? "";
    return field === "nin" || field === "nif" ? (v ? `•••• ${v.slice(-2)}` : "") : v;
  }
  const hasName = $derived(!!(mapping.fullName || (mapping.firstName && mapping.lastName) || mapping.lastName));

  const href = (params: Record<string, string | number | null>) => {
    const u = new SvelteURLSearchParams(page.url.searchParams);
    for (const [k, v] of Object.entries(params)) {
      if (v === null) u.delete(k);
      else u.set(k, String(v));
    }
    return `?${u}`;
  };
  const tabCount = (tab: string) =>
    !summary
      ? 0
      : tab === "duplicates"
        ? summary.duplicates
        : tab === "errors"
          ? summary.blocked
          : Object.values(summary.warnings).reduce((a, b) => a + b, 0);
  const label = (s: { label: { fr: string; ht?: string } }) => (data.locale === "ht" && s.label.ht) || s.label.fr;
  const result = $derived(view?.report?.result ?? null);
  const invited = $derived((form as { invited?: number } | null)?.invited ?? null);
</script>

<main>
  <header class="head">
    <a class="crumb" href={resolve("/admin/membres")}>{t("admin.nav.members")}</a>
    <h1>{t("imp.title")}</h1>
    <p class="lead">{t("imp.lead")}</p>
  </header>

  <ol class="steps" aria-label={t("imp.title")}>
    {#each STEPS as s, i (s)}
      <li class:done={i < step} class:current={i === step} aria-current={i === step ? "step" : undefined}>
        <span class="dot" aria-hidden="true">{i + 1}</span>{tk(`imp.step.${s}`)}
      </li>
    {/each}
  </ol>

  {#if code}<p class="msg bad" role="alert">{tk(`error.${code}`)}</p>{/if}

  {#if !view}
    <section class="grid2">
      <form method="POST" action="?/start" enctype="multipart/form-data" use:enhance={submit("start")} class="register">
        <label class="drop">
          <span class="drop-title">{t("imp.file.title")}</span>
          <span class="drop-hint">{t("imp.file.hint")}</span>
          <input
            type="file"
            name="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          />
        </label>
        <div class="or"><span>{t("imp.file.or")}</span></div>
        <Field
          label={t("imp.sheet.label")}
          name="sheetUrl"
          type="url"
          placeholder="https://docs.google.com/spreadsheets/d/..."
          hint={t("imp.sheet.hint")}
        />
        <Button type="submit" pending={pending === "start"}>{t("imp.file.read")}</Button>
      </form>
      <aside class="tips">
        <h2>{t("imp.tips.title")}</h2>
        <ul>
          <li>{t("imp.tips.1")}</li>
          <li>{t("imp.tips.2")}</li>
          <li>{t("imp.tips.3")}</li>
          <li>{t("imp.tips.4")}</li>
        </ul>
      </aside>
    </section>
    {#if data.imports.length}
      <section class="history">
        <h2>{t("imp.history")}</h2>
        <ul>
          {#each data.imports as imp (imp.id)}
            <li>
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
              <a href={`?id=${imp.id}`}>{imp.name ?? t("imp.sheet.name")}</a>
              <span>{formatDayTime(imp.createdAt)}</span>
              <Badge tone={imp.state === "done" ? "success" : imp.state === "failed" ? "danger" : "neutral"}
                >{tk(`imp.state.${imp.state}`)}</Badge
              >
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {:else if step === 1 && view.table}
    <form method="POST" action="?/settings" use:enhance={submit("settings")} class="panel">
      <input type="hidden" name="id" value={view.id} />
      <input type="hidden" name="keptFixes" value={JSON.stringify(view.settings.zoneFixes)} />
      <p class="count">{format(t("imp.columns.rows"), { n: n(view.table.rows) })}</p>
      <table class="map">
        <thead>
          <tr><th>{t("imp.columns.field")}</th><th>{t("imp.columns.column")}</th><th>{t("imp.columns.example")}</th></tr
          >
        </thead>
        <tbody>
          {#each FIELDS as f (f)}
            <tr>
              <th scope="row"><label for="map-{f}">{tk(`imp.field.${f}`)}</label></th>
              <td>
                <select id="map-{f}" name="map:{f}" bind:value={mapping[f]}>
                  <option value="">{t("imp.columns.none")}</option>
                  {#each view.table.headers as h, i (i)}<option value={String(i)}
                      >{h || format(t("imp.columns.n"), { n: String(i + 1) })}</option
                    >{/each}
                </select>
              </td>
              <td class="ex">{example(f)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <label class="select">
        <span>{t("imp.columns.status")}</span>
        <select name="defaultStatusId" value={view.settings.defaultStatusId ?? ""}>
          <option value="">{t("imp.columns.noStatus")}</option>
          {#each data.statuses as s (s.id)}<option value={s.id}>{label(s)}</option>{/each}
        </select>
      </label>
      {#if !hasName}<p class="msg warn">{t("imp.columns.needName")}</p>{/if}
      <div class="actions">
        <Button type="submit" pending={pending === "settings"} disabled={!hasName}>{t("imp.columns.check")}</Button>
      </div>
    </form>
  {:else if step === 2 && summary}
    <section class="band" aria-label={t("imp.review.summary")}>
      <div><strong>{n(summary.rows)}</strong><span>{t("imp.review.rows")}</span></div>
      <div class="ok"><strong>{n(summary.valid)}</strong><span>{t("imp.review.valid")}</span></div>
      <div><strong>{n(summary.duplicates)}</strong><span>{t("imp.review.duplicates")}</span></div>
      <div class:bad={summary.blocked > 0}>
        <strong>{n(summary.blocked)}</strong><span>{t("imp.review.blocked")}</span>
      </div>
    </section>
    {#if summary.quota && summary.quota.after > summary.quota.limit}
      <p class="msg warn">
        {format(t("imp.review.quota"), { after: n(summary.quota.after), limit: n(summary.quota.limit) })}
      </p>
    {/if}

    {#if summary.unknownZones.length}
      <form method="POST" action="?/settings" use:enhance={submit("fixes")} class="panel">
        <h2>{t("imp.zones.title")}</h2>
        <p class="hint">{t("imp.zones.lead")}</p>
        <input type="hidden" name="id" value={view.id} />
        <input type="hidden" name="keptFixes" value={JSON.stringify(view.settings.zoneFixes)} />
        <input type="hidden" name="defaultStatusId" value={view.settings.defaultStatusId ?? ""} />
        {#each Object.entries(view.settings.mapping) as [k, v] (k)}<input
            type="hidden"
            name="map:{k}"
            value={v}
          />{/each}
        <ul class="zones">
          {#each summary.unknownZones as z (z.key)}
            <li>
              <div>
                <strong>{z.label || t("imp.zones.empty")}</strong>
                <span
                  >{z.count === 1
                    ? format(t("imp.zones.line1"), { line: String(z.example) })
                    : format(t("imp.zones.lines"), { n: n(z.count), line: String(z.example) })}</span
                >
              </div>
              <Lookup
                label={t("imp.zones.pick")}
                type="zones"
                levels="member"
                name="fix:{z.key}"
                placeholder={t("imp.zones.search")}
                emptyText={t("imp.zones.none")}
              />
            </li>
          {/each}
        </ul>
        <div class="actions">
          <Button type="submit" variant="secondary" pending={pending === "fixes"}>{t("imp.zones.apply")}</Button>
        </div>
      </form>
    {/if}

    <section class="panel">
      <!-- eslint-disable svelte/no-navigation-without-resolve -->
      <nav class="tabs" aria-label={t("imp.review.lines")}>
        {#each ["duplicates", "errors", "warnings"] as tab (tab)}
          <a href={href({ tab, page: null })} aria-current={data.tab === tab ? "page" : undefined}
            >{tk(`imp.tab.${tab}`)}<span class="n">{n(tabCount(tab))}</span></a
          >
        {/each}
        <a class="edit" href={href({ step: "columns", tab: null, page: null })}>{t("imp.review.columns")}</a>
      </nav>
      <!-- eslint-enable svelte/no-navigation-without-resolve -->
      {#if data.tab === "duplicates" && summary.duplicates}
        <div class="bulk">
          {#each ["merge", "skip"] as d (d)}
            <form method="POST" action="?/decide" use:enhance={submit(`all-${d}`)}>
              <input type="hidden" name="id" value={view.id} />
              <input type="hidden" name="decision" value={d} />
              <Button type="submit" variant="secondary" pending={pending === `all-${d}`}
                >{tk(`imp.decide.all.${d}`)}</Button
              >
            </form>
          {/each}
        </div>
      {/if}
      {#if data.rows && data.rows.rows.length}
        <ul class="lines">
          {#each data.rows.rows as r (r.line)}
            <li>
              <span class="line">{format(t("imp.review.line"), { n: String(r.line) })}</span>
              <div class="who">
                <strong>{r.name || t("imp.review.noName")}</strong>
                <span>{[r.zone, r.phone, r.email].filter(Boolean).join(", ")}</span>
                {#if r.duplicate}
                  <span class="dup">
                    {r.duplicate.member
                      ? format(tk(`imp.dup.${r.duplicate.reason}`), {
                          name: r.duplicate.member.name,
                          number: r.duplicate.member.number,
                        })
                      : t("imp.dup.file")}
                  </span>
                {/if}
                {#each r.issues as i (i)}<span
                    class="issue"
                    class:block={["name_missing", "zone_unknown", "zone_outside_scope"].includes(i)}
                    >{tk(`imp.issue.${i}`)}</span
                  >{/each}
              </div>
              {#if r.duplicate && !r.issues.some( (i) => ["name_missing", "zone_unknown", "zone_outside_scope"].includes(i) )}
                <div class="seg" role="group" aria-label={t("imp.decide.label")}>
                  {#each r.duplicate.member ? ["merge", "skip"] : ["create", "skip"] as d (d)}
                    <form method="POST" action="?/decide" use:enhance={submit(`${r.line}-${d}`)}>
                      <input type="hidden" name="id" value={view.id} />
                      <input type="hidden" name="line" value={r.line} />
                      <input type="hidden" name="decision" value={d} />
                      <button type="submit" class:on={r.decision === d} aria-pressed={r.decision === d}
                        >{tk(`imp.decide.${d}`)}</button
                      >
                    </form>
                  {/each}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
        {#if data.rows.total > 50}
          <!-- eslint-disable svelte/no-navigation-without-resolve -->
          <nav class="pager" aria-label={t("imp.review.pages")}>
            {#if (data.page ?? 1) > 1}<a href={href({ page: (data.page ?? 1) - 1 })}>{t("imp.prev")}</a>{/if}
            <span
              >{format(t("imp.page"), { n: String(data.page ?? 1), of: String(Math.ceil(data.rows.total / 50)) })}</span
            >
            {#if (data.page ?? 1) * 50 < data.rows.total}<a href={href({ page: (data.page ?? 1) + 1 })}
                >{t("imp.next")}</a
              >{/if}
          </nav>
          <!-- eslint-enable svelte/no-navigation-without-resolve -->
        {/if}
      {:else}
        <p class="empty">{tk(`imp.tab.${data.tab}.empty`)}</p>
      {/if}
    </section>

    <form method="POST" action="?/run" use:enhance={submit("run")} class="launch">
      <input type="hidden" name="id" value={view.id} />
      <p>{format(t("imp.run.lead"), { n: n(summary.valid) })}</p>
      <Button type="submit" pending={pending === "run"}>{t("imp.run.go")}</Button>
    </form>
  {:else if view.state === "queued" || view.state === "running"}
    <section class="panel progress" aria-live="polite">
      <h2>{t("imp.run.title")}</h2>
      {#if view.progress && view.progress.total}
        <div class="bar"><span style:width="{(100 * view.progress.done) / view.progress.total}%"></span></div>
        <p>{format(t("imp.run.progress"), { done: n(view.progress.done), total: n(view.progress.total) })}</p>
      {:else}
        <Skeleton label={t("imp.run.queued")} />
        <p>{t("imp.run.queued")}</p>
      {/if}
      <p class="hint">{t("imp.run.leave")}</p>
    </section>
  {:else if view.state === "done" && result}
    <section class="panel done">
      <span class="stamp" aria-hidden="true">{t("imp.stamp")}</span>
      <div class="band small">
        {#each ["created", "merged", "skipped", "failed"] as k (k)}
          <div class:bad={k === "failed" && (result[k] ?? 0) > 0}>
            <strong>{n(result[k] ?? 0)}</strong><span>{tk(`imp.result.${k}`)}</span>
          </div>
        {/each}
      </div>
      <p class="links">
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a href={`${resolve("/admin/membres/importer/rapport")}?id=${view.id}`} download>{t("imp.report")}</a>
        <a href={resolve("/admin/membres")}>{t("imp.toMembers")}</a>
      </p>
    </section>

    <section class="panel">
      <h2>{t("imp.invite.title")}</h2>
      <p class="hint">{t("imp.invite.lead")}</p>
      <form method="POST" action="?/invite" use:enhance={submit("invite")} class="actions start">
        <input type="hidden" name="id" value={view.id} />
        <Button type="submit" pending={pending === "invite"} disabled={!!view.inviteRequestedAt}>
          {view.inviteRequestedAt ? t("imp.invite.sent") : t("imp.invite.email")}
        </Button>
      </form>
      {#if invited !== null}<p class="msg" role="status">{format(t("imp.invite.queued"), { n: n(invited) })}</p>{/if}
      {#if data.links && data.links.total}
        <div class="wa-head">
          <h3>{format(t("imp.invite.whatsapp"), { n: n(data.links.total) })}</h3>
          <!-- eslint-disable svelte/no-navigation-without-resolve -->
          <div class="seg">
            {#each ["fr", "ht"] as l (l)}<a href={href({ lang: l, page: null })} class:on={data.lang === l}
                >{tk(`imp.invite.lang.${l}`)}</a
              >{/each}
          </div>
          <!-- eslint-enable svelte/no-navigation-without-resolve -->
        </div>
        <ul class="wa">
          {#each data.links.links as l (l.number)}
            <li>
              <span><strong>{l.name}</strong> {l.phone}</span>
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
              <a href={l.url} target="_blank" rel="noopener">{t("imp.invite.open")}</a>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="hint">{t("imp.invite.noPhone")}</p>
      {/if}
    </section>
  {:else}
    <p class="msg bad">{t("imp.failed")}</p>
  {/if}
</main>

<style>
  main {
    padding: var(--s-6) var(--s-8) var(--s-10);
    max-width: 1120px;
  }
  .crumb {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    text-decoration: none;
  }
  h1 {
    margin: var(--s-2) 0;
    font: 600 var(--fs-32) / 1.12 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  h2 {
    margin: 0 0 var(--s-2);
    font: 600 var(--fs-19) / 1.3 var(--font-display);
  }
  h3 {
    margin: 0;
    font: 600 var(--fs-16) / 1.3 var(--font-display);
  }
  .lead {
    margin: 0 0 var(--s-5);
    max-width: 62ch;
    color: var(--c-ink-2);
    line-height: 1.5;
  }
  .steps {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2) var(--s-6);
    margin: 0 0 var(--s-6);
    padding: 0;
    list-style: none;
    font-size: var(--fs-14);
    color: var(--c-ink-2);
  }
  .steps li {
    display: flex;
    align-items: center;
    gap: var(--s-2);
  }
  .dot {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border: 1.5px solid var(--c-line);
    border-radius: 50%;
    font: 600 var(--fs-13) / 1 var(--font-ui);
  }
  .steps .current {
    color: var(--c-ink);
    font-weight: 600;
  }
  .steps .current .dot {
    background: var(--c-ink);
    border-color: var(--c-ink);
    color: var(--c-surface);
  }
  .steps .done .dot {
    background: var(--c-primary-tint);
    border-color: var(--c-primary);
    color: var(--c-primary);
  }
  .msg {
    margin: 0 0 var(--s-4);
    padding: var(--s-3) var(--s-4);
    border-radius: var(--r-md);
    background: var(--c-success-tint);
    color: var(--c-success-text);
    font-weight: 600;
  }
  .msg.bad {
    background: var(--c-danger-tint);
    color: var(--c-danger-text);
  }
  .msg.warn {
    background: var(--c-warning-tint);
    color: var(--c-warning-text);
  }
  .grid2 {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: var(--s-6);
    align-items: start;
  }
  /* Page du cahier d'adhésion : lignes bleu pâle et marge rouge, le fichier qu'on remplace. */
  .register {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    padding: var(--s-6) var(--s-6) var(--s-6) calc(var(--s-6) + 28px);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background:
      linear-gradient(
        90deg,
        transparent 38px,
        color-mix(in srgb, var(--c-stamp) 45%, transparent) 38px 40px,
        transparent 40px
      ),
      repeating-linear-gradient(
        to bottom,
        var(--c-surface) 0 31px,
        color-mix(in srgb, var(--c-ink-blue) 14%, transparent) 31px 32px
      );
  }
  .drop {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    padding: var(--s-6);
    border: 2px dashed var(--c-line);
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--c-surface) 88%, transparent);
    cursor: pointer;
  }
  .drop:hover,
  .drop:focus-within {
    border-color: var(--c-primary);
  }
  .drop-title {
    font: 600 var(--fs-19) / 1.3 var(--font-display);
  }
  .drop-hint {
    font-size: var(--fs-14);
    color: var(--c-ink-2);
  }
  .drop input {
    margin-top: var(--s-3);
    font-size: var(--fs-14);
  }
  .or {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    color: var(--c-ink-2);
    font-size: var(--fs-13);
  }
  .or::before,
  .or::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--c-line);
  }
  .tips {
    padding: var(--s-5);
    border-radius: var(--r-lg);
    background: var(--c-surface);
    border: 1px solid var(--c-line);
  }
  .tips ul {
    margin: 0;
    padding-left: var(--s-5);
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    font-size: var(--fs-14);
    line-height: 1.5;
    color: var(--c-ink-2);
  }
  .history {
    margin-top: var(--s-8);
  }
  .history ul {
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--c-line);
  }
  .history li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-2) var(--s-4);
    min-height: 52px;
    border-bottom: 1px solid var(--c-line);
    font-size: var(--fs-14);
  }
  .history a {
    font-weight: 600;
    color: var(--c-ink);
  }
  .history span {
    color: var(--c-ink-2);
  }
  .panel {
    margin-bottom: var(--s-5);
    padding: var(--s-6);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .count,
  .hint {
    margin: 0 0 var(--s-4);
    color: var(--c-ink-2);
    font-size: var(--fs-14);
    line-height: 1.5;
  }
  .map {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-14);
  }
  .map th,
  .map td {
    padding: var(--s-2) var(--s-3);
    border-bottom: 1px solid var(--c-line-soft);
    text-align: left;
  }
  .map thead th {
    color: var(--c-ink-2);
    font-weight: 600;
    font-size: var(--fs-13);
  }
  .map tbody th {
    font-weight: 600;
    width: 30%;
  }
  .map select,
  .select select {
    min-height: 40px;
    width: 100%;
    max-width: 320px;
    padding: 0 var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    font: 400 var(--fs-14) / 1 var(--font-ui);
  }
  .ex {
    color: var(--c-ink-2);
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .select {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    margin-top: var(--s-5);
    font: 600 var(--fs-14) / 1.3 var(--font-ui);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--s-2);
    margin-top: var(--s-5);
  }
  .actions.start {
    justify-content: flex-start;
    margin-top: 0;
  }
  .band {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-bottom: var(--s-5);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .band > div {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    padding: var(--s-5);
  }
  .band > div + div {
    border-left: 1px solid var(--c-line);
  }
  .band strong {
    font: 600 var(--fs-32) / 1 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .band span {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .band .ok strong {
    color: var(--c-primary);
  }
  .band .bad strong {
    color: var(--c-danger-text);
  }
  .band.small {
    margin: var(--s-4) 0;
  }
  .zones {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }
  .zones li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
    gap: var(--s-4);
    align-items: start;
    padding-bottom: var(--s-4);
    border-bottom: 1px solid var(--c-line-soft);
  }
  .zones li > div {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    font-size: var(--fs-14);
  }
  .zones span {
    color: var(--c-ink-2);
    font-size: var(--fs-13);
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-1) var(--s-5);
    margin-bottom: var(--s-4);
    border-bottom: 1px solid var(--c-line);
  }
  .tabs a {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    min-height: 44px;
    color: var(--c-ink-2);
    text-decoration: none;
    font-weight: 600;
    border-bottom: 2px solid transparent;
  }
  .tabs a[aria-current="page"] {
    color: var(--c-ink);
    border-color: var(--c-ink);
  }
  .tabs .n {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    font-variant-numeric: tabular-nums;
  }
  .tabs .edit {
    margin-left: auto;
    color: var(--c-primary);
    font-size: var(--fs-14);
  }
  .bulk {
    display: flex;
    gap: var(--s-2);
    margin-bottom: var(--s-4);
  }
  .lines {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .lines li {
    display: grid;
    grid-template-columns: 80px minmax(0, 1fr) auto;
    gap: var(--s-4);
    align-items: center;
    padding: var(--s-3) 0;
    border-bottom: 1px solid var(--c-line-soft);
  }
  .line {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    font-variant-numeric: tabular-nums;
  }
  .who {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--fs-14);
    min-width: 0;
  }
  .who > span {
    color: var(--c-ink-2);
  }
  .who .dup {
    color: var(--c-ink);
    font-weight: 500;
  }
  .who .issue {
    color: var(--c-warning-text);
  }
  .who .issue.block {
    color: var(--c-danger-text);
    font-weight: 600;
  }
  .seg {
    display: inline-flex;
    gap: var(--s-1);
    padding: 3px;
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
  }
  .seg button,
  .seg a {
    min-height: 36px;
    padding: 0 var(--s-4);
    border: 0;
    border-radius: var(--r-pill);
    background: none;
    color: var(--c-ink);
    font: 600 var(--fs-13) / 36px var(--font-ui);
    text-decoration: none;
    cursor: pointer;
  }
  .seg .on {
    background: var(--c-ink);
    color: var(--c-surface);
  }
  .seg button:focus-visible,
  .seg a:focus-visible {
    box-shadow: var(--focus-ring);
  }
  .empty {
    margin: var(--s-4) 0;
    color: var(--c-ink-2);
  }
  .pager {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--s-4);
    margin-top: var(--s-4);
    font-size: var(--fs-14);
  }
  .pager a {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    color: var(--c-primary);
    font-weight: 600;
  }
  .launch {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-4);
    padding: var(--s-5) var(--s-6);
    border-radius: var(--r-lg);
    background: var(--c-rail);
    color: var(--c-surface);
  }
  .launch p {
    margin: 0;
    font: 500 var(--fs-16) / 1.4 var(--font-ui);
  }
  .progress p {
    margin: var(--s-3) 0 0;
    font-variant-numeric: tabular-nums;
  }
  .bar {
    height: 12px;
    border-radius: var(--r-pill);
    background: var(--c-line-soft);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--c-primary);
    transition: width 400ms ease;
  }
  .done {
    position: relative;
  }
  .stamp {
    position: absolute;
    top: var(--s-5);
    right: var(--s-6);
    padding: 4px 14px;
    border: 3px solid var(--c-stamp);
    border-radius: var(--r-sm);
    color: var(--c-stamp);
    font: 700 var(--fs-16) / 1.2 var(--font-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    transform: rotate(-6deg);
    mask-image: radial-gradient(circle at 30% 40%, #000 60%, rgb(0 0 0 / 0.75) 61%, #000 75%);
    animation: slam 420ms cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
  }
  @keyframes slam {
    from {
      opacity: 0;
      transform: rotate(-6deg) scale(1.8);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .stamp {
      animation: none;
    }
    .bar span {
      transition: none;
    }
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-5);
    margin: 0;
  }
  .links a {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    color: var(--c-primary);
    font-weight: 600;
  }
  .wa-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    margin: var(--s-6) 0 var(--s-3);
  }
  .wa {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .wa li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2) var(--s-4);
    min-height: 52px;
    border-bottom: 1px solid var(--c-line-soft);
    font-size: var(--fs-14);
  }
  .wa a {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--s-4);
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
    color: var(--c-ink);
    font-weight: 600;
    text-decoration: none;
  }
  .wa a:hover {
    border-color: var(--c-primary);
  }
  @media (max-width: 900px) {
    .grid2,
    .zones li {
      grid-template-columns: 1fr;
    }
    .band {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .band > div:nth-child(3) {
      border-left: 0;
    }
    .band > div:nth-child(n + 3) {
      border-top: 1px solid var(--c-line);
    }
    .lines li {
      grid-template-columns: 1fr;
      gap: var(--s-2);
    }
  }
  @media (max-width: 760px) {
    main {
      padding: var(--s-5) var(--s-4) var(--s-8);
    }
    .stamp {
      position: static;
      display: inline-block;
      margin-bottom: var(--s-3);
    }
  }
</style>
