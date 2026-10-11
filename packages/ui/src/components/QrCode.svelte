<!--
  QR code en SVG (net à toute taille, imprimable). Correction d'erreur M : lisible même un peu abîmé ou mal éclairé.
  `label` décrit le code pour les lecteurs d'écran.
-->
<script lang="ts">
  import QRCode from "qrcode";

  interface Props {
    value: string;
    label: string;
    size?: number;
  }
  let { value, label, size = 96 }: Props = $props();

  const qr = $derived.by(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = modules.size;
    let d = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) if (modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`;
    }
    return { n, d };
  });
</script>

<svg
  class="qr"
  width={size}
  height={size}
  viewBox="-2 -2 {qr.n + 4} {qr.n + 4}"
  role="img"
  aria-label={label}
  shape-rendering="crispEdges"
>
  <rect x="-2" y="-2" width={qr.n + 4} height={qr.n + 4} rx="2" class="bg" />
  <path d={qr.d} class="fg" />
</svg>

<style>
  .qr {
    display: block;
    flex: none;
  }
  .bg {
    fill: var(--qr-bg, var(--c-card-cream));
  }
  .fg {
    fill: var(--qr-fg, var(--c-ink));
  }
</style>
