<!--
  Fiche d'une organisation dans la console (SOC-10) : identité, abonnement, totaux (jamais un membre),
  fondateur à contacter, actions du propriétaire (activer, inviter, suspendre, formule, essai, Élections) et
  historique des actions de la console sur cette organisation.
-->
<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import { Badge, Button, Field } from "@civora/ui";
  import { formatDateTime, partyFormat } from "$lib/datetime";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import { bytes, money, num } from "$lib/console/format";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData & { locale: "fr" | "ht" }; form: ActionData } = $props();
  const t = $derived(translator(data.locale));
  const tk = (k: string) => t(k as MessageKey);
  /** Nombre accordé : clé `.one` pour un seul élément. */
  const cn = (key: string, n: number) => format(tk(n === 1 ? `${key}.one` : key), { n: num(n) });
  const o = $derived(data.org);
  const owner = $derived(page.data.staff?.role === "owner");
  const date = partyFormat({ day: "numeric", month: "long", year: "numeric" });
  const sub = $derived(o.totals?.subscription ?? null);
  const f = $derived(form as { ok?: boolean; done?: string; code?: string } | null);
  let pending = $state<string | null>(null);
  const submit = (key: string) => () => {
    pending = key;
    return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
      await update({ reset: false });
      pending = null;
    };
  };
  const electionsOn = $derived(!!o.electionsModuleUntil && new Date(o.electionsModuleUntil) > new Date());
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
<a class="back" href={resolve("/console/(app)/organisations")}>← {t("con.org.back")}</a>
<header class="head">
  <div>
    <h1>{o.name}</h1>
    <p class="meta">
      {tk(`create.kind.${o.kind}`)}, {tk(`plan.${o.tier}`)}
      {#if o.status === "pending"}
        <Badge tone="warning">{t("con.status.pending")}</Badge>
      {:else if sub}
        <Badge tone={sub.status === "active" ? "success" : sub.status === "trial" ? "accent" : "danger"}>
          {tk(`con.sub.${sub.status}`)}
        </Badge>
      {/if}
    </p>
  </div>
</header>

{#if f?.code}<p class="msg bad" role="alert">{tk(`error.${f.code}`)}</p>{/if}
{#if f?.ok && f.done}<p class="msg" role="status">{tk(`con.done.${f.done}`)}</p>{/if}

<div class="layout">
  <div class="main">
    <section class="panel">
      <dl class="facts">
        <div>
          <dt>{t("con.org.address")}</dt>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
          <dd><a href={o.address} target="_blank" rel="noopener">{o.address.replace(/^https?:\/\//, "")}</a></dd>
        </div>
        <div>
          <dt>{t("con.org.founder")}</dt>
          <dd>
            {o.founder?.name ?? t("admin.cert.preview.missing")}
            {#if o.founder?.email}<br /><a href="mailto:{o.founder.email}">{o.founder.email}</a>{/if}
          </dd>
        </div>
        <div>
          <dt>{t("con.org.created")}</dt>
          <dd>{date.format(new Date(o.createdAt))}</dd>
        </div>
        <div>
          <dt>{t("con.org.activated")}</dt>
          <dd>{o.activatedAt ? date.format(new Date(o.activatedAt)) : t("con.status.pending")}</dd>
        </div>
        {#if sub?.periodEnd}
          <div>
            <dt>{t("con.orgs.col.sub")}</dt>
            <dd>
              {format(t(sub.status === "trial" ? "con.org.trialEnds" : "con.org.periodEnds"), {
                d: date.format(new Date(sub.periodEnd)),
              })}
            </dd>
          </div>
        {/if}
        <div>
          <dt>{t("con.org.elections")}</dt>
          <dd>
            {electionsOn
              ? format(t("con.org.elections.until"), { d: date.format(new Date(o.electionsModuleUntil!)) })
              : t("con.org.elections.off")}
          </dd>
        </div>
      </dl>
    </section>

    {#if o.totals}
      <dl class="kpis">
        <div>
          <dt>{t("con.org.members")}</dt>
          <dd class="big">{num(o.totals.members)}</dd>
          <dd class="sub">{format(t("con.ov.members.sub"), { n: num(o.totals.newMembers30) })}</dd>
        </div>
        <div>
          <dt>{t("con.org.pending")}</dt>
          <dd class="big">{num(o.totals.pendingApplications)}</dd>
        </div>
        <div>
          <dt>{t("con.org.active")}</dt>
          <dd class="big">{num(o.totals.activeUsers30)}</dd>
        </div>
        <div>
          <dt>{t("con.org.storage")}</dt>
          <dd class="big">{bytes(o.totals.storageBytes)}</dd>
        </div>
      </dl>
      <section class="panel">
        <h2>{t("con.org.collected")}</h2>
        {#if o.totals.collected30.length}
          <ul class="money">
            {#each o.totals.collected30 as c (c.currency)}
              <li>
                <strong>{money(Number(c.total), c.currency)}</strong>
                <span class="muted">{cn("con.ov.payments", c.payments)}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted">{t("con.ov.collected.none")}</p>
        {/if}
        <p class="muted">
          {t("con.org.last")} :
          {o.totals.lastActivity ? formatDateTime(o.totals.lastActivity) : t("con.org.never")}
        </p>
      </section>
    {:else}
      <p class="panel muted">{t("con.org.pendingLead")}</p>
    {/if}

    <section class="panel">
      <h2>{t("con.org.history")}</h2>
      {#if o.history.length}
        <ol class="history">
          {#each o.history as h (h.id)}
            <li>
              <span class="when">{formatDateTime(h.createdAt)}</span>
              <span>{tk(`con.a.${h.action}`)}</span>
              <span class="muted">{h.staff ?? t("con.audit.system")}</span>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="muted">{t("con.org.history.none")}</p>
      {/if}
    </section>
  </div>

  <aside class="actions" aria-labelledby="actions-title">
    <h2 id="actions-title">{t("con.act.title")}</h2>
    {#if o.status === "pending"}
      {#if owner}
        <form method="POST" action="?/activate" use:enhance={submit("activate")} class="action">
          <Button type="submit" pending={pending === "activate"}>{t("con.act.activate")}</Button>
          <p class="muted">{t("con.act.activate.hint")}</p>
        </form>
      {/if}
    {:else}
      <form method="POST" action="?/invite" use:enhance={submit("invite")} class="action">
        <Button type="submit" variant="secondary" pending={pending === "invite"}>{t("con.act.invite")}</Button>
        <p class="muted">{t("con.act.invite.hint")}</p>
      </form>
      {#if owner}
        <form method="POST" action="?/tier" use:enhance={submit("tier")} class="action">
          <label class="select">
            <span>{t("con.act.tier")}</span>
            <select name="tier">
              {#each ["essentiel", "mouvement", "national"] as k (k)}
                <option value={k} selected={o.tier === k}>{tk(`plan.${k}`)}</option>
              {/each}
            </select>
          </label>
          <Button type="submit" variant="secondary" pending={pending === "tier"}>{t("con.act.tier.save")}</Button>
        </form>
        {#if sub?.status === "trial"}
          <form method="POST" action="?/trial" use:enhance={submit("trial")} class="action">
            <Field label={t("con.act.trial.days")} name="days" type="number" min="1" max="180" value="14" />
            <Button type="submit" variant="secondary" pending={pending === "trial"}>{t("con.act.trial.save")}</Button>
          </form>
        {/if}
        <form method="POST" action="?/elections" use:enhance={submit("elections")} class="action">
          <p class="label">{t("con.org.elections")}</p>
          {#if o.kind !== "party"}
            <p class="muted">{t("con.act.elections.partyOnly")}</p>
          {:else if electionsOn}
            <input type="hidden" name="months" value="0" />
            <Button type="submit" variant="secondary" pending={pending === "elections"}>
              {t("con.act.elections.stop")}
            </Button>
          {:else}
            <Field label={t("con.act.elections.months")} name="months" type="number" min="1" max="24" value="6" />
            <Button type="submit" variant="secondary" pending={pending === "elections"}>
              {t("con.act.elections.save")}
            </Button>
          {/if}
        </form>
        {#if sub?.status === "suspended"}
          <form method="POST" action="?/reactivate" use:enhance={submit("reactivate")} class="action">
            <Button type="submit" pending={pending === "reactivate"}>{t("con.act.reactivate")}</Button>
          </form>
        {:else}
          <form method="POST" action="?/suspend" use:enhance={submit("suspend")} class="action danger">
            <Field label={t("con.act.reason")} name="reason" maxlength={500} />
            <Button type="submit" variant="secondary" pending={pending === "suspend"}>{t("con.act.suspend")}</Button>
            <p class="muted">{t("con.act.suspend.hint")}</p>
          </form>
        {/if}
      {/if}
    {/if}
  </aside>
</div>

<style>
  .back {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    text-underline-offset: 3px;
  }
  .head {
    margin: var(--s-2) 0 var(--s-5);
  }
  h1 {
    margin: 0;
    font: 600 var(--fs-32) / 1.1 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  h2 {
    margin: 0 0 var(--s-3);
    font: 600 var(--fs-16) / 1.3 var(--font-display);
  }
  .meta {
    margin: var(--s-2) 0 0;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    color: var(--c-ink-2);
  }
  .msg {
    margin: 0 0 var(--s-4);
    padding: var(--s-3) var(--s-4);
    border-radius: var(--r-md);
    background: var(--c-success-tint);
    color: var(--c-success-text);
  }
  .msg.bad {
    background: var(--c-danger-tint);
    color: var(--c-danger-text);
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: var(--s-5);
    align-items: start;
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }
  .panel {
    margin: 0;
    padding: var(--s-5);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .facts {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-4) var(--s-6);
  }
  dt {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  dd {
    margin: 2px 0 0;
    line-height: 1.45;
  }
  dd a {
    color: var(--c-ink);
    text-underline-offset: 3px;
  }
  .kpis {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .kpis > div {
    padding: var(--s-4) var(--s-5);
  }
  .kpis > div + div {
    border-left: 1px solid var(--c-line);
  }
  .big {
    font: 600 var(--fs-26) / 1.2 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .sub,
  .muted {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    line-height: 1.45;
  }
  .money {
    margin: 0 0 var(--s-3);
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .money li {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .money strong {
    font: 600 var(--fs-19) / 1.2 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .history {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .history li {
    display: grid;
    grid-template-columns: 170px 1fr auto;
    gap: var(--s-3);
    padding: var(--s-2) 0;
    border-bottom: 1px solid var(--c-line-soft);
    font-size: var(--fs-14);
  }
  .when {
    color: var(--c-ink-2);
    font-variant-numeric: tabular-nums;
  }
  .actions {
    position: sticky;
    top: var(--s-6);
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding: var(--s-5);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .action {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    padding-bottom: var(--s-4);
    border-bottom: 1px solid var(--c-line-soft);
  }
  .action:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }
  .label,
  .select span {
    margin: 0;
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .select {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  select {
    min-height: 44px;
    padding: 0 var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    font: 500 var(--fs-14) / 1 var(--font-ui);
  }
  .back:focus-visible,
  select:focus-visible,
  dd a:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  @media (max-width: 1000px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .actions {
      position: static;
    }
    .kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .kpis > div:nth-child(3) {
      border-left: 0;
    }
    .kpis > div:nth-child(n + 3) {
      border-top: 1px solid var(--c-line);
    }
  }
  @media (max-width: 600px) {
    .facts {
      grid-template-columns: minmax(0, 1fr);
    }
    .history li {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
    }
  }
</style>
