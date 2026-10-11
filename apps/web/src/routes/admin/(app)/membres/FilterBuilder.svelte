<!--
  Constructeur de filtres de la liste des membres (maquette « Back-office : liste des membres ») : pastilles
  « champ, condition, valeur » reliées par ET ou OU (un clic sur le lien bascule), retrait individuel,
  « Ajouter un filtre », « Enregistrer ce segment ». Le filtre vit dans l'adresse (`f`) : il se partage par lien.
-->
<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button, Field } from "@civora/ui";
  import Lookup from "$lib/components/Lookup.svelte";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { FilterExpr, FilterRule } from "./+page.server";

  interface Props {
    expr: FilterExpr;
    locale: "fr" | "ht";
    statuses: Array<{ id: string; label: { fr: string; ht?: string } }>;
    organs: Array<{ id: string; name: string }>;
    form: { code?: string; segmentError?: boolean } | null;
    onchange: (expr: FilterExpr) => void;
  }
  let { expr, locale, statuses, organs, form, onchange }: Props = $props();
  const t = $derived(translator(locale));
  const tk = (k: string) => t(k as MessageKey);
  const label = (l: { fr: string; ht?: string }) => (locale === "ht" && l.ht ? l.ht : l.fr);

  const OPERATORS: Record<FilterRule["field"], string[]> = {
    zone: ["in", "notIn"],
    status: ["in", "notIn"],
    tag: ["hasAny", "hasNone"],
    place: ["is"],
    dues: ["is"],
    joined: ["after", "before"],
    category: ["is", "isNot"],
    organ: ["memberOf"],
  };
  const fields = $derived(
    (Object.keys(OPERATORS) as FilterRule["field"][]).filter(
      (f) => (f !== "organ" || organs.length) && (f !== "status" || statuses.length),
    ),
  );

  let adding = $state(false);
  let saving = $state(false);
  let field = $state<FilterRule["field"]>("zone");
  let operator = $state("in");
  let value = $state("");
  let valueLabel = $state("");
  let pickerKey = $state(0);
  $effect(() => {
    operator = OPERATORS[field][0]!;
    value = "";
    valueLabel = "";
  });

  /** Texte d'une pastille : « Zone est dans Pétion-Ville ». */
  function describe(r: FilterRule) {
    const v = Array.isArray(r.value) ? r.value.join(", ") : r.value;
    const shown =
      r.label ??
      (r.field === "place" || r.field === "dues"
        ? tk(`admin.filters.v.${v}`)
        : r.field === "status"
          ? statuses.find((s) => s.id === v)
            ? label(statuses.find((s) => s.id === v)!.label)
            : v
          : r.field === "organ"
            ? (organs.find((o) => o.id === v)?.name ?? v)
            : v);
    return `${tk(`admin.filters.f.${r.field}`)} ${tk(`admin.filters.o.${r.operator}`)} ${shown}`;
  }

  function add() {
    if (!value) return;
    const multi = ["zone", "status", "tag", "organ"].includes(field);
    const rule: FilterRule = {
      field,
      operator,
      value: multi ? [value] : value,
      ...(valueLabel ? { label: valueLabel } : {}),
    };
    onchange({ ...expr, rules: [...expr.rules, rule] });
    adding = false;
  }
  const remove = (i: number) => onchange({ ...expr, rules: expr.rules.filter((_, j) => j !== i) });
  const toggle = () => onchange({ ...expr, combinator: expr.combinator === "and" ? "or" : "and" });
  const joiner = $derived(t(expr.combinator === "and" ? "admin.filters.and" : "admin.filters.or"));
</script>

<div class="builder" role="group" aria-label={t("admin.filters.label")}>
  <ul class="chips">
    {#each expr.rules as r, i (i)}
      {#if i > 0}
        <li class="join-li">
          <button
            type="button"
            class="join"
            class:or={expr.combinator === "or"}
            onclick={toggle}
            aria-label={format(t("admin.filters.toggle"), { value: joiner })}>{joiner}</button
          >
        </li>
      {/if}
      <li class="chip">
        <span>{describe(r)}</span>
        <button
          type="button"
          aria-label={format(t("admin.filters.remove"), { rule: describe(r) })}
          onclick={() => remove(i)}>×</button
        >
      </li>
    {/each}
    <li>
      <button type="button" class="add" aria-expanded={adding} onclick={() => (adding = !adding)}>
        + {t("admin.filters.add")}
      </button>
    </li>
    {#if expr.rules.length}
      <li>
        <button type="button" class="link strong" aria-expanded={saving} onclick={() => (saving = !saving)}>
          {t("admin.segments.save")}
        </button>
      </li>
    {/if}
  </ul>

  {#if adding}
    <div class="editor">
      <label class="sel">
        <span>{t("admin.filters.field")}</span>
        <select bind:value={field}>
          {#each fields as f (f)}<option value={f}>{tk(`admin.filters.f.${f}`)}</option>{/each}
        </select>
      </label>
      <label class="sel">
        <span>{t("admin.filters.operator")}</span>
        <select bind:value={operator}>
          {#each OPERATORS[field] as o (o)}<option value={o}>{tk(`admin.filters.o.${o}`)}</option>{/each}
        </select>
      </label>
      <div class="value">
        {#if field === "zone"}
          {#key pickerKey}
            <Lookup
              label={t("admin.filters.value")}
              type="zones"
              name="_filterZone"
              placeholder={t("admin.organ.zone.search")}
              emptyText={t("error.zone_not_found")}
              onpick={(z) => {
                value = z?.id ?? "";
                valueLabel = z?.label ?? "";
              }}
            />
          {/key}
        {:else if field === "status"}
          <label class="sel">
            <span>{t("admin.filters.value")}</span>
            <select bind:value onchange={(e) => (valueLabel = e.currentTarget.selectedOptions[0]?.text ?? "")}>
              <option value=""></option>
              {#each statuses as s (s.id)}<option value={s.id}>{label(s.label)}</option>{/each}
            </select>
          </label>
        {:else if field === "organ"}
          <label class="sel">
            <span>{t("admin.filters.value")}</span>
            <select bind:value onchange={(e) => (valueLabel = e.currentTarget.selectedOptions[0]?.text ?? "")}>
              <option value=""></option>
              {#each organs as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
            </select>
          </label>
        {:else if field === "place" || field === "dues"}
          <label class="sel">
            <span>{t("admin.filters.value")}</span>
            <select bind:value>
              <option value=""></option>
              {#each field === "place" ? ["haiti", "diaspora"] : ["upToDate", "late", "none"] as v (v)}
                <option value={v}>{tk(`admin.filters.v.${v}`)}</option>
              {/each}
            </select>
          </label>
        {:else if field === "joined"}
          <label class="sel">
            <span>{t("admin.filters.value")}</span>
            <input type="date" bind:value />
          </label>
        {:else}
          <Field label={t("admin.filters.value")} bind:value maxlength={field === "tag" ? 40 : 60} />
        {/if}
      </div>
      <div class="editor-actions">
        <Button size="sm" onclick={add} disabled={!value}>{t("admin.filters.apply")}</Button>
        <Button size="sm" variant="ghost" onclick={() => ((adding = false), pickerKey++)}>{t("common.cancel")}</Button>
      </div>
    </div>
  {/if}

  {#if saving}
    <form
      method="POST"
      action="?/saveSegment"
      class="editor save"
      use:enhance={() =>
        async ({ update, result }) => {
          await update({ reset: false });
          if (result.type === "success") saving = false;
        }}
    >
      <input type="hidden" name="filter" value={JSON.stringify(expr)} />
      <Field
        label={t("admin.segments.name")}
        hint={t("admin.segments.name.hint")}
        name="name"
        required
        minlength={2}
        maxlength={80}
      />
      {#if form?.segmentError && form.code}<p class="error" role="alert">{tk(`error.${form.code}`)}</p>{/if}
      <div class="editor-actions">
        <Button type="submit" size="sm">{t("admin.segments.save")}</Button>
        <Button size="sm" variant="ghost" onclick={() => (saving = false)}>{t("common.cancel")}</Button>
      </div>
    </form>
  {/if}
</div>

<style>
  .builder {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }
  .chips {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-2);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-height: 36px;
    padding-left: var(--s-3);
    border: 1px solid var(--c-primary);
    border-radius: var(--r-pill);
    background: var(--c-primary-tint);
    font-size: var(--fs-13);
    font-weight: 600;
  }
  .chip button {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: var(--r-pill);
    background: transparent;
    color: var(--c-ink);
    font-size: var(--fs-16);
    cursor: pointer;
  }
  /* Le lien entre pastilles : une agrafe ET (encre) ou OU (ambre), cliquable. */
  .join {
    min-width: 44px;
    min-height: 28px;
    padding: 0 var(--s-2);
    border: 0;
    border-radius: var(--r-sm);
    background: var(--c-ink);
    color: var(--c-surface);
    font: 600 var(--fs-12) / 1.12 var(--font-display);
    letter-spacing: 0.06em;
    cursor: pointer;
  }
  .join.or {
    background: var(--c-accent-bright);
    color: var(--c-on-accent);
  }
  .add {
    min-height: 36px;
    padding: 0 var(--s-3);
    border: 1px dashed var(--c-ink-3);
    border-radius: var(--r-pill);
    background: transparent;
    color: var(--c-ink);
    font: 600 var(--fs-13) / 1 var(--font-ui);
    cursor: pointer;
  }
  .link {
    min-height: 36px;
    padding: 0 var(--s-2);
    border: 0;
    background: transparent;
    color: var(--c-ink-2);
    font: 500 var(--fs-13) / 1 var(--font-ui);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .link.strong {
    color: var(--c-ink);
    font-weight: 600;
  }
  .chip button:focus-visible,
  .join:focus-visible,
  .add:focus-visible,
  .link:focus-visible,
  select:focus-visible,
  input:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .editor {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--s-3);
    padding: var(--s-4);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
  }
  .editor.save {
    max-width: 520px;
    flex-direction: column;
    align-items: stretch;
  }
  .sel {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .value {
    flex: 1 1 220px;
  }
  select,
  input[type="date"] {
    min-height: 44px;
    padding: 0 var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 400 var(--fs-15) / 1 var(--font-ui);
  }
  .editor-actions {
    display: flex;
    gap: var(--s-2);
  }
  .error {
    margin: 0;
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-sm);
    background: var(--c-danger-tint);
    color: var(--c-danger-text);
    font-size: var(--fs-13);
  }
</style>
