<!--
  Formule de cotisation (FIN-03, FIN-05) : nom, montant et devise, périodicité, date d'échéance (anniversaire
  ou fixe), délai de grâce, formule par défaut. À la modification, la devise, la périodicité et la règle
  d'échéance restent fixes (elles changeraient le sens des échéances déjà générées).
-->
<script lang="ts">
  import { enhance } from "$app/forms";
  import { PERIODICITIES } from "@civora/shared";
  import { Button, Field, SidePanel, Switch } from "@civora/ui";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { Plan } from "./+page.server";

  interface Props {
    plan: Plan | null;
    locale: "fr" | "ht";
    form: { ok?: boolean; done?: string; code?: string } | null;
    onclose: () => void;
  }
  let { plan, locale, form, onclose }: Props = $props();
  const t = $derived(translator(locale));
  const tk = (k: string) => t(k as MessageKey);

  let open = $state(true);
  let pending = $state(false);
  let dueRule = $derived(plan?.dueRule ?? "anniversary");
  let isDefault = $derived(plan?.isDefault ?? false);
  let active = $derived(plan?.active ?? true);
  const CURRENCIES = ["HTG", "USD", "EUR", "CAD"] as const;
  const message = $derived(
    form?.code
      ? { bad: true, text: tk(`error.${form.code}`) }
      : form?.done === "planCreated"
        ? { bad: false, text: t("admin.plan.created") }
        : form?.done === "planSaved"
          ? { bad: false, text: t("admin.plan.saved") }
          : null,
  );
</script>

<SidePanel
  bind:open
  title={plan ? format(t("admin.plan.edit"), { name: plan.name.fr }) : t("admin.plan.new")}
  closeLabel={t("admin.sheet.close")}
  {onclose}
>
  <form
    method="POST"
    action={plan ? "?/updatePlan" : "?/createPlan"}
    use:enhance={() => {
      pending = true;
      return async ({ update, result }) => {
        await update({ reset: false });
        pending = false;
        if (result.type === "success" && !plan) onclose();
      };
    }}
    class="stack"
  >
    {#if message}<p class="msg" class:bad={message.bad} role="status">{message.text}</p>{/if}
    {#if plan}<input type="hidden" name="id" value={plan.id} />{/if}
    <Field label={t("admin.plan.name")} name="nameFr" required maxlength={80} value={plan?.name.fr ?? ""} />
    <Field label={t("admin.plan.nameHt")} name="nameHt" maxlength={80} value={plan?.name.ht ?? ""} />
    <div class="row2">
      <Field
        label={t("admin.plan.amount")}
        hint={plan ? t("admin.plan.amount.hint") : undefined}
        name="amount"
        required
        inputmode="decimal"
        pattern="[0-9]+([.,][0-9]{'{1,2}'})?"
        value={plan?.amount ?? ""}
      />
      <label class="select">
        <span>{t("admin.plan.currency")}</span>
        <select name="currency" disabled={!!plan} value={plan?.currency ?? "HTG"}>
          {#each CURRENCIES as c (c)}<option value={c}>{c}</option>{/each}
        </select>
      </label>
    </div>
    <label class="select">
      <span>{t("admin.plan.periodicity")}</span>
      <select name="periodicity" disabled={!!plan} value={plan?.periodicity ?? "monthly"}>
        {#each PERIODICITIES as p (p)}<option value={p}>{tk(`admin.plan.period.${p}`)}</option>{/each}
      </select>
    </label>
    <fieldset disabled={!!plan}>
      <legend>{t("admin.plan.dueRule")}</legend>
      {#each ["anniversary", "fixed"] as r (r)}
        <label class="radio" class:on={dueRule === r}>
          <input type="radio" name="dueRule" value={r} bind:group={dueRule} />
          <span>{tk(`admin.plan.dueRule.${r}`)}</span>
        </label>
      {/each}
    </fieldset>
    {#if dueRule === "fixed"}
      <Field
        label={t("admin.plan.fixedDay")}
        hint={t("admin.plan.fixedDay.hint")}
        name="fixedDueDay"
        required={!plan}
        disabled={!!plan}
        pattern="(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])"
        placeholder="01-31"
        value={plan?.fixedDueDay ?? ""}
      />
    {/if}
    <Field
      label={t("admin.plan.grace")}
      hint={t("admin.plan.grace.hint")}
      name="graceDays"
      type="number"
      min="0"
      max="180"
      value={String(plan?.graceDays ?? 15)}
    />
    <input type="hidden" name="isDefault" value={String(isDefault)} />
    <Switch
      label={t("admin.plan.isDefault")}
      description={t("admin.plan.isDefault.desc")}
      onLabel={t("common.yes")}
      offLabel={t("common.no")}
      bind:checked={isDefault}
    />
    {#if plan}
      <input type="hidden" name="active" value={String(active)} />
      <Switch
        label={t("admin.plan.active")}
        description={t("admin.plan.active.desc")}
        onLabel={t("common.yes")}
        offLabel={t("common.no")}
        bind:checked={active}
      />
    {/if}
    <div class="row end">
      <Button variant="ghost" onclick={() => (open = false)}>{t("common.cancel")}</Button>
      <Button type="submit" {pending}>{plan ? t("admin.plan.save") : t("admin.plans.create")}</Button>
    </div>
  </form>
</SidePanel>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }
  .row2 {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: var(--s-3);
    align-items: start;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  .row.end {
    justify-content: flex-end;
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
    color: var(--c-ink);
    font: 400 var(--fs-15) / 1 var(--font-ui);
  }
  select:disabled,
  fieldset:disabled {
    opacity: 0.7;
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  legend {
    padding: 0;
    margin-bottom: var(--s-1);
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .radio {
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: 0 var(--s-4);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    cursor: pointer;
  }
  .radio.on {
    border-color: var(--c-primary);
    background: var(--c-primary-tint);
  }
  .radio input {
    accent-color: var(--c-primary);
  }
  .radio:has(input:focus-visible),
  select:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
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
</style>
