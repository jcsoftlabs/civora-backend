<!--
  Fiche membre en panneau latéral (ADH-02, ADH-06) : on la consulte et on la modifie sans quitter la liste.
  En tête, l'objet du militantisme : la carte de membre aux couleurs du parti (ou la demande d'adhésion à traiter).
  Deux onglets : Profil (contact, localisation, classement) et Cotisations (relevé de l'année).
-->
<script lang="ts">
  import { enhance } from "$app/forms";
  import { Badge, Button, Field, MemberCard, SidePanel } from "@civora/ui";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { DuesStatement, MemberDetail } from "./+page.server";

  interface Props {
    member: MemberDetail;
    dues: DuesStatement | null;
    party: { name: string; brandColor: string; brandColorSecondary: string | null; logoUrl: string | null };
    statuses: Array<{ id: string; label: { fr: string; ht?: string } }>;
    permissions: string[];
    locale: "fr" | "ht";
    form: { ok?: boolean; done?: "saved" | "approved" | "rejected"; code?: string } | null;
    onclose: () => void;
  }
  let { member: m, dues: statement, party, statuses, permissions, locale, form, onclose }: Props = $props();
  const t = $derived(translator(locale));
  const tk = (k: string) => t(k as MessageKey);
  const label = (l: { fr: string; ht?: string } | null) => (l ? (locale === "ht" && l.ht ? l.ht : l.fr) : "");

  let open = $state(true);
  let tab = $state<"profile" | "dues">("profile");
  let rejecting = $state(false);
  let pending = $state(false);
  // Relevé de cotisations : seulement pour un membre validé, et si le poste le permet.
  const dues = $derived(m.applicationState === "approved" ? statement : null);
  const canWrite = $derived(permissions.includes("members.write"));
  const canApprove = $derived(permissions.includes("members.approve"));
  const error = $derived(form?.code ? tk(`error.${form.code}`) : null);
  const name = $derived(`${m.firstName} ${m.lastName}`);

  const dateFmt = $derived(new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }));
  const monthFmt = $derived(new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }));
  const date = (d: string | null) => (d ? dateFmt.format(new Date(d)) : t("admin.sheet.none"));
  const place = $derived(
    // Racines (Haïti, Diaspora) omises : le département ou le pays de résidence ouvre le chemin.
    m.location
      .filter((z) => z.level !== "pays" && z.level !== "diaspora")
      .map((z) => (locale === "ht" && z.nameHt) || z.name),
  );
  const section = $derived(place.at(-1) ?? "");
  const money = (amount: string, currency: string) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      currencyDisplay: currency === "HTG" ? "code" : "symbol",
    }).format(Number(amount));
  const tone = { paid: "success", upcoming: "neutral", due: "warning", late: "danger" } as const;

  const submit = () => {
    pending = true;
    return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
      await update({ reset: false });
      pending = false;
      rejecting = false;
    };
  };
</script>

<SidePanel bind:open title={format(t("admin.sheet.title"), { name })} closeLabel={t("admin.sheet.close")} {onclose}>
  <div class="sheet">
    {#if m.applicationState === "approved"}
      <div class="card">
        <MemberCard
          partyName={party.name}
          brandColor={party.brandColor}
          secondaryColor={party.brandColorSecondary}
          logoUrl={party.logoUrl}
          memberName={name}
          memberNumber={m.memberNumber}
          location={section}
          year={m.joinedAt ? String(new Date(m.joinedAt).getFullYear()) : undefined}
          labels={{ card: t("admin.sheet.card"), number: t("create.card.number") }}
          shineKey={m.id}
        />
      </div>
    {:else if m.applicationState === "pending"}
      <section class="application" aria-labelledby="application-title">
        <h3 id="application-title">{t("admin.sheet.application")}</h3>
        <p>{t("admin.sheet.application.lead")}</p>
        <p class="meta">{t("admin.sheet.requested")} {date(m.createdAt)}</p>
        {#if canApprove}
          {#if !rejecting}
            <form method="POST" action="?/approve" use:enhance={submit} class="decide">
              <input type="hidden" name="id" value={m.id} />
              <Field
                label={t("admin.sheet.score")}
                hint={t("admin.sheet.score.hint")}
                name="score"
                type="number"
                min="0"
                max="100"
                inputmode="numeric"
                value={m.applicationScore === null ? "" : String(m.applicationScore)}
              />
              <div class="row">
                <Button type="submit" {pending}>{t("admin.sheet.approve")}</Button>
                <Button variant="secondary" onclick={() => (rejecting = true)}>{t("admin.sheet.reject")}</Button>
              </div>
            </form>
          {:else}
            <form method="POST" action="?/reject" use:enhance={submit} class="decide">
              <input type="hidden" name="id" value={m.id} />
              <label class="area">
                <span>{t("admin.sheet.reject.reason")}</span>
                <textarea name="reason" rows="3" maxlength="500"></textarea>
                <small>{t("admin.sheet.reject.hint")}</small>
              </label>
              <div class="row">
                <Button type="submit" variant="ink" {pending}>{t("admin.sheet.reject.confirm")}</Button>
                <Button variant="ghost" onclick={() => (rejecting = false)}>{t("common.cancel")}</Button>
              </div>
            </form>
          {/if}
        {/if}
      </section>
    {:else}
      <section class="application rejected">
        <h3>{t("admin.sheet.rejected")}</h3>
        <p>{t("admin.sheet.rejectedLead")}</p>
      </section>
    {/if}

    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if form?.ok}<p class="saved" role="status">{tk(`admin.sheet.${form.done ?? "saved"}`)}</p>{/if}

    {#if dues}
      <div class="tabs" role="tablist" aria-label={t("admin.sheet.tabs")}>
        {#each ["profile", "dues"] as const as id (id)}
          <button
            type="button"
            role="tab"
            id="tab-{id}"
            aria-selected={tab === id}
            aria-controls="panel-{id}"
            onclick={() => (tab = id)}
          >
            {tk(`admin.sheet.tab.${id}`)}
            {#if id === "dues"}
              <span class="dot" class:late={!dues.upToDate} aria-hidden="true"></span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if tab === "profile" || !dues}
      <div id="panel-profile" role={dues ? "tabpanel" : undefined} aria-labelledby={dues ? "tab-profile" : undefined}>
        <dl>
          <div>
            <dt>{t("admin.sheet.email")}</dt>
            <dd>{m.email ?? t("admin.sheet.none")}</dd>
          </div>
          <div>
            <dt>{t("admin.sheet.phone")}</dt>
            <dd class="num">{m.phone ?? t("admin.sheet.none")}</dd>
          </div>
          <div>
            <dt>{t("admin.sheet.place")}</dt>
            <dd>{place.join(" › ")}</dd>
          </div>
          {#if m.isDiaspora && m.residenceCountry}
            <div>
              <dt>{t("admin.sheet.country")}</dt>
              <dd>{m.residenceCountry}</dd>
            </div>
          {/if}
          <div>
            <dt>{t("admin.sheet.birth")}</dt>
            <dd>{date(m.birthDate)}</dd>
          </div>
          <div>
            <dt>{t(m.joinedAt ? "admin.sheet.since" : "admin.sheet.requested")}</dt>
            <dd>{date(m.joinedAt ?? m.createdAt)}</dd>
          </div>
          {#if m.referent}
            <div>
              <dt>{t("admin.sheet.referent")}</dt>
              <dd>{m.referent.firstName} {m.referent.lastName} <span class="muted num">{m.referent.number}</span></dd>
            </div>
          {/if}
          {#if m.identities.length}
            <div>
              <dt>{t("admin.sheet.identities")}</dt>
              <dd>
                <span class="ids">
                  {#each m.identities as id (id.id)}<Badge>{tk(`admin.sheet.id.${id.kind}`)}</Badge>{/each}
                </span>
                <small>{t("admin.sheet.identities.hint")}</small>
              </dd>
            </div>
          {/if}
        </dl>

        {#if canWrite}
          <form method="POST" action="?/update" use:enhance={submit} class="edit" id="sheet-edit">
            <h3>{t("admin.sheet.edit")}</h3>
            <input type="hidden" name="id" value={m.id} />
            <label class="select">
              <span>{t("admin.sheet.status")}</span>
              <select name="statusId" value={m.statusId ?? ""}>
                <option value="">{t("admin.sheet.noStatus")}</option>
                {#each statuses as s (s.id)}<option value={s.id}>{label(s.label)}</option>{/each}
              </select>
            </label>
            <Field
              label={t("admin.sheet.category")}
              hint={t("admin.sheet.category.hint")}
              name="category"
              maxlength={60}
              value={m.category ?? ""}
            />
            <Field
              label={t("admin.sheet.tags")}
              hint={t("admin.sheet.tags.hint")}
              name="tags"
              value={m.tags.join(", ")}
            />
            <div class="row end">
              <Button variant="ghost" onclick={() => (open = false)}>{t("common.cancel")}</Button>
              <Button type="submit" {pending}>{t("common.save")}</Button>
            </div>
          </form>
        {/if}
      </div>
    {:else}
      <div id="panel-dues" role="tabpanel" aria-labelledby="tab-dues">
        {#if dues.obligations.length === 0}
          <div class="empty">
            <h3>{t("admin.sheet.dues.empty")}</h3>
            <p>{t("admin.sheet.dues.emptyLead")}</p>
          </div>
        {:else}
          <div class="balance">
            <Badge tone={dues.upToDate ? "success" : "danger"}>
              {t(dues.upToDate ? "admin.sheet.dues.upToDate" : "admin.sheet.dues.late")}
            </Badge>
            <div>
              <span class="muted">{t("admin.sheet.dues.outstanding")}</span>
              <strong class="amount">
                {Object.keys(dues.outstanding).length
                  ? Object.entries(dues.outstanding)
                      .map(([c, a]) => money(a, c))
                      .join(" + ")
                  : t("admin.sheet.dues.nothing")}
              </strong>
            </div>
          </div>
          <h3 class="list-title">{t("admin.sheet.dues.list")}</h3>
          <ol class="obligations">
            {#each [...dues.obligations].reverse() as o (o.id)}
              <li>
                <span class="period">
                  <span class="month">{monthFmt.format(new Date(`${o.periodStart}T12:00:00Z`))}</span>
                  <span class="muted">
                    {label(o.planName)} ·
                    {o.paidAt
                      ? format(t("admin.sheet.dues.paidOn"), { date: date(o.paidAt) })
                      : format(t("admin.sheet.dues.dueOn"), { date: date(`${o.dueDate}T12:00:00Z`) })}
                  </span>
                </span>
                <span class="right">
                  <span class="num">{money(o.amount, o.currency)}</span>
                  <Badge tone={tone[o.state]}>{tk(`admin.sheet.dues.state.${o.state}`)}</Badge>
                </span>
              </li>
            {/each}
          </ol>
        {/if}
      </div>
    {/if}
  </div>
</SidePanel>

<style>
  .sheet {
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
  }
  .card {
    padding: var(--s-2) var(--s-2) var(--s-4);
  }
  .application {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding: var(--s-5);
    border-radius: var(--r-lg);
    background: var(--c-warning-tint);
    border: 1px dashed var(--c-warning);
  }
  .application.rejected {
    background: var(--c-danger-tint);
    border-color: var(--c-danger);
  }
  h3 {
    margin: 0;
    font: 700 var(--fs-19) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .application p {
    margin: 0;
    line-height: 1.5;
  }
  .meta,
  .muted,
  small {
    color: var(--c-ink-2);
    font-size: var(--fs-13);
  }
  .decide,
  .edit {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  .row.end {
    justify-content: flex-end;
  }
  .area,
  .select {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .area small {
    font-weight: 400;
  }
  textarea,
  select {
    min-height: 44px;
    padding: var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 400 var(--fs-15) / 1.4 var(--font-ui);
  }
  textarea:focus-visible,
  select:focus-visible,
  .tabs button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .error,
  .saved {
    margin: 0;
    padding: var(--s-3) var(--s-4);
    border-radius: var(--r-md);
    font-size: var(--fs-14);
  }
  .error {
    background: var(--c-danger-tint);
    color: var(--c-danger-text);
  }
  .saved {
    background: var(--c-success-tint);
    color: var(--c-success-text);
  }
  .tabs {
    display: flex;
    gap: var(--s-1);
    padding: 4px;
    border-radius: var(--r-pill);
    background: var(--c-paper);
  }
  .tabs button {
    flex: 1;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--s-2);
    border: 0;
    border-radius: var(--r-pill);
    background: transparent;
    color: var(--c-ink-2);
    font: 600 var(--fs-14) / 1 var(--font-ui);
    cursor: pointer;
  }
  .tabs button[aria-selected="true"] {
    background: var(--c-surface);
    color: var(--c-ink);
    box-shadow: 0 1px 2px color-mix(in srgb, var(--c-ink) 12%, transparent);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c-success);
  }
  .dot.late {
    background: var(--c-danger);
  }
  dl {
    margin: 0;
    display: flex;
    flex-direction: column;
  }
  dl > div {
    display: grid;
    grid-template-columns: 140px minmax(0, 1fr);
    gap: var(--s-3);
    padding: var(--s-3) 0;
    border-bottom: 1px solid var(--c-line-soft);
  }
  dt {
    color: var(--c-ink-2);
    font-size: var(--fs-14);
  }
  dd {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    overflow-wrap: anywhere;
  }
  .ids {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-1);
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  .edit {
    margin-top: var(--s-5);
    padding-top: var(--s-5);
    border-top: 1px solid var(--c-line);
  }
  .balance {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-4);
    padding: var(--s-4) var(--s-5);
    border-radius: var(--r-lg);
    background: var(--c-paper);
  }
  .balance > div {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }
  .amount {
    font: 800 var(--fs-22) / 1.1 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .list-title {
    margin-top: var(--s-5);
  }
  .obligations {
    margin: var(--s-2) 0 0;
    padding: 0;
    list-style: none;
  }
  .obligations li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    padding: var(--s-3) 0;
    border-bottom: 1px solid var(--c-line-soft);
  }
  .period {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .month {
    font-weight: 600;
    text-transform: capitalize;
  }
  .right {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    flex: none;
  }
  .empty {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .empty p {
    margin: 0;
    color: var(--c-ink-2);
  }
  @media (max-width: 480px) {
    dl > div {
      grid-template-columns: 1fr;
      gap: var(--s-1);
    }
  }
</style>
