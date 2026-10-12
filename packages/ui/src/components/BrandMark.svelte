<!--
  Marque civora : le rassemblement. Des militants en cercle ouvert dessinent le « c » ; le point ambre, dans
  l'ouverture, est le membre qui rejoint. Huit points en grand, six en petit (lisible jusqu'à 16 px).
  tone : « light » sur papier, « dark » sur le rail encre, « primary » sur un aplat pétrole.
-->
<script lang="ts">
  interface Props {
    size?: number;
    tone?: "light" | "dark" | "primary";
  }
  let { size = 28, tone = "light" }: Props = $props();
  const small = $derived(size < 26);
  const dots = $derived(
    small
      ? [
          [35.5, 14.4],
          [24, 9],
          [12, 15],
          [9, 27],
          [16, 37],
          [29, 39],
        ]
      : [
          [35.5, 14.4],
          [26.6, 9.2],
          [16.5, 11],
          [9.9, 18.9],
          [9.9, 29.1],
          [16.5, 37],
          [26.6, 38.8],
          [35.5, 33.6],
        ],
  );
</script>

<svg class="brand-mark {tone}" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  {#each dots as [x, y], i (i)}<circle cx={x} cy={y} r={small ? 4.4 : 3.6} class="dot" />{/each}
  <circle cx={small ? 41 : 42} cy={small ? 25 : 24} r={small ? 5 : 4.4} class="join" />
</svg>

<style>
  .brand-mark {
    flex: none;
    display: block;
  }
  .light .dot {
    fill: var(--c-primary);
  }
  .light .join {
    fill: var(--c-accent);
  }
  .dark .dot {
    fill: color-mix(in srgb, var(--c-primary) 45%, var(--c-surface));
  }
  .dark .join,
  .primary .join {
    fill: var(--c-accent-bright);
  }
  .primary .dot {
    fill: var(--c-card-cream);
  }
</style>
