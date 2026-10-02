<script lang="ts">
  import { onMount } from "svelte";
  import type { AudioTelemetry } from "../../types/index.ts";

  interface Props {
    mode: "spectrum" | "wave";
    accentColor?: string;
    isPlaying?: boolean;
    telemetry?: AudioTelemetry;
  }

  let {
    mode = "spectrum",
    accentColor = "#06b6d4",
    isPlaying = false,
    telemetry,
  }: Props = $props();

  let canvasRef = $state<HTMLCanvasElement | null>(null);

  onMount(() => {
    const canvas = canvasRef;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let phase = 0;

    // Smoothed values and peak tracking for studio spectrum
    const BANDS_COUNT = 48;
    const smoothedBands = new Float32Array(BANDS_COUNT);
    const peakCaps = new Float32Array(BANDS_COUNT);
    const peakDecaySpeed = new Float32Array(BANDS_COUNT);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      }
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const render = (time: number) => {
      animId = requestAnimationFrame(render);
      const width = canvas.width;
      const height = canvas.height;
      if (width <= 0 || height <= 0) return;

      ctx.clearRect(0, 0, width, height);

      const spectrum = telemetry?.spectrum || [];
      const spectrumLen = spectrum.length;
      const active = isPlaying;

      if (mode === "spectrum") {
        // High quality spectrum bars with peak caps
        const gap = Math.max(1.5, Math.floor(width / (BANDS_COUNT * 5)));
        const totalGaps = (BANDS_COUNT - 1) * gap;
        const barWidth = Math.max(2, (width - totalGaps) / BANDS_COUNT);
        const maxBarHeight = height * 0.88;

        for (let i = 0; i < BANDS_COUNT; i++) {
          // Sample from spectrum with gentle log-scale distribution
          let rawVal = 0;
          if (active && spectrumLen > 0) {
            const index = Math.floor(Math.pow(i / BANDS_COUNT, 1.35) * spectrumLen);
            rawVal = spectrum[Math.min(index, spectrumLen - 1)] || 0;
            // Normalize float (0..1) or byte (0..255)
            if (rawVal > 1) rawVal /= 255;
          } else {
            // Idle ambient breathing wave
            rawVal = 0.05 + 0.04 * Math.sin(time * 0.002 + i * 0.18);
          }

          // Smooth rise & fall
          if (rawVal > smoothedBands[i]) {
            smoothedBands[i] += (rawVal - smoothedBands[i]) * 0.42;
          } else {
            smoothedBands[i] += (rawVal - smoothedBands[i]) * 0.16;
          }

          const currentH = Math.max(2, smoothedBands[i] * maxBarHeight);

          // Peak caps physics
          if (currentH >= peakCaps[i]) {
            peakCaps[i] = currentH;
            peakDecaySpeed[i] = 0.3;
          } else {
            peakCaps[i] -= peakDecaySpeed[i];
            peakDecaySpeed[i] += 0.15;
            if (peakCaps[i] < 2) peakCaps[i] = 2;
          }

          const x = i * (barWidth + gap);
          const y = height - currentH;

          // Gradient bar fill
          const grad = ctx.createLinearGradient(0, y, 0, height);
          grad.addColorStop(0, accentColor);
          grad.addColorStop(1, `${accentColor}25`);

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, currentH, [2, 2, 0, 0]);
          ctx.fill();

          // Peak cap indicator
          const peakY = height - peakCaps[i];
          ctx.fillStyle = active ? "#ffffff" : `${accentColor}88`;
          ctx.fillRect(x, Math.max(0, peakY - 1.5), barWidth, 1.5);
        }
      } else {
        // Mode === "wave": Continuous fluid wave (Oscilloscope style)
        phase += active ? 0.038 : 0.015;

        // Compute overall energy from lower-mid frequency bins
        let energy = 0;
        if (active && spectrumLen > 0) {
          const sampleCount = Math.min(24, spectrumLen);
          for (let s = 0; s < sampleCount; s++) {
            energy += spectrum[s] > 1 ? spectrum[s] / 255 : spectrum[s];
          }
          energy /= sampleCount;
        } else {
          energy = 0.12;
        }

        const midY = height * 0.52;
        const amplitude = Math.min(height * 0.44, Math.max(4, (height * 0.4) * (energy * 1.6 + 0.15)));
        const pointsCount = 40;
        const step = width / (pointsCount - 1);

        // Build main wave path points
        const points: { x: number; y: number }[] = [];
        for (let i = 0; i < pointsCount; i++) {
          const x = i * step;
          const normX = i / (pointsCount - 1);
          // Windowing envelope so edges taper smoothly
          const envelope = Math.sin(normX * Math.PI);
          // Multi-harmonic fluid wave formula
          const wave =
            Math.sin(normX * 9 - phase) * 0.65 +
            Math.sin(normX * 18 + phase * 1.4) * 0.25 +
            Math.cos(normX * 5 - phase * 0.8) * 0.2;

          const y = midY + wave * amplitude * envelope;
          points.push({ x, y });
        }

        // 1. Draw glowing translucent fluid gradient fill below wave
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(points[0].x, points[0].y);

        for (let i = 0; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2;
          const yc = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        ctx.lineTo(width, height);
        ctx.closePath();

        const areaGrad = ctx.createLinearGradient(0, midY - amplitude, 0, height);
        areaGrad.addColorStop(0, `${accentColor}35`);
        areaGrad.addColorStop(0.7, `${accentColor}0a`);
        areaGrad.addColorStop(1, "transparent");
        ctx.fillStyle = areaGrad;
        ctx.fill();
        ctx.restore();

        // 2. Draw continuous fluid wave line with neon glow
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        for (let i = 0; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2;
          const yc = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2;
        ctx.shadowColor = accentColor;
        ctx.shadowBlur = 9;
        ctx.stroke();

        // 3. Crisp inner core line for high-definition sharpness
        ctx.lineWidth = 1;
        ctx.strokeStyle = active ? "#ffffff" : `${accentColor}dd`;
        ctx.shadowBlur = 0;
        ctx.stroke();
        ctx.restore();
      }
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
    };
  });
</script>

<div class="relative w-full h-8 overflow-hidden rounded flex items-center justify-center">
  <canvas
    bind:this={canvasRef}
    class="w-full h-full block"
  ></canvas>
</div>
