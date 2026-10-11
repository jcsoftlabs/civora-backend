<!--
  Signature tracée à l'écran (doigt, stylet ou souris) pour le certificat (FOR-04). Le trait est lissé ; la
  signature est recadrée sur l'encre, exportée en PNG transparent, puis envoyée au stockage comme une image.
-->
<script lang="ts">
  import { organizationKind } from "$lib/i18n/org";
  import { onMount } from "svelte";
  import { Button } from "@civora/ui";
  import { translator } from "$lib/i18n";

  interface Props {
    locale: "fr" | "ht";
    oncancel: () => void;
    /** Signature prête : le fichier PNG à envoyer. */
    onuse: (file: File) => void;
  }
  let { locale, oncancel, onuse }: Props = $props();
  const orgKind = organizationKind();
  const t = $derived(translator(locale, orgKind()));

  let canvas = $state<HTMLCanvasElement | null>(null);
  let empty = $state(true);
  let ctx: CanvasRenderingContext2D | null = null;
  let drawing = false;
  let last: { x: number; y: number } | null = null;
  let ink = "#1C1B19";

  onMount(() => {
    if (!canvas) return;
    ink = getComputedStyle(canvas).getPropertyValue("--c-ink").trim() || ink;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const box = canvas.getBoundingClientRect();
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = ink;
  });

  const point = (e: PointerEvent) => {
    const box = canvas!.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };
  function down(e: PointerEvent) {
    if (!ctx) return;
    canvas!.setPointerCapture(e.pointerId);
    drawing = true;
    last = point(e);
    ctx.beginPath();
    ctx.arc(last.x, last.y, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
    empty = false;
  }
  function moveTo(e: PointerEvent) {
    if (!drawing || !ctx || !last) return;
    const p = point(e);
    // Épaisseur selon la pression du stylet, sinon constante ; tracé lissé par le milieu des segments.
    ctx.lineWidth = e.pressure && e.pointerType === "pen" ? 1.2 + e.pressure * 2.6 : 2.4;
    const mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  }
  function up() {
    drawing = false;
    last = null;
  }
  function clear() {
    if (!ctx || !canvas) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    empty = true;
  }

  /** Recadre sur l'encre (marge de 12 px) et exporte en PNG transparent. */
  function use() {
    if (!canvas || !ctx || empty) return;
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = width,
      minY = height,
      maxX = -1,
      maxY = -1;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (data[(y * width + x) * 4 + 3]! > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
    if (maxX < 0) return;
    const pad = 12;
    const sx = Math.max(0, minX - pad);
    const sy = Math.max(0, minY - pad);
    const w = Math.min(width, maxX + pad) - sx;
    const h = Math.min(height, maxY + pad) - sy;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    out.getContext("2d")!.drawImage(canvas, sx, sy, w, h, 0, 0, w, h);
    out.toBlob((blob) => {
      if (blob) onuse(new File([blob], "signature.png", { type: "image/png" }));
    }, "image/png");
  }
</script>

<div class="pad">
  <canvas
    bind:this={canvas}
    aria-label={t("admin.cert.draw.area")}
    onpointerdown={down}
    onpointermove={moveTo}
    onpointerup={up}
    onpointercancel={up}
    onpointerleave={up}
  ></canvas>
  <span class="baseline" aria-hidden="true"></span>
  {#if empty}<span class="placeholder" aria-hidden="true">{t("admin.cert.draw.placeholder")}</span>{/if}
</div>
<div class="row">
  <Button variant="ghost" size="sm" onclick={clear} disabled={empty}>{t("admin.cert.draw.clear")}</Button>
  <span class="grow"></span>
  <Button variant="ghost" size="sm" onclick={oncancel}>{t("common.cancel")}</Button>
  <Button size="sm" onclick={use} disabled={empty}>{t("admin.cert.draw.use")}</Button>
</div>

<style>
  .pad {
    position: relative;
    height: 160px;
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    touch-action: none;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    cursor: crosshair;
    touch-action: none;
  }
  /* Ligne de signature, comme sur un formulaire papier. */
  .baseline {
    position: absolute;
    left: 24px;
    right: 24px;
    bottom: 38px;
    border-bottom: 1px dashed var(--c-ink-3);
    pointer-events: none;
  }
  .placeholder {
    position: absolute;
    left: 24px;
    bottom: 46px;
    font-size: var(--fs-13);
    color: var(--c-ink-3);
    pointer-events: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    margin-top: var(--s-2);
  }
  .grow {
    flex: 1;
  }
</style>
