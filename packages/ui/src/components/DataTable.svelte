<!--
  Tableau : sélection par cases à cocher, colonnes typées, zone défilante sur téléphone,
  squelettes pendant le chargement et état vide qui invite à agir.
  Les cellules sont rendues par le snippet `cell` ; les textes viennent de l'application.
-->
<script lang="ts" generics="Row extends { id: string }">
  import type { Snippet } from "svelte";
  import Skeleton from "./Skeleton.svelte";

  interface Column {
    key: string;
    label: string;
    align?: "start" | "end";
    numeric?: boolean;
  }
  interface Props {
    caption: string;
    columns: Column[];
    rows: Row[];
    cell: Snippet<[Row, Column]>;
    loading?: boolean;
    loadingLabel: string;
    empty?: Snippet;
    selectable?: boolean;
    selected?: string[];
    selectAllLabel?: string;
    selectRowLabel?: (row: Row) => string;
  }
  let {
    caption,
    columns,
    rows,
    cell,
    loading = false,
    loadingLabel,
    empty,
    selectable = false,
    selected = $bindable([]),
    selectAllLabel = "",
    selectRowLabel = () => "",
  }: Props = $props();

  const allSelected = $derived(rows.length > 0 && rows.every((r) => selected.includes(r.id)));
  const someSelected = $derived(!allSelected && rows.some((r) => selected.includes(r.id)));

  function toggleAll() {
    selected = allSelected ? [] : rows.map((r) => r.id);
  }
  function toggle(id: string) {
    selected = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
  }
</script>

{#if loading}
  <div class="frame skeletons">
    {#each [0, 1, 2, 3, 4] as i (i)}<Skeleton variant="row" label={loadingLabel} />{/each}
  </div>
{:else if rows.length === 0 && empty}
  <div class="frame empty">{@render empty()}</div>
{:else}
  <div class="frame scroll">
    <table>
      <caption class="sr-only">{caption}</caption>
      <thead>
        <tr>
          {#if selectable}
            <th class="check" scope="col">
              <input
                type="checkbox"
                checked={allSelected}
                indeterminate={someSelected}
                aria-label={selectAllLabel}
                onchange={toggleAll}
              />
            </th>
          {/if}
          {#each columns as col (col.key)}
            <th scope="col" class:end={col.align === "end"}>{col.label}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.id)}
          <tr class:selected={selected.includes(row.id)}>
            {#if selectable}
              <td class="check">
                <input
                  type="checkbox"
                  checked={selected.includes(row.id)}
                  aria-label={selectRowLabel(row)}
                  onchange={() => toggle(row.id)}
                />
              </td>
            {/if}
            {#each columns as col (col.key)}
              <td class:end={col.align === "end"} class:num={col.numeric}>{@render cell(row, col)}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .frame {
    background: var(--c-surface);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
  }
  .scroll {
    overflow-x: auto;
  }
  .skeletons {
    padding: var(--s-2) var(--s-5);
  }
  .empty {
    padding: var(--s-10) var(--s-6);
    text-align: center;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font: 400 var(--fs-14) / 1.4 var(--font-ui);
  }
  th {
    text-align: start;
    padding: var(--s-3) var(--s-4);
    white-space: nowrap;
    font-weight: 600;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    border-bottom: 1px solid var(--c-line);
  }
  td {
    padding: var(--s-3) var(--s-4);
    border-bottom: 1px solid var(--c-line-soft);
    color: var(--c-ink);
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }
  tbody tr:hover {
    background: var(--c-paper);
  }
  tr.selected,
  tr.selected:hover {
    background: var(--c-primary-tint);
  }
  .end {
    text-align: end;
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  .check {
    width: 44px;
    padding-inline-end: 0;
  }
  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: var(--c-primary);
    cursor: pointer;
    margin: 13px 0;
  }
  input[type="checkbox"]:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
</style>
