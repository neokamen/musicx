<script lang="ts">
  import type { EqBand } from "../../types/eq.ts";

  interface Props {
    bands: EqBand[];
    highpass?: number;
    lowpass?: number;
    accentColor: string;
  }

  let { bands, highpass, lowpass, accentColor }: Props = $props();

  let canvas = $state<HTMLCanvasElement>();

  function colorToRgba(color: string, alpha: number): string {
    const trimmed = (color || "").trim();
    if (trimmed.startsWith("#")) {
      let c = trimmed.slice(1);
      if (c.length === 3) c = c.split("").map((x) => x + x).join("");
      const num = parseInt(c, 16);
      if (!isNaN(num)) {
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        return `rgba(${r},${g},${b},${alpha})`;
      }
    }
    const match = trimmed.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (match) {
      return `rgba(${match[1]},${match[2]},${match[3]},${alpha})`;
    }
    return `rgba(6,182,212,${alpha})`;
  }

  $effect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const activeColor = accentColor || "#06b6d4";

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (const db of [-12, -6, 0, 6, 12]) {
      const y = H / 2 - (db / 12) * (H / 2 - 10);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();

    const freqAt = (x: number) => 20 * Math.pow(10, (x / W) * Math.log10(20000 / 20));
    const dbResponse = new Float32Array(W);

    for (let x = 0; x < W; x++) {
      const f = freqAt(x);
      let totalDb = 0;

      for (const band of bands) {
        if (Math.abs(band.gain) < 0.05) continue;
        const octDiff = Math.abs(Math.log2(f / band.freq));
        const factor = Math.exp(-Math.pow(octDiff * (band.q || 1.4), 2) * 1.5);
        totalDb += band.gain * factor;
      }

      if (highpass && highpass > 20) {
        if (f < highpass) {
          const oct = Math.log2(highpass / Math.max(1, f));
          totalDb -= Math.min(36, oct * 12);
        }
      }

      if (lowpass && lowpass < 20000 && lowpass > 0) {
        if (f > lowpass) {
          const oct = Math.log2(f / lowpass);
          totalDb -= Math.min(36, oct * 12);
        }
      }

      dbResponse[x] = totalDb;
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, colorToRgba(activeColor, 0.45));
    gradient.addColorStop(0.5, colorToRgba(activeColor, 0.15));
    gradient.addColorStop(1, "rgba(0,0,0,0)");

    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      const db = Math.max(-18, Math.min(18, dbResponse[x]));
      const y = H / 2 - (db / 18) * (H / 2 - 6);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(W - 1, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      const db = Math.max(-18, Math.min(18, dbResponse[x]));
      const y = H / 2 - (db / 18) * (H / 2 - 6);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.shadowColor = activeColor;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = activeColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
  });
</script>

<canvas bind:this={canvas} width={640} height={130} class="w-full h-full"></canvas>
