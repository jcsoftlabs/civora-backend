<!--
  Champ de recherche avec suggestions (motif combobox de l'ARIA) : zones ou membres validés.
  La valeur choisie part dans un champ caché `name` ; flèches, Entrée et Échap au clavier.
-->
<script lang="ts">
  import { resolve } from "$app/paths";

  interface Item {
    id: string;
    label: string;
    context: string | null;
  }
  interface Props {
    label: string;
    hint?: string;
    type: "zones" | "members";
    name: string;
    placeholder: string;
    emptyText: string;
    initial?: Item | null;
    /** Libellé de l'option qui vide le choix (ex. « Organe national »). */
    clearLabel?: string;
    onpick?: (item: Item | null) => void;
    /** Code de zone : ne propose que les membres de cette zone et de ses sous-zones. */
    within?: string | null;
  }
  let {
    label,
    hint,
    type,
    name,
    placeholder,
    emptyText,
    initial = null,
    clearLabel,
    onpick,
    within = null,
  }: Props = $props();

  const uid = $props.id();
  let picked = $state<Item | null>(null);
  let touched = $state(false);
  const current = $derived(touched ? picked : initial);
  let query = $state("");
  let results = $state<Item[]>([]);
  let searched = $state(false);
  let active = $state(-1);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function search() {
    clearTimeout(timer);
    const q = query.trim();
    if (q.length < 2) {
      results = [];
      searched = false;
      return;
    }
    timer = setTimeout(async () => {
      const res = await fetch(
        `${resolve("/admin/organes/recherche")}?type=${type}&q=${encodeURIComponent(q)}${within ? `&within=${encodeURIComponent(within)}` : ""}`,
      );
      if (q !== query.trim()) return;
      results = res.ok ? ((await res.json()) as { results: Item[] }).results : [];
      searched = true;
      active = results.length ? 0 : -1;
    }, 180);
  }
  function pick(item: Item | null) {
    picked = item;
    touched = true;
    query = "";
    results = [];
    searched = false;
    onpick?.(item);
  }
  function key(e: KeyboardEvent) {
    if (e.key === "ArrowDown" && results.length) {
      e.preventDefault();
      active = (active + 1) % results.length;
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      active = (active - 1 + results.length) % results.length;
    } else if (e.key === "Enter" && active >= 0 && results[active]) {
      e.preventDefault();
      pick(results[active]!);
    } else if (e.key === "Escape") {
      results = [];
      searched = false;
    }
  }
</script>

<div class="lookup">
  <label for="lk-{uid}">{label}</label>
  <input type="hidden" {name} value={current?.id ?? ""} />
  {#if current}
    <div class="chosen">
      <span>
        <strong>{current.label}</strong>
        {#if current.context}<span class="ctx">{current.context}</span>{/if}
      </span>
      {#if clearLabel}
        <button type="button" onclick={() => pick(null)}>{clearLabel}</button>
      {/if}
    </div>
  {/if}
  <input
    id="lk-{uid}"
    type="search"
    role="combobox"
    autocomplete="off"
    aria-autocomplete="list"
    aria-expanded={results.length > 0}
    aria-controls="lk-{uid}-list"
    aria-activedescendant={active >= 0 ? `lk-${uid}-${active}` : undefined}
    aria-describedby={hint ? `lk-${uid}-hint` : undefined}
    {placeholder}
    bind:value={query}
    oninput={search}
    onkeydown={key}
  />
  {#if results.length}
    <ul id="lk-{uid}-list" role="listbox">
      {#each results as r, i (r.id)}
        <li id="lk-{uid}-{i}" role="option" aria-selected={i === active}>
          <button type="button" tabindex="-1" onclick={() => pick(r)} onmouseenter={() => (active = i)}>
            <strong>{r.label}</strong>
            {#if r.context}<span class="ctx">{r.context}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  {:else if searched}
    <p class="none" role="status">{emptyText}</p>
  {/if}
  {#if hint}<p class="hint" id="lk-{uid}-hint">{hint}</p>{/if}
</div>

<style>
  .lookup {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  label {
    font-size: var(--fs-14);
    font-weight: 600;
  }
  input {
    min-height: 44px;
    padding: 0 var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 400 var(--fs-15) / 1 var(--font-ui);
  }
  input:focus-visible,
  button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .chosen {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-md);
    background: var(--c-primary-tint);
  }
  .chosen > span,
  li button {
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-align: left;
  }
  .chosen button {
    min-height: 36px;
    padding: 0 var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 500 var(--fs-13) / 1 var(--font-ui);
    cursor: pointer;
  }
  .ctx,
  .hint,
  .none {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  ul {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(100% - 4px);
    z-index: 5;
    margin: 0;
    padding: var(--s-1);
    list-style: none;
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    box-shadow: var(--shadow-object);
    max-height: 280px;
    overflow-y: auto;
  }
  li button {
    width: 100%;
    min-height: 44px;
    padding: var(--s-2) var(--s-3);
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--c-ink);
    font: 400 var(--fs-14) / 1.3 var(--font-ui);
    cursor: pointer;
  }
  li[aria-selected="true"] button {
    background: var(--c-paper);
  }
</style>
