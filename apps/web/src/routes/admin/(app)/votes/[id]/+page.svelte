<!--
  Fiche d'un scrutin (VOT-01 à VOT-10). Un fil d'étapes (préparer, figer la liste, vote, dépouiller, certifier) et
  l'action de l'étape en cours, puis quatre onglets : déroulé, candidats, liste électorale et contestations,
  résultats. Les résultats se lisent comme un bulletin : la croix à l'encre marque l'élu. Seul moment animé : le
  tampon « Certifié » qui s'écrase à la certification.
-->
<script lang="ts">
  import { organizationKind } from "$lib/i18n/org";
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";
  import { Badge, Button, Field } from "@civora/ui";
  import DateTimeField from "$lib/components/DateTimeField.svelte";
  import Lookup from "$lib/components/Lookup.svelte";
  import { formatDateTime } from "$lib/datetime";
  import { counted, format, translator, type MessageKey } from "$lib/i18n";
  import type { ActionData, PageData } from "./$types";
  import type { Phase } from "../+page.server";

  let { data, form }: { data: PageData & { locale: "fr" | "ht" }; form: ActionData } = $props();
  const orgKind = organizationKind();
  const t = $derived(translator(data.locale, orgKind()));
  const tk = (k: string) => t(k as MessageKey);
  const label = (l: { fr: string; ht?: string } | null | undefined) =>
    l ? (data.locale === "ht" && l.ht ? l.ht : l.fr) : "";
  const dtLabels = $derived({ date: t("common.date"), hour: t("common.hour"), minute: t("common.minute") });
  const e = $derived(data.election);
  const editable = $derived(e.phase === "draft" || e.phase === "preparation");
  const candidateName = (id: string) => label(e.candidates.find((c) => c.id === id)?.label);

  const STEP_OF: Record<Phase, number> = { draft: 0, preparation: 1, open: 2, counting: 3, closed: 3, published: 4 };
  const STEPS = ["prepare", "freeze", "vote", "count", "certify"] as const;
  const step = $derived(STEP_OF[e.phase] + (e.phase === "closed" || e.phase === "published" ? 1 : 0));
  const PHASE_TONE: Record<Phase, "neutral" | "primary" | "success" | "warning" | "accent"> = {
    draft: "neutral",
    preparation: "primary",
    open: "success",
    counting: "warning",
    closed: "primary",
    published: "accent",
  };
  const TABS = [
    ["deroule", "vot.tab.overview"],
    ["candidats", "vot.tab.candidates"],
    ["liste", "vot.tab.roll"],
    ["resultats", "vot.tab.results"],
  ] as const;
  const lastResult = $derived(e.results.at(-1) ?? null);
  const needsRunoff = $derived(e.phase === "closed" && lastResult?.outcome.reason === "runoff");

  let confirming = $state<string | null>(null);
  let pending = $state<string | null>(null);
  let filter = $state("");
  const voters = $derived(
    filter.trim()
      ? data.voters.filter((v) =>
          `${v.firstName} ${v.lastName} ${v.memberNumber}`.toLowerCase().includes(filter.trim().toLowerCase()),
        )
      : data.voters,
  );
  const submit = (name: string) => () => {
    pending = name;
    return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
      await update();
      pending = null;
      confirming = null;
    };
  };
  const done = $derived(
    form && "done" in form && form.done
      ? form.done === "frozen"
        ? format(t("vot.freeze.done"), { n: String((form as { registered?: number }).registered ?? e.registered) })
        : form.done === "counted"
          ? t("vot.count.done")
          : form.done === "runoff"
            ? t("vot.runoff.done")
            : form.done === "certified"
              ? t("vot.certify.done")
              : null
      : null,
  );
  const tabHref = (tab: string) => `?onglet=${tab}`;
</script>

<main>
  <header class="head">
    <a class="crumb" href={resolve("/admin/votes")}>{t("vot.new.back")}</a>
    <div class="title-row">
      <h1>{label(e.title)}</h1>
      {#if e.phase === "published"}
        <span class="stamp" aria-hidden="true">{t("vot.stamp")}</span>
      {/if}
    </div>
    <p class="meta">
      <Badge tone={PHASE_TONE[e.phase]}>{tk(`vot.phase.${e.phase}`)}</Badge>
      {#if e.round === 2}<Badge tone="warning">{t("vot.round2")}</Badge>{/if}
      <span>{tk(`vot.kind.${e.kind}`)}, {tk(`vot.method.${e.method}`)}, {e.zoneName ?? t("vot.national")}</span>
    </p>
  </header>

  <ol class="steps" aria-label={t("vot.tab.overview")}>
    {#each STEPS as s, i (s)}
      <li class:done={i < step} class:current={i === step} aria-current={i === step ? "step" : undefined}>
        <span class="dot" aria-hidden="true">{i + 1}</span>
        {tk(`vot.step.${s}`)}
      </li>
    {/each}
  </ol>

  <!-- eslint-disable svelte/no-navigation-without-resolve -->
  <nav class="tabs" aria-label={t("vot.title")}>
    {#each TABS as [id, key] (id)}
      <a href={tabHref(id)} aria-current={data.tab === id ? "page" : undefined}>
        {tk(key)}
        {#if id === "candidats"}<span class="n">{e.candidates.length}</span>{/if}
        {#if id === "liste" && e.phase !== "draft"}<span class="n">{e.registered}</span>{/if}
      </a>
    {/each}
  </nav>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->

  {#if done}<p class="notice" role="status">{done}</p>{/if}
  {#if form?.code}<p class="error" role="alert">{tk(`error.${form.code}`)}</p>{/if}

  {#if data.tab === "deroule"}
    <section class="card action">
      {#if e.phase === "draft"}
        <h2>{t("vot.freeze")}</h2>
        <p class="lead">{t("vot.freeze.lead")}</p>
        {@render confirmable("freeze", t("vot.freeze"))}
      {:else if e.phase === "preparation"}
        <h2>{format(t("vot.wait.open"), { date: formatDateTime(e.opensAt) })}</h2>
        <p class="lead">{counted(t, "vot.roll.count", e.registered)}</p>
      {:else if e.phase === "open"}
        <h2>{format(t("vot.wait.close"), { date: formatDateTime(e.closesAt) })}</h2>
        {@render turnout()}
      {:else if e.phase === "counting"}
        <h2>{t("vot.count")}</h2>
        <p class="lead">{t("vot.count.lead")}</p>
        {@render turnout()}
        {@render confirmable("count", t("vot.count"))}
      {:else if needsRunoff}
        <h2>{t("vot.runoff")}</h2>
        <p class="lead">{t("vot.runoff.lead")}</p>
        <form method="POST" action="?/runoff" class="stack" use:enhance={submit("runoff")}>
          <div class="pair">
            <DateTimeField label={t("vot.f.opens")} name="opensAt" required labels={dtLabels} />
            <DateTimeField label={t("vot.f.closes")} name="closesAt" required labels={dtLabels} />
          </div>
          <div><Button type="submit" pending={pending === "runoff"}>{t("vot.runoff")}</Button></div>
        </form>
      {:else if e.phase === "closed"}
        <h2>{t("vot.certify")}</h2>
        <p class="lead">{t("vot.certify.lead")}</p>
        {#if data.canCertify}
          {@render confirmable("certify", t("vot.certify"))}
        {:else}
          <p class="lock">{t("vot.certify.right")}</p>
        {/if}
      {:else}
        <h2>{format(t("vot.certified"), { date: e.certifiedAt ? formatDateTime(e.certifiedAt) : "" })}</h2>
        <p class="lead">{t("vot.certify.lead")}</p>
      {/if}
      {#if e.results.length}
        <a class="outline" href={resolve("/admin/(app)/votes/[id]/proces-verbal", { id: e.id })}>{t("vot.minutes")}</a>
      {/if}
    </section>

    <section class="card">
      <h2>{t("vot.settings")}</h2>
      {#if e.description}<p class="lead">{label(e.description)}</p>{/if}
      <ul class="facts">
        <li>{format(t("vot.dates"), { opens: formatDateTime(e.opensAt), closes: formatDateTime(e.closesAt) })}</li>
        {#if e.post}<li>{format(t("vot.settings.post"), { post: e.post.title, organ: e.post.organ })}</li>{/if}
        {#if e.method === "list"}<li>{format(t("vot.settings.seats"), { n: String(e.seats) })}</li>{/if}
        <li>{t(e.allowBlank ? "vot.settings.blank" : "vot.settings.noBlank")}</li>
        {#if e.quorumPercent}<li>{format(t("vot.settings.quorum"), { n: String(e.quorumPercent) })}</li>{/if}
        {#if e.validityThresholdPercent}
          <li>{format(t("vot.settings.threshold"), { n: String(e.validityThresholdPercent) })}</li>
        {/if}
        {#if e.candidaciesCloseAt}
          <li>{format(t("vot.settings.candidacies"), { date: formatDateTime(e.candidaciesCloseAt) })}</li>
        {/if}
        {#if e.contestationsCloseAt}
          <li>{format(t("vot.settings.contestations"), { date: formatDateTime(e.contestationsCloseAt) })}</li>
        {/if}
      </ul>
    </section>
  {:else if data.tab === "candidats"}
    <section class="card">
      {#if e.kind === "question"}
        <p class="lead">{t("vot.cand.question")}</p>
      {:else if !editable}
        <p class="lead">{t("vot.cand.locked")}</p>
      {/if}
      {#if e.candidates.length === 0}
        <p class="lead">{t("vot.cand.empty")}</p>
      {:else}
        <ul class="cands">
          {#each e.candidates as c (c.id)}
            <li class:muted={c.status === "rejected" || c.status === "withdrawn"}>
              <div class="cand-head">
                <span class="cand-name">{label(c.label)}</span>
                {#if c.memberNumber}<span class="num">{c.memberNumber}</span>{/if}
                {#if e.kind === "post"}
                  <Badge tone={c.status === "accepted" ? "success" : c.status === "pending" ? "warning" : "neutral"}>
                    {tk(`vot.cand.status.${c.status}`)}
                  </Badge>
                {/if}
                {#if c.runoff}<Badge tone="primary">{t("vot.cand.runoff")}</Badge>{/if}
              </div>
              {#if c.statement}<p class="statement">{label(c.statement)}</p>{/if}
              {#if c.decisionReason}<p class="statement">{c.decisionReason}</p>{/if}
              {#if editable && e.kind === "post"}
                <div class="row">
                  {#if c.status !== "accepted"}
                    <form method="POST" action="?/decideCandidate" use:enhance={submit(`a-${c.id}`)}>
                      <input type="hidden" name="candidateId" value={c.id} />
                      <input type="hidden" name="status" value="accepted" />
                      <Button type="submit" variant="secondary" pending={pending === `a-${c.id}`}>
                        {t("vot.cand.accept")}
                      </Button>
                    </form>
                  {/if}
                  {#if c.status === "pending"}
                    <form method="POST" action="?/decideCandidate" class="inline" use:enhance={submit(`r-${c.id}`)}>
                      <input type="hidden" name="candidateId" value={c.id} />
                      <input type="hidden" name="status" value="rejected" />
                      <label class="sr-only" for="reason-{c.id}">{t("vot.cand.reason")}</label>
                      <input id="reason-{c.id}" name="reason" maxlength="500" placeholder={t("vot.cand.reason")} />
                      <Button type="submit" variant="ghost" pending={pending === `r-${c.id}`}>
                        {t("vot.cand.reject")}
                      </Button>
                    </form>
                  {:else}
                    <form method="POST" action="?/removeCandidate" use:enhance={submit(`d-${c.id}`)}>
                      <input type="hidden" name="candidateId" value={c.id} />
                      <Button type="submit" variant="ghost" pending={pending === `d-${c.id}`}>
                        {t("vot.cand.remove")}
                      </Button>
                    </form>
                  {/if}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    {#if editable && e.kind === "post"}
      <form method="POST" action="?/addCandidate" class="card stack" use:enhance={submit("add")}>
        <h2>{t("vot.cand.add")}</h2>
        {#if data.canSearchMembers}
          <Lookup
            label={t("vot.cand.member")}
            hint={t("vot.cand.member.hint")}
            type="members"
            name="memberId"
            placeholder={t("vot.cand.member.search")}
            emptyText={t("vot.cand.member.none")}
          />
        {/if}
        <Field label={t("vot.cand.label")} name="labelFr" required maxlength={160} />
        <Field label={t("vot.cand.labelHt")} name="labelHt" maxlength={160} />
        <label class="area">
          <span>{t("vot.cand.statement")}</span>
          <textarea name="statement" rows="3" maxlength="3000"></textarea>
        </label>
        <div><Button type="submit" pending={pending === "add"}>{t("vot.cand.add")}</Button></div>
      </form>
    {/if}
  {:else if data.tab === "liste"}
    {#if e.phase === "draft"}
      <section class="card"><p class="lead">{t("vot.roll.empty")}</p></section>
    {:else}
      <section class="card">
        <div class="roll-head">
          <h2>{counted(t, "vot.roll.count", e.registered)}</h2>
          <label class="search">
            <span class="sr-only">{t("vot.roll.search")}</span>
            <input type="search" bind:value={filter} placeholder={t("vot.roll.search")} />
          </label>
        </div>
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">{t("vot.roll.number")}</th>
                <th scope="col">{t("vot.roll.name")}</th>
                <th scope="col">{t("vot.roll.zone")}</th>
              </tr>
            </thead>
            <tbody>
              {#each voters as v (v.memberNumber)}
                <tr>
                  <td class="num">{v.memberNumber}</td>
                  <td>{v.lastName} {v.firstName}</td>
                  <td>{v.zone}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
      <section class="card">
        <h2>{t("vot.contest.title")}</h2>
        {#if e.contests.length === 0}
          <p class="lead">{t("vot.contest.none")}</p>
        {:else}
          <ul class="cands">
            {#each e.contests as c (c.id)}
              <li>
                <div class="cand-head">
                  <span class="cand-name">{tk(`vot.contest.${c.kind}`)}</span>
                  <Badge tone={c.status === "accepted" ? "success" : c.status === "pending" ? "warning" : "neutral"}>
                    {tk(`vot.contest.${c.status}`)}
                  </Badge>
                </div>
                <p class="statement">
                  {format(t("vot.contest.about"), { name: c.concernedName, author: c.authorName })}
                </p>
                <p class="statement">{c.reason}</p>
                {#if c.decisionNote}<p class="statement"><strong>{c.decisionNote}</strong></p>{/if}
                {#if c.status === "pending" && e.phase === "preparation"}
                  <form method="POST" action="?/decideContest" class="inline" use:enhance={submit(`c-${c.id}`)}>
                    <input type="hidden" name="contestId" value={c.id} />
                    <label class="sr-only" for="note-{c.id}">{t("vot.contest.note")}</label>
                    <input id="note-{c.id}" name="note" maxlength="500" placeholder={t("vot.contest.note")} />
                    <Button type="submit" name="status" value="accepted" variant="secondary">
                      {t("vot.contest.accept")}
                    </Button>
                    <Button type="submit" name="status" value="rejected" variant="ghost">
                      {t("vot.contest.reject")}
                    </Button>
                  </form>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
  {:else if e.results.length === 0}
    <section class="card"><p class="lead">{t("vot.res.none")}</p></section>
  {:else}
    {#if e.phase !== "published"}<p class="lock">{t("vot.res.private")}</p>{/if}
    {#each e.results as r (r.round)}
      {@const lines = Object.entries(r.tally.counts).sort((a, b) => b[1] - a[1])}
      {@const top = Math.max(1, ...lines.map((l) => l[1]))}
      <section class="card paper">
        {#if e.results.length > 1}<h2>{format(t("vot.res.round"), { n: String(r.round) })}</h2>{/if}
        <dl class="strip">
          <div>
            <dt>{t("vot.res.registered")}</dt>
            <dd>{r.registered}</dd>
          </div>
          <div>
            <dt>{t("vot.res.ballots")}</dt>
            <dd>{r.tally.ballots}</dd>
          </div>
          <div>
            <dt>{t("vot.res.blank")}</dt>
            <dd>{r.tally.blank}</dd>
          </div>
          <div>
            <dt>{t("vot.res.valid")}</dt>
            <dd>{r.tally.validVotes}</dd>
          </div>
          <div>
            <dt>{t("vot.res.turnout")}</dt>
            <dd>{r.tally.turnoutPercent.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %</dd>
          </div>
        </dl>
        <ul class="tally">
          {#each lines as [id, n] (id)}
            {@const won = r.outcome.winners.includes(id)}
            <li class:won>
              <span class="box" aria-hidden="true">
                {#if won}
                  <svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19" /></svg>
                {/if}
              </span>
              <span class="who">
                {candidateName(id)}
                {#if won}<span class="sr-only">, {t("vot.res.elected")}</span>{/if}
              </span>
              <span class="bar" aria-hidden="true"><span style:width="{(n / top) * 100}%"></span></span>
              <span class="votes">{format(t("vot.res.votes"), { n: String(n) })}</span>
            </li>
          {/each}
        </ul>
        <p class="verdict">
          {r.outcome.reason === "elected" && e.method === "yes_no"
            ? t("vot.res.adopted")
            : tk(`vot.reason.${r.outcome.reason}`)}
        </p>
      </section>
    {/each}
    {#if data.fingerprint}
      <section class="card">
        <h2>{t("vot.res.fingerprint")}</h2>
        <p class="hash">{data.fingerprint}</p>
        <p class="lead">{t("vot.res.fingerprint.hint")}</p>
      </section>
    {/if}
    <a class="outline" href={resolve("/admin/(app)/votes/[id]/proces-verbal", { id: e.id })}>{t("vot.minutes")}</a>
  {/if}
</main>

{#snippet confirmable(action: string, text: string)}
  {#if confirming === action}
    <form method="POST" action="?/{action}" class="confirm" use:enhance={submit(action)}>
      <p>{t("vot.confirm.lead")}</p>
      <div class="row">
        <Button type="submit" pending={pending === action}>{t("vot.confirm")}</Button>
        <Button variant="ghost" onclick={() => (confirming = null)}>{t("common.cancel")}</Button>
      </div>
    </form>
  {:else}
    <div><Button onclick={() => (confirming = action)}>{text}</Button></div>
  {/if}
{/snippet}

{#snippet turnout()}
  {@const share = e.registered ? Math.round((e.voted / e.registered) * 100) : 0}
  <div class="turnout">
    <span class="bar" aria-hidden="true"><span style:width="{share}%"></span></span>
    <span>
      {format(t("vot.participation"), { voted: String(e.voted), registered: String(e.registered) })}
      <strong>{share} %</strong>
    </span>
  </div>
{/snippet}

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    padding: var(--s-6) var(--s-8) var(--s-10);
    max-width: 960px;
  }
  .crumb {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    text-decoration: none;
  }
  .crumb:hover {
    text-decoration: underline;
  }
  .title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-4);
    margin-top: var(--s-2);
  }
  h1 {
    margin: 0;
    font: 600 var(--fs-32) / 1.12 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .meta {
    margin: var(--s-2) 0 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-2);
    font-size: var(--fs-14);
    color: var(--c-ink-2);
  }
  /* Tampon rouge brique, encre granuleuse, légère rotation : il s'écrase une fois. */
  .stamp {
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
    to {
      opacity: 1;
      transform: rotate(-6deg) scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .stamp {
      animation: none;
    }
  }
  .steps {
    margin: var(--s-2) 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2) var(--s-5);
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
    display: inline-grid;
    place-items: center;
    border: 1.5px solid var(--c-line);
    border-radius: 50%;
    font: 600 var(--fs-12) / 1 var(--font-ui);
    font-variant-numeric: tabular-nums;
  }
  .steps li.done .dot {
    background: var(--c-primary);
    border-color: var(--c-primary);
    color: var(--c-on-primary);
  }
  .steps li.current {
    color: var(--c-ink);
    font-weight: 600;
  }
  .steps li.current .dot {
    border-color: var(--c-primary);
    color: var(--c-primary);
    box-shadow: 0 0 0 3px var(--c-primary-tint);
  }
  .tabs {
    display: flex;
    gap: var(--s-5);
    border-bottom: 1px solid var(--c-line);
    overflow-x: auto;
  }
  .tabs a {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    border-bottom: 2px solid transparent;
    color: var(--c-ink-2);
    font: 600 var(--fs-16) / 1 var(--font-ui);
    text-decoration: none;
    white-space: nowrap;
  }
  .tabs a[aria-current="page"] {
    color: var(--c-ink);
    border-bottom-color: var(--c-ink);
  }
  .tabs a:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .n {
    padding: 1px 8px;
    border-radius: var(--r-pill);
    background: var(--c-line-soft);
    font-size: var(--fs-12);
    font-variant-numeric: tabular-nums;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding: var(--s-5);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .card.action {
    border-left: 4px solid var(--c-primary);
  }
  h2 {
    margin: 0;
    font: 600 var(--fs-19) / 1.25 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .lead {
    margin: 0;
    color: var(--c-ink-2);
    font-size: var(--fs-14);
    line-height: 1.5;
  }
  .lock {
    margin: 0;
    font-size: var(--fs-13);
    font-weight: 600;
    color: var(--c-warning-text);
  }
  .notice {
    margin: 0;
    padding: var(--s-3) var(--s-4);
    border-radius: var(--r-md);
    background: var(--c-success-tint);
    color: var(--c-success-text);
    font-weight: 600;
  }
  .error {
    margin: 0;
    padding: var(--s-3) var(--s-4);
    border-radius: var(--r-md);
    background: var(--c-danger-tint);
    color: var(--c-danger-text);
  }
  .confirm {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    padding: var(--s-3) var(--s-4);
    border: 1px dashed var(--c-warning);
    border-radius: var(--r-md);
    background: var(--c-warning-tint);
  }
  .confirm p {
    margin: 0;
    font-weight: 600;
    color: var(--c-warning-text);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
    align-items: center;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: var(--s-4);
  }
  .outline {
    align-self: flex-start;
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
  .facts {
    margin: 0;
    padding-left: var(--s-5);
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    font-size: var(--fs-14);
  }
  .turnout {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    max-width: 420px;
    font-size: var(--fs-14);
    color: var(--c-ink-2);
    font-variant-numeric: tabular-nums;
  }
  .turnout strong {
    color: var(--c-ink);
  }
  .bar {
    display: block;
    height: 8px;
    border-radius: var(--r-pill);
    background: var(--c-line-soft);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: var(--r-pill);
    background: var(--c-primary);
  }
  .cands {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
  }
  .cands li {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    padding: var(--s-3) 0;
    border-top: 1px solid var(--c-line-soft);
  }
  .cands li:first-child {
    border-top: 0;
  }
  .cands li.muted .cand-name {
    color: var(--c-ink-2);
    text-decoration: line-through;
  }
  .cand-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-2);
  }
  .cand-name {
    font: 600 var(--fs-16) / 1.3 var(--font-ui);
  }
  .num {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    font-variant-numeric: tabular-nums;
  }
  .statement {
    margin: 0;
    font-size: var(--fs-14);
    color: var(--c-ink-2);
    line-height: 1.5;
  }
  .inline {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
    align-items: center;
  }
  .inline input,
  .search input,
  textarea {
    min-height: 44px;
    padding: var(--s-2) var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 400 var(--fs-14) / 1.4 var(--font-ui);
  }
  .search input {
    border-radius: var(--r-pill);
    min-width: 220px;
  }
  .inline input:focus-visible,
  .search input:focus-visible,
  textarea:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .area {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    font: 600 var(--fs-14) / 1.3 var(--font-ui);
  }
  .roll-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
  }
  .scroll {
    overflow-x: auto;
    max-height: 520px;
    overflow-y: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-14);
  }
  th {
    position: sticky;
    top: 0;
    background: var(--c-surface);
    text-align: left;
    font-weight: 600;
    color: var(--c-ink-2);
    font-size: var(--fs-13);
  }
  th,
  td {
    padding: var(--s-2) var(--s-3);
    border-bottom: 1px solid var(--c-line-soft);
  }
  /* Résultats : bulletin papier, case cochée d'une croix à l'encre bleue pour l'élu. */
  .paper {
    background: var(--c-card-cream);
  }
  .strip {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
  }
  .strip div {
    flex: 1 1 110px;
    padding: var(--s-2) var(--s-4);
    border-left: 1px solid var(--c-line);
  }
  .strip div:first-child {
    border-left: 0;
    padding-left: 0;
  }
  .strip dt {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .strip dd {
    margin: var(--s-1) 0 0;
    font: 600 var(--fs-26) / 1.1 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .tally {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }
  .tally li {
    display: grid;
    grid-template-columns: 28px minmax(120px, 1fr) minmax(80px, 2fr) auto;
    align-items: center;
    gap: var(--s-3);
  }
  .box {
    width: 24px;
    height: 24px;
    border: 1.5px solid var(--c-ink);
    border-radius: 3px;
    background: var(--c-surface);
  }
  .box svg {
    width: 100%;
    height: 100%;
    fill: none;
    stroke: var(--c-ink-blue);
    stroke-width: 3;
    stroke-linecap: round;
  }
  .who {
    font-weight: 600;
  }
  .won .bar span {
    background: var(--c-ink);
  }
  .votes {
    font-variant-numeric: tabular-nums;
    font-size: var(--fs-14);
    white-space: nowrap;
  }
  .verdict {
    margin: 0;
    font: 600 var(--fs-16) / 1.4 var(--font-ui);
  }
  .hash {
    margin: 0;
    font-size: var(--fs-13);
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
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
    main {
      padding: var(--s-5) var(--s-4) var(--s-8);
    }
    .strip {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--s-3);
    }
    .strip div,
    .strip div:first-child {
      padding: 0;
      border-left: 0;
    }
    .tally li {
      grid-template-columns: 28px 1fr auto;
    }
    .tally .bar {
      grid-column: 2 / -1;
    }
  }
</style>
