<!--
  Interrupteur : role="switch", état écrit (Oui, Non) et une phrase d'explication en dessous.
  Les libellés d'état viennent des traductions de l'application (onLabel, offLabel).
-->
<script lang="ts">
  interface Props {
    label: string;
    checked?: boolean;
    description?: string;
    onLabel: string;
    offLabel: string;
    disabled?: boolean;
    onchange?: (checked: boolean) => void;
  }
  let {
    label,
    checked = $bindable(false),
    description,
    onLabel,
    offLabel,
    disabled = false,
    onchange,
  }: Props = $props();

  const uid = $props.id();

  function toggle() {
    checked = !checked;
    onchange?.(checked);
  }
</script>

<div class="switch-row">
  <div class="text">
    <span class="label" id="sw-{uid}-label">{label}</span>
    {#if description}<span class="desc" id="sw-{uid}-desc">{description}</span>{/if}
  </div>
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-labelledby="sw-{uid}-label"
    aria-describedby={description ? `sw-${uid}-desc` : undefined}
    {disabled}
    onclick={toggle}
  >
    <span class="state">{checked ? onLabel : offLabel}</span>
    <span class="track" aria-hidden="true"><span class="thumb"></span></span>
  </button>
</div>

<style>
  .switch-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--s-4);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
  }
  .label {
    font: 600 var(--fs-15) / 1.3 var(--font-ui);
    color: var(--c-ink);
  }
  .desc {
    font-size: var(--fs-13);
    line-height: 1.4;
    color: var(--c-ink-2);
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    flex: none;
    min-height: var(--touch-min);
    padding: 0 var(--s-1);
    border: 0;
    background: none;
    cursor: pointer;
    font: 600 var(--fs-13) / 1 var(--font-ui);
    color: var(--c-ink-2);
  }
  button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
    border-radius: var(--r-sm);
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .state {
    min-width: 2.5em;
    text-align: right;
  }
  .track {
    position: relative;
    width: 44px;
    height: 26px;
    border-radius: var(--r-pill);
    background: var(--c-line);
    transition: background var(--dur-base);
  }
  .thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: var(--r-pill);
    background: var(--c-surface);
    transition: transform var(--dur-base) var(--ease-stamp);
  }
  [aria-checked="true"] {
    color: var(--c-ink);
  }
  [aria-checked="true"] .track {
    background: var(--c-primary);
  }
  [aria-checked="true"] .thumb {
    transform: translateX(18px);
  }
</style>
