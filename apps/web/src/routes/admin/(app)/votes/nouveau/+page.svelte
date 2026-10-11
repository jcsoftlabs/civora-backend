<!--
  Création d'un scrutin (VOT-01, VOT-02, VOT-04, VOT-07) : nature (poste ou question), intitulé et zone, poste à
  pourvoir, mode de scrutin, calendrier sur 12 heures, règles du dépouillement, corps électoral et conditions des
  candidats. Les options hors formule restent visibles, verrouillées, avec la formule requise.
-->
<script lang="ts">
  import { organizationKind } from "$lib/i18n/org";
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";
  import { Button, Field, Switch } from "@civora/ui";
  import DateTimeField from "$lib/components/DateTimeField.svelte";
  import Lookup from "$lib/components/Lookup.svelte";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData & { locale: "fr" | "ht" }; form: ActionData } = $props();
  const orgKind = organizationKind();
  const t = $derived(translator(data.locale, orgKind()));
  const tk = (k: string) => t(k as MessageKey);
  const label = (l: { fr: string; ht?: string }) => (data.locale === "ht" && l.ht ? l.ht : l.fr);
  const dtLabels = $derived({ date: t("common.date"), hour: t("common.hour"), minute: t("common.minute") });
  const lockedText = $derived(format(t("plan.lockedIn"), { tier: t("plan.mouvement") }));

  let kind = $state<"post" | "question">("post");
  let method = $state<"simple_majority" | "two_rounds" | "list">("simple_majority");
  let allowBlank = $state(true);
  let pending = $state(false);
  const METHODS = [
    { id: "simple_majority", advanced: false },
    { id: "two_rounds", advanced: true },
    { id: "list", advanced: true },
  ] as const;
</script>

<main>
  <header class="head">
    <a class="crumb" href={resolve("/admin/votes")}>{t("vot.new.back")}</a>
    <h1>{t("vot.new.title")}</h1>
  </header>

  <form
    method="POST"
    use:enhance={() => {
      pending = true;
      return async ({ update }) => {
        await update({ reset: false });
        pending = false;
      };
    }}
  >
    <fieldset class="block">
      <legend>{t("vot.new.kind")}</legend>
      <div class="tiles two">
        {#each ["post", "question"] as const as k (k)}
          <label class="tile" class:on={kind === k}>
            <input type="radio" name="kind" value={k} bind:group={kind} />
            <span class="tile-title">{tk(`vot.kind.${k}`)}</span>
            <span class="tile-hint">{tk(`vot.kind.${k}.hint`)}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <section class="block">
      <h2>{t("vot.new.general")}</h2>
      <Field label={t("vot.f.title")} name="titleFr" required maxlength={160} />
      <Field label={t("vot.f.titleHt")} name="titleHt" maxlength={160} />
      <label class="area">
        <span>{t("vot.f.description")}</span>
        <textarea name="descriptionFr" rows="3" maxlength="5000"></textarea>
      </label>
      <label class="area">
        <span>{t("vot.f.descriptionHt")}</span>
        <textarea name="descriptionHt" rows="3" maxlength="5000"></textarea>
      </label>
      <Lookup
        label={t("vot.f.zone")}
        hint={t("vot.f.zone.hint")}
        type="zones"
        name="zoneCode"
        placeholder={t("admin.organ.zone.search")}
        emptyText={t("error.zone_not_found")}
        clearLabel={t("vot.national")}
      />
      {#if kind === "post" && !data.advanced}
        <p class="lock">{t("vot.f.post")} : {lockedText}</p>
      {:else if kind === "post"}
        <label class="area">
          <span>{t("vot.f.post")}</span>
          <select name="postId">
            <option value="">{t("vot.f.post.none")}</option>
            {#each data.posts as p (p.id)}
              <option value={p.id}>{p.title}, {p.organ}{p.zoneName ? ` (${p.zoneName})` : ""}</option>
            {/each}
          </select>
          <small>{t("vot.f.post.hint")}</small>
        </label>
      {/if}
    </section>

    {#if kind === "post"}
      <fieldset class="block">
        <legend>{t("vot.f.method")}</legend>
        <div class="tiles">
          {#each METHODS as m (m.id)}
            {@const locked = m.advanced && !data.advanced}
            <label class="tile" class:on={method === m.id} class:locked>
              <input type="radio" name="method" value={m.id} bind:group={method} disabled={locked} />
              <span class="tile-title">{tk(`vot.method.${m.id}`)}</span>
              <span class="tile-hint">{tk(`vot.method.${m.id}.hint`)}</span>
              {#if locked}<span class="lock">{lockedText}</span>{/if}
            </label>
          {/each}
        </div>
        {#if method === "list"}
          <div class="narrow">
            <Field label={t("vot.f.seats")} name="seats" type="number" min="2" max="50" value="3" inputmode="numeric" />
          </div>
        {/if}
      </fieldset>
    {:else}
      <input type="hidden" name="method" value="yes_no" />
    {/if}

    <section class="block">
      <h2>{t("vot.new.calendar")}</h2>
      <p class="lead">{t("vot.new.calendar.lead")}</p>
      <div class="pair">
        <DateTimeField label={t("vot.f.opens")} name="opensAt" required labels={dtLabels} />
        <DateTimeField label={t("vot.f.closes")} name="closesAt" required labels={dtLabels} />
      </div>
      {#if data.advanced}
        <div class="pair">
          {#if kind === "post"}
            <div>
              <DateTimeField label={t("vot.f.candidacies")} name="candidaciesCloseAt" labels={dtLabels} />
              <small class="hint">{t("vot.f.candidacies.hint")}</small>
            </div>
          {/if}
          <div>
            <DateTimeField label={t("vot.f.contestations")} name="contestationsCloseAt" labels={dtLabels} />
            <small class="hint">{t("vot.f.contestations.hint")}</small>
          </div>
        </div>
      {:else}
        <p class="lock">{t("vot.f.candidacies")}, {t("vot.f.contestations").toLowerCase()} : {lockedText}</p>
      {/if}
    </section>

    <section class="block">
      <h2>{t("vot.new.rules")}</h2>
      <div class="pair">
        <Field
          label={t("vot.f.quorum")}
          hint={t("vot.f.quorum.hint")}
          name="quorumPercent"
          type="number"
          min="1"
          max="100"
          inputmode="numeric"
        />
        {#if kind === "post"}
          <Field
            label={t("vot.f.threshold")}
            hint={t("vot.f.threshold.hint")}
            name="validityThresholdPercent"
            type="number"
            min="1"
            max="100"
            inputmode="numeric"
          />
        {/if}
      </div>
      <input type="hidden" name="allowBlank" value={allowBlank ? "on" : ""} />
      <Switch
        label={t("vot.f.blank")}
        description={t("vot.f.blank.hint")}
        bind:checked={allowBlank}
        onLabel={t("common.yes")}
        offLabel={t("common.no")}
      />
    </section>

    {#snippet conditions(prefix: string)}
      {#if data.statuses.length}
        <fieldset class="checks">
          <legend>{t("vot.r.status")}</legend>
          <small>{t("vot.r.status.hint")}</small>
          <div class="chips">
            {#each data.statuses as s (s.id)}
              <label class="chip"><input type="checkbox" name="{prefix}Status" value={s.id} />{label(s.label)}</label>
            {/each}
          </div>
        </fieldset>
      {/if}
      <label class="check">
        <input type="checkbox" name="{prefix}Dues" />
        <span>
          <strong>{t("vot.r.dues")}</strong>
          <small>{t("vot.r.dues.hint")}</small>
        </span>
      </label>
      <label class="area narrow">
        <span>{t("vot.r.joined")}</span>
        <input type="date" name="{prefix}Joined" />
        <small>{t("vot.r.joined.hint")}</small>
      </label>
      {#if data.organs.length}
        <label class="area">
          <span>{t("vot.r.organ")}</span>
          <select name="{prefix}Organ">
            <option value="">{t("vot.r.organ.any")}</option>
            {#each data.organs as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
          </select>
        </label>
      {/if}
    {/snippet}

    <section class="block">
      <h2>{t("vot.f.electorate")}</h2>
      <p class="lead">{t("vot.f.electorate.lead")}</p>
      {@render conditions("rule")}
    </section>

    {#if kind === "post"}
      <section class="block">
        <h2>{t("vot.f.eligibility")}</h2>
        <p class="lead">{t("vot.f.eligibility.lead")}</p>
        {@render conditions("elig")}
      </section>
    {/if}

    <footer class="actions">
      {#if form?.code}<p class="error" role="alert">{tk(`error.${form.code}`)}</p>{/if}
      <p class="lead">{t("vot.new.next")}</p>
      <div class="row">
        <Button type="submit" {pending}>{t("vot.new.submit")}</Button>
        <a class="ghost" href={resolve("/admin/votes")}>{t("common.cancel")}</a>
      </div>
    </footer>
  </form>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
    padding: var(--s-6) var(--s-8) var(--s-10);
    max-width: 880px;
  }
  .crumb {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    text-decoration: none;
  }
  .crumb:hover {
    text-decoration: underline;
  }
  h1 {
    margin: var(--s-2) 0 0;
    font: 600 var(--fs-32) / 1.12 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }
  .block {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    padding: var(--s-5);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
    min-width: 0;
  }
  h2,
  legend {
    margin: 0;
    padding: 0;
    font: 600 var(--fs-19) / 1.25 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  fieldset.block legend {
    float: left;
    width: 100%;
    margin-bottom: var(--s-4);
  }
  fieldset.block legend + * {
    clear: both;
  }
  .lead {
    margin: 0;
    color: var(--c-ink-2);
    font-size: var(--fs-14);
    line-height: 1.5;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--s-3);
  }
  .tiles.two {
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }
  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    padding: var(--s-4);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    cursor: pointer;
    min-height: 44px;
  }
  .tile input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .tile:has(input:focus-visible) {
    box-shadow: var(--focus-ring);
  }
  /* Carte choisie : inversée, encre et anneau pétrole. */
  .tile.on {
    background: var(--c-ink);
    color: var(--c-surface);
    border-color: var(--c-ink);
    box-shadow: 0 0 0 2px var(--c-primary);
  }
  .tile.on .tile-hint {
    color: var(--c-line);
  }
  .tile.locked {
    cursor: not-allowed;
    border-style: dashed;
    background: var(--c-paper);
  }
  .tile-title {
    font: 600 var(--fs-16) / 1.3 var(--font-ui);
  }
  .tile-hint {
    font-size: var(--fs-13);
    line-height: 1.45;
    color: var(--c-ink-2);
  }
  .lock {
    margin: 0;
    font-size: var(--fs-13);
    font-weight: 600;
    color: var(--c-warning-text);
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: var(--s-4);
    align-items: start;
  }
  .narrow {
    max-width: 260px;
  }
  .area {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    font: 600 var(--fs-14) / 1.3 var(--font-ui);
  }
  .area small,
  .hint,
  .checks small {
    display: block;
    font-weight: 400;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .hint {
    margin-top: var(--s-2);
  }
  textarea,
  select,
  input[type="date"] {
    min-height: 44px;
    padding: var(--s-2) var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 400 var(--fs-15) / 1.4 var(--font-ui);
  }
  textarea {
    resize: vertical;
  }
  textarea:focus-visible,
  select:focus-visible,
  input[type="date"]:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .checks {
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .checks legend {
    font: 600 var(--fs-14) / 1.3 var(--font-ui);
    letter-spacing: 0;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  .chip {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    padding: 0 var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
    font-size: var(--fs-14);
    cursor: pointer;
  }
  .chip:has(input:checked) {
    border-color: var(--c-primary);
    background: var(--c-primary-tint);
  }
  .check {
    display: flex;
    gap: var(--s-3);
    align-items: flex-start;
    min-height: 44px;
    cursor: pointer;
  }
  .check input {
    margin-top: 3px;
    width: 18px;
    height: 18px;
    accent-color: var(--c-primary);
  }
  .check span {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--fs-14);
  }
  .check small {
    color: var(--c-ink-2);
    font-size: var(--fs-13);
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
    align-items: center;
  }
  .ghost {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--s-4);
    color: var(--c-ink);
    font: 600 var(--fs-14) / 1 var(--font-ui);
    text-decoration: none;
  }
  .error {
    margin: 0;
    color: var(--c-danger-text);
    font-size: var(--fs-14);
  }
  @media (max-width: 760px) {
    main {
      padding: var(--s-5) var(--s-4) var(--s-8);
    }
  }
</style>
