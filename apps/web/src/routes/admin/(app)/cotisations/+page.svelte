<!--
  Cotisations et paiements (FIN-03, FIN-05, FIN-10, FIN-12) : bande de chiffres clés (encaissé ce mois et le
  mois précédent, membres à jour), puis trois vues : journal des paiements avec reçus, formules de cotisation,
  comptes de paiement du parti. « Encaisser en espèces » ouvre le panneau de saisie avec reçu.
-->
<script lang="ts">
  import { organizationKind } from "$lib/i18n/org";
  import { partyFormat } from "$lib/datetime";
  import { page, navigating } from "$app/state";
  import { goto } from "$app/navigation";
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";
  import { Badge, Button, DataTable, Field } from "@civora/ui";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { ActionData, PageData } from "./$types";
  import CashPanel from "./CashPanel.svelte";
  import PlanPanel from "./PlanPanel.svelte";

  let { data, form }: { data: PageData & { locale: "fr" | "ht" }; form: ActionData } = $props();
  const orgKind = organizationKind();
  const t = $derived(translator(data.locale, orgKind()));
  const tk = (k: string) => t(k as MessageKey);
  const base = resolve("/admin/cotisations");
  const can = (p: string) => data.me.permissions.includes(p);
  const params = $derived(page.url.searchParams);

  /** Adresse de la vue avec des paramètres changés ; les panneaux se ferment sauf mention contraire. */
  function href(changes: Record<string, string | null>, keep: string[] = ["vue", "status", "provider"]) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const p = new URLSearchParams();
    for (const k of keep) {
      const v = params.get(k);
      if (v) p.set(k, v);
    }
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    const qs = p.toString().replace(/=(&|$)/g, "$1");
    return `${base}${qs ? `?${qs}` : ""}`;
  }
  const go = (changes: Record<string, string | null>, keep?: string[]) =>
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    goto(href(changes, keep), { noScroll: true, keepFocus: true });

  const money = (amount: string, currency: string) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      currencyDisplay: currency === "HTG" ? "code" : "symbol",
    }).format(Number(amount));
  const dateFmt = $derived(partyFormat({ day: "numeric", month: "short", year: "numeric" }));
  /** « 01-31 » devient « 31 janvier ». */
  const dayMonth = (mmdd: string | null) => {
    const [m, d] = (mmdd ?? "").split("-").map(Number);
    if (!m || !d) return mmdd ?? "";
    return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, m - 1, d)),
    );
  };
  const label = (l: { fr: string; ht?: string }) => (data.locale === "ht" && l.ht ? l.ht : l.fr);
  const totals = (rows: Array<{ currency: string; total: string }>) =>
    rows.length ? rows.map((r) => money(r.total, r.currency)).join(" + ") : t("admin.dues.kpi.none");
  const count = (rows: Array<{ count: number }>) => rows.reduce((n, r) => n + r.count, 0);
  const rate = $derived.by(() => {
    const m = data.summary?.members;
    if (!m || m.upToDate + m.late === 0) return null;
    return Math.round((m.upToDate / (m.upToDate + m.late)) * 100);
  });

  const views = $derived(
    [
      { id: "paiements", label: t("admin.dues.view.payments"), visible: can("payments.read") },
      { id: "formules", label: t("admin.dues.view.plans"), visible: can("dues.manage") || can("payments.read") },
      { id: "comptes", label: t("admin.dues.view.accounts"), visible: can("settings.party") || can("payments.read") },
    ].filter((v) => v.visible),
  );
  const tone = { succeeded: "success", pending: "warning", failed: "danger", refunded: "neutral" } as const;
  const columns = $derived([
    { key: "member", label: t("admin.dues.col.member") },
    { key: "amount", label: t("admin.dues.col.amount"), align: "end" as const, numeric: true },
    { key: "method", label: t("admin.dues.col.method") },
    { key: "status", label: t("admin.dues.col.status") },
    { key: "date", label: t("admin.dues.col.date") },
    { key: "receipt", label: t("admin.dues.col.receipt"), align: "end" as const },
  ]);
  const loading = $derived(!!navigating.to && navigating.to.url.pathname === page.url.pathname);
  const filtered = $derived(params.has("status") || params.has("provider"));

  const f = $derived(form as { ok?: boolean; done?: string; code?: string; n?: number } | null);
  const message = $derived(
    f?.code && !data.cashing && !data.planPanel
      ? { bad: true, text: tk(`error.${f.code}`) }
      : f?.done === "generated"
        ? { bad: false, text: format(t("admin.plans.generated"), { n: String(f.n ?? 0) }) }
        : f?.done === "accountSaved"
          ? { bad: false, text: t("admin.accounts.saved") }
          : null,
  );
  let pending = $state<string | null>(null);
  const submit = (key: string) => () => {
    pending = key;
    return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
      await update();
      pending = null;
    };
  };
  const PROVIDERS = ["moncash", "natcash", "kashpaw"] as const;
</script>

<div class="section">
  <aside class="views" aria-label={t("admin.dues.views")}>
    <p class="views-title">{t("admin.nav.dues")}</p>
    <ul>
      {#each views as v (v.id)}
        <li>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
          <a href={href({ vue: v.id }, [])} aria-current={data.view === v.id ? "page" : undefined}>{v.label}</a>
        </li>
      {/each}
    </ul>
  </aside>

  <main>
    <header class="head">
      <div>
        <p class="crumb">{data.party.name}</p>
        <h1>{t("admin.dues.title")}</h1>
      </div>
      {#if can("payments.recordCash")}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <Button href={href({ encaisser: "" })}>{t("admin.dues.cash")}</Button>
      {/if}
    </header>

    {#if data.summary}
      <!-- Chiffres clés : une seule bande découpée par des filets, pas de cartes identiques. -->
      <dl class="kpis">
        <div>
          <dt>{t("admin.dues.kpi.month")}</dt>
          <dd class="big">{totals(data.summary.currentMonth)}</dd>
          <dd class="sub">
            {count(data.summary.currentMonth) === 1
              ? t("admin.dues.kpi.countOne")
              : format(t("admin.dues.kpi.count"), { n: String(count(data.summary.currentMonth)) })}
          </dd>
        </div>
        <div>
          <dt>{t("admin.dues.kpi.previous")}</dt>
          <dd class="big muted-num">{totals(data.summary.previousMonth)}</dd>
          <dd class="sub">
            {format(t("admin.dues.kpi.count"), { n: String(count(data.summary.previousMonth)) })}
          </dd>
        </div>
        <div>
          <dt>{t("admin.dues.kpi.upToDate")}</dt>
          <dd class="big">{rate === null ? t("admin.dues.kpi.none") : `${rate} %`}</dd>
          {#if rate !== null}
            <dd class="meter" aria-hidden="true"><span style:width="{rate}%"></span></dd>
            <dd class="sub">{format(t("admin.dues.kpi.late"), { n: String(data.summary.members.late) })}</dd>
          {/if}
        </div>
      </dl>
    {/if}

    {#if message}<p class="msg" class:bad={message.bad} role="status">{message.text}</p>{/if}

    {#if data.view === "paiements"}
      <div class="bar">
        <label class="pill">
          <span>{t("admin.dues.filter.status")}</span>
          <select value={params.get("status") ?? ""} onchange={(e) => go({ status: e.currentTarget.value || null })}>
            <option value="">{t("admin.dues.filter.anyStatus")}</option>
            {#each ["succeeded", "pending", "failed", "refunded"] as s (s)}
              <option value={s}>{tk(`admin.dues.status.${s}`)}</option>
            {/each}
          </select>
        </label>
        <label class="pill">
          <span>{t("admin.dues.filter.method")}</span>
          <select
            value={params.get("provider") ?? ""}
            onchange={(e) => go({ provider: e.currentTarget.value || null })}
          >
            <option value="">{t("admin.dues.filter.anyMethod")}</option>
            {#each ["cash", "moncash", "natcash", "kashpaw"] as p (p)}
              <option value={p}>{tk(`admin.dues.method.${p}`)}</option>
            {/each}
          </select>
        </label>
      </div>

      <DataTable
        caption={t("admin.dues.caption")}
        {columns}
        rows={data.payments}
        {loading}
        loadingLabel={t("admin.dues.loading")}
      >
        {#snippet cell(p, col)}
          {#if col.key === "member"}
            <span class="who">
              <span class="name">{p.firstName} {p.lastName}</span>
              <span class="sub">{p.memberNumber} · {tk(`admin.dues.kind.${p.kind}`)}</span>
            </span>
          {:else if col.key === "amount"}
            <strong class="amount">{money(p.amount, p.currency)}</strong>
          {:else if col.key === "method"}
            <span class="method" class:cash={p.provider === "cash"}>{tk(`admin.dues.method.${p.provider}`)}</span>
          {:else if col.key === "status"}
            <Badge tone={tone[p.status]}>{tk(`admin.dues.status.${p.status}`)}</Badge>
          {:else if col.key === "date"}
            <span class="date">{dateFmt.format(new Date(p.confirmedAt ?? p.createdAt))}</span>
          {:else if col.key === "receipt"}
            {#if p.receiptId}
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
              <a
                class="receipt"
                href="{base}/recu/{p.receiptId}"
                data-sveltekit-reload
                aria-label={format(t("admin.dues.receipt.download"), { number: p.receiptNumber ?? "" })}
              >
                {p.receiptNumber}
              </a>
            {/if}
          {/if}
        {/snippet}
        {#snippet empty()}
          <div class="empty">
            <h2>{t(filtered ? "admin.dues.empty.filtered" : "admin.dues.empty.title")}</h2>
            {#if !filtered}<p>{t("admin.dues.empty.lead")}</p>{/if}
          </div>
        {/snippet}
      </DataTable>
      {#if data.payments.length === 50}
        <div>
          <Button variant="secondary" href={href({ before: data.payments.at(-1)!.createdAt })}
            >{t("admin.dues.more")}</Button
          >
        </div>
      {/if}
    {:else if data.view === "formules"}
      <div class="bar end">
        {#if can("dues.manage")}
          <form method="POST" action="?/generate" use:enhance={submit("generate")} class="generate">
            <Button type="submit" variant="ghost" pending={pending === "generate"}>{t("admin.plans.generate")}</Button>
          </form>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
          <Button variant="secondary" href={href({ vue: "formules", formule: "nouvelle" }, [])}
            >{t("admin.plans.create")}</Button
          >
        {/if}
      </div>
      {#if data.plans.length === 0}
        <section class="empty boxed">
          <h2>{t("admin.plans.empty.title")}</h2>
          <p>{t("admin.plans.empty.lead")}</p>
        </section>
      {:else}
        <ul class="plans">
          {#each data.plans as p (p.id)}
            <li class:inactive={!p.active}>
              <div class="plan-top">
                <span class="plan-name">{label(p.name)}</span>
                <span class="tags">
                  {#if p.isDefault}<Badge tone="primary">{t("admin.plans.default")}</Badge>{/if}
                  {#if !p.active}<Badge>{t("admin.plans.inactive")}</Badge>{/if}
                </span>
              </div>
              <p class="plan-amount">
                <strong>{money(p.amount, p.currency)}</strong>
                <span>{tk(`admin.plan.period.${p.periodicity}`)}</span>
              </p>
              <p class="sub">
                {p.dueRule === "fixed"
                  ? format(t("admin.plans.due.fixed"), { day: dayMonth(p.fixedDueDay) })
                  : t("admin.plans.due.anniversary")}
                · {format(t("admin.plans.grace"), { n: String(p.graceDays) })}
              </p>
              <div class="plan-foot">
                <span class="sub">{format(t("admin.plans.subscribers"), { n: String(p.subscribers) })}</span>
                {#if can("dues.manage")}
                  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
                  <a class="edit" href={href({ vue: "formules", formule: p.id }, [])}>{t("admin.plans.edit")}</a>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
        {#if can("dues.manage")}<p class="sub">{t("admin.plans.generate.hint")}</p>{/if}
      {/if}
    {:else}
      <section class="boxed accounts">
        <p class="lead">{t("admin.accounts.lead")}</p>
        {#if data.accounts.length === 0}<p class="sub">{t("admin.accounts.empty")}</p>{/if}
        <ul>
          {#each data.accounts as a (a.id)}
            <li>
              <span class="provider">{tk(`admin.dues.method.${a.provider}`)}</span>
              <span class="sub">{a.currency}</span>
              <Badge tone={a.active ? "success" : "neutral"}>
                {t(a.active ? "admin.accounts.active" : "admin.accounts.inactive")}
              </Badge>
              {#if can("settings.party")}
                <form method="POST" action="?/toggleAccount" use:enhance={submit(a.id)}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="active" value={String(!a.active)} />
                  <Button type="submit" size="sm" variant="ghost" pending={pending === a.id}>
                    {t(a.active ? "admin.accounts.disable" : "admin.accounts.enable")}
                  </Button>
                </form>
              {/if}
            </li>
          {/each}
        </ul>
        {#if can("settings.party")}
          <form method="POST" action="?/addAccount" use:enhance={submit("addAccount")} class="add-account">
            <h2>{t("admin.accounts.add")}</h2>
            <label class="select">
              <span>{t("admin.accounts.provider")}</span>
              <select name="provider">
                {#each PROVIDERS as p (p)}<option value={p}>{tk(`admin.dues.method.${p}`)}</option>{/each}
              </select>
            </label>
            <Field
              label={t("admin.accounts.ref")}
              hint={t("admin.accounts.ref.hint")}
              name="credentialsRef"
              required
              pattern={"env:[A-Z0-9_]{3,100}"}
              placeholder="env:MONCASH_PARTI"
              autocomplete="off"
              spellcheck={false}
            />
            <div>
              <Button type="submit" variant="secondary" pending={pending === "addAccount"}
                >{t("admin.accounts.add")}</Button
              >
            </div>
          </form>
        {/if}
      </section>
    {/if}
  </main>
</div>

{#if data.cashing}
  {#key data.cash?.member.id ?? "none"}
    <CashPanel
      cash={data.cash}
      locale={data.locale}
      form={(form as { ok?: boolean; done?: string; code?: string; receipt?: { id: string; number: string } } | null) ??
        null}
      receiptBase="{base}/recu"
      onpick={(id) => go({ encaisser: "", membre: id })}
      onreset={() => go({ encaisser: "" })}
      onclose={() => go({ encaisser: null, membre: null })}
    />
  {/key}
{/if}

{#if data.planPanel}
  {#key data.planPanel}
    <PlanPanel
      plan={data.plans.find((p) => p.id === data.planPanel) ?? null}
      locale={data.locale}
      form={(form as { ok?: boolean; done?: string; code?: string } | null) ?? null}
      onclose={() => go({ vue: "formules", formule: null }, [])}
    />
  {/key}
{/if}

<style>
  .section {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    min-height: 100dvh;
  }
  .views {
    padding: var(--s-6) var(--s-3);
    border-right: 1px solid var(--c-line);
    background: var(--c-surface);
  }
  .views-title {
    margin: 0 var(--s-3) var(--s-3);
    font: 600 var(--fs-19) / 1.1 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .views ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .views a {
    min-height: 40px;
    display: flex;
    align-items: center;
    padding: 0 var(--s-3);
    border-radius: var(--r-sm);
    color: var(--c-ink);
    text-decoration: none;
    font-size: var(--fs-14);
  }
  .views a:hover {
    background: var(--c-paper);
  }
  .views a[aria-current="page"] {
    background: var(--c-primary-tint);
    font-weight: 600;
  }
  main {
    min-width: 0;
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
  .kpis {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .kpis > div {
    padding: var(--s-5) var(--s-6);
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
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
  }
  .big {
    font: 600 var(--fs-26) / 1.1 var(--font-display);
    letter-spacing: var(--tracking-display);
    font-variant-numeric: tabular-nums;
  }
  .muted-num {
    color: var(--c-ink-2);
  }
  .meter {
    height: 6px;
    margin: var(--s-2) 0 var(--s-1);
    border-radius: var(--r-pill);
    background: var(--c-danger-tint);
    overflow: hidden;
  }
  .meter span {
    display: block;
    height: 100%;
    background: var(--c-success);
  }
  .sub {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
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
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-2);
  }
  .bar.end {
    justify-content: flex-end;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
    background: var(--c-surface);
    font-size: var(--fs-14);
  }
  .pill span {
    padding-left: var(--s-4);
    color: var(--c-ink-2);
  }
  .pill select {
    min-height: 42px;
    padding: 0 var(--s-4) 0 var(--s-2);
    border: 0;
    border-radius: var(--r-pill);
    background: transparent;
    color: var(--c-ink);
    font: 600 var(--fs-14) / 1 var(--font-ui);
  }
  .pill select:focus-visible,
  .views a:focus-visible,
  .receipt:focus-visible,
  .edit:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .who {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    font-weight: 600;
    white-space: nowrap;
  }
  .amount {
    font: 600 var(--fs-15) / 1.12 var(--font-display);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .method {
    font-size: var(--fs-14);
  }
  .method.cash {
    font-weight: 600;
  }
  .date {
    color: var(--c-ink-2);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .receipt {
    color: var(--c-ink);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    text-underline-offset: 3px;
  }
  .empty {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .empty h2,
  .add-account h2 {
    margin: 0;
    font: 600 var(--fs-22) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .empty p,
  .lead {
    margin: 0;
    color: var(--c-ink-2);
    line-height: 1.5;
  }
  .boxed {
    padding: var(--s-6);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .plans {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--s-4);
  }
  .plans li {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    padding: var(--s-5);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .plans li.inactive {
    border-style: dashed;
    background: var(--c-paper);
  }
  .plan-top,
  .plan-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
  }
  .plan-foot {
    margin-top: auto;
    padding-top: var(--s-3);
    border-top: 1px solid var(--c-line-soft);
  }
  .plan-name {
    font: 600 var(--fs-19) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .tags {
    display: flex;
    gap: var(--s-1);
  }
  .plan-amount {
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: var(--s-2);
  }
  .plan-amount strong {
    font: 600 var(--fs-26) / 1.12 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .plan-amount span {
    color: var(--c-ink-2);
    font-size: var(--fs-14);
  }
  .edit {
    color: var(--c-ink);
    font-size: var(--fs-14);
    font-weight: 600;
    text-underline-offset: 3px;
  }
  .accounts {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }
  .accounts ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .accounts li {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-3) 0;
    border-bottom: 1px solid var(--c-line-soft);
  }
  .provider {
    flex: 1;
    font-weight: 600;
  }
  .add-account {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    max-width: 520px;
    padding-top: var(--s-4);
  }
  .select {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .select select {
    min-height: 44px;
    padding: 0 var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 400 var(--fs-15) / 1 var(--font-ui);
  }
  @media (max-width: 1024px) {
    .section {
      grid-template-columns: minmax(0, 1fr);
    }
    .views {
      border-right: 0;
      border-bottom: 1px solid var(--c-line);
      padding: var(--s-3) var(--s-4);
    }
    .views-title {
      display: none;
    }
    .views ul {
      flex-direction: row;
      overflow-x: auto;
    }
    .views a {
      white-space: nowrap;
    }
    main {
      padding: var(--s-5) var(--s-4) var(--s-8);
    }
  }
  @media (max-width: 640px) {
    .kpis {
      grid-template-columns: minmax(0, 1fr);
    }
    .kpis > div + div {
      border-left: 0;
      border-top: 1px solid var(--c-line);
    }
  }
</style>
