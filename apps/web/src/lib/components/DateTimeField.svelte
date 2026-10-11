<!--
  Date et heure sur 12 heures avec AM / PM explicite (heure d'Haïti). Un champ datetime-local natif suit la langue
  du navigateur (souvent 24 h) : ici l'heure se lit et se choisit toujours avec AM ou PM.
  La valeur envoyée (champ caché `name`) reste « AAAA-MM-JJTHH:mm » sur 24 h, convertie côté serveur.
-->
<script lang="ts">
  interface Props {
    label: string;
    name: string;
    /** « AAAA-MM-JJTHH:mm » (24 h), heure d'Haïti. */
    value?: string;
    required?: boolean;
    labels: { date: string; hour: string; minute: string };
  }
  let { label, name, value = "", required = false, labels }: Props = $props();
  const uid = $props.id();

  const parse = (v: string) => {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(v);
    if (!m) return { date: "", hour: 9, minute: 0, pm: false };
    const h = Number(m[2]);
    return { date: m[1]!, hour: h % 12 === 0 ? 12 : h % 12, minute: Number(m[3]), pm: h >= 12 };
  };
  let date = $derived(parse(value).date);
  let hour = $derived(parse(value).hour);
  let minute = $derived(parse(value).minute);
  let pm = $derived(parse(value).pm);
  const pad = (n: number) => String(n).padStart(2, "0");
  const composed = $derived(date ? `${date}T${pad((hour % 12) + (pm ? 12 : 0))}:${pad(minute)}` : "");
  const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
</script>

<fieldset class="dt">
  <legend>{label}</legend>
  <input type="hidden" {name} value={composed} />
  <div class="row">
    <label class="date">
      <span class="sr-only">{labels.date}</span>
      <input type="date" bind:value={date} {required} />
    </label>
    <label>
      <span class="sr-only">{labels.hour}</span>
      <select bind:value={hour}>
        {#each [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as h (h)}<option value={h}>{h}</option>{/each}
      </select>
    </label>
    <span class="colon" aria-hidden="true">:</span>
    <label>
      <span class="sr-only">{labels.minute}</span>
      <select bind:value={minute}>
        {#if !MINUTES.includes(minute)}<option value={minute}>{pad(minute)}</option>{/if}
        {#each MINUTES as m (m)}<option value={m}>{pad(m)}</option>{/each}
      </select>
    </label>
    <div class="ampm" role="radiogroup" aria-label="AM / PM">
      {#each [false, true] as isPm (isPm)}
        <label class:on={pm === isPm}>
          <input type="radio" name="{name}-{uid}-ampm" checked={pm === isPm} onchange={() => (pm = isPm)} />
          <span>{isPm ? "PM" : "AM"}</span>
        </label>
      {/each}
    </div>
  </div>
</fieldset>

<style>
  .dt {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  legend {
    padding: 0;
    margin-bottom: var(--s-2);
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-2);
  }
  .date {
    flex: 1 1 150px;
  }
  input[type="date"],
  select {
    width: 100%;
    min-height: 44px;
    padding: 0 var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 400 var(--fs-15) / 1 var(--font-ui);
    font-variant-numeric: tabular-nums;
  }
  select {
    width: auto;
    padding: 0 var(--s-2);
  }
  .colon {
    font-weight: 600;
  }
  .ampm {
    display: inline-flex;
    padding: 3px;
    gap: 2px;
    border-radius: var(--r-pill);
    background: var(--c-paper);
  }
  .ampm label {
    position: relative;
    min-width: 44px;
    min-height: 38px;
    display: inline-grid;
    place-items: center;
    padding: 0 var(--s-2);
    border-radius: var(--r-pill);
    font: 700 var(--fs-14) / 1 var(--font-ui);
    color: var(--c-ink-2);
    cursor: pointer;
  }
  .ampm input {
    position: absolute;
    opacity: 0;
  }
  .ampm label.on {
    background: var(--c-ink);
    color: var(--c-surface);
  }
  input:focus-visible,
  select:focus-visible,
  .ampm label:has(input:focus-visible) {
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
