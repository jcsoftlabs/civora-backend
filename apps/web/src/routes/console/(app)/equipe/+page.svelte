<!--
  Équipe de la plateforme (SOC-10) : propriétaires et support, double authentification, désactivation.
  On ne désactive ni son propre compte ni le dernier propriétaire actif (contrôlé par l'API).
-->
<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/state";
  import { Badge, Button, Field } from "@civora/ui";
  import { translator, type MessageKey } from "$lib/i18n";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData & { locale: "fr" | "ht" }; form: ActionData } = $props();
  const t = $derived(translator(data.locale));
  const tk = (k: string) => t(k as MessageKey);
  const me = $derived(page.data.staff?.staffId);
  const f = $derived(form as { ok?: boolean; done?: string; code?: string } | null);
  let pending = $state<string | null>(null);
  const submit = (key: string) => () => {
    pending = key;
    return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
      await update({ reset: key === "add" });
      pending = null;
    };
  };
</script>

<h1>{t("con.staff.title")}</h1>
<p class="lead">{t("con.staff.lead")}</p>
{#if f?.code}<p class="msg bad" role="alert">{tk(`error.${f.code}`)}</p>{/if}
{#if f?.ok && f.done}<p class="msg" role="status">{tk(`con.done.${f.done}`)}</p>{/if}

<div class="scroll">
  <table>
    <thead>
      <tr>
        <th scope="col">{t("con.staff.col.name")}</th>
        <th scope="col">{t("con.staff.col.email")}</th>
        <th scope="col">{t("con.staff.col.role")}</th>
        <th scope="col">{t("con.staff.col.mfa")}</th>
        <th scope="col"><span class="sr-only">{t("con.act.title")}</span></th>
      </tr>
    </thead>
    <tbody>
      {#each data.team as s (s.id)}
        <tr class:off={!!s.disabledAt}>
          <th scope="row">
            {s.name}
            {#if s.id === me}<Badge tone="primary">{t("con.staff.you")}</Badge>{/if}
            {#if s.disabledAt}<Badge>{t("con.staff.disabled")}</Badge>{/if}
          </th>
          <td>{s.email}</td>
          <td>{t(s.role === "owner" ? "con.role.owner" : "con.role.support")}</td>
          <td>{t(s.mfa ? "con.staff.mfa.on" : "con.staff.mfa.off")}</td>
          <td class="end">
            {#if s.id !== me}
              <form method="POST" action="?/toggle" use:enhance={submit(s.id)}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="disabled" value={s.disabledAt ? "0" : "1"} />
                <Button type="submit" size="sm" variant="ghost" pending={pending === s.id}>
                  {t(s.disabledAt ? "con.staff.enable" : "con.staff.disable")}
                </Button>
              </form>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<form method="POST" action="?/add" use:enhance={submit("add")} class="add">
  <h2>{t("con.staff.add")}</h2>
  <div class="three">
    <Field label={t("con.staff.name")} name="name" required minlength={2} maxlength={80} />
    <Field label={t("con.staff.email")} name="email" type="email" required maxlength={254} />
    <label class="select">
      <span>{t("con.staff.role")}</span>
      <select name="role">
        <option value="support">{t("con.role.support")}</option>
        <option value="owner">{t("con.role.owner")}</option>
      </select>
    </label>
  </div>
  <div class="row"><Button type="submit" pending={pending === "add"}>{t("con.staff.submit")}</Button></div>
</form>

<style>
  h1 {
    margin: 0;
    font: 600 var(--fs-32) / 1.1 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  h2 {
    margin: 0;
    font: 600 var(--fs-16) / 1.3 var(--font-display);
  }
  .lead {
    margin: var(--s-2) 0 var(--s-5);
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
  tbody th {
    font-weight: 600;
  }
  tr.off {
    color: var(--c-ink-3);
  }
  .end {
    text-align: right;
  }
  .add {
    max-width: 860px;
    margin-top: var(--s-6);
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    padding: var(--s-5);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .three {
    display: grid;
    grid-template-columns: 1fr 1fr 200px;
    gap: var(--s-3);
    align-items: start;
  }
  .select {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    font-size: var(--fs-14);
    font-weight: 600;
  }
  select {
    min-height: 44px;
    padding: 0 var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    font: 500 var(--fs-14) / 1 var(--font-ui);
  }
  .row {
    display: flex;
    justify-content: flex-end;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  select:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  @media (max-width: 760px) {
    .three {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
