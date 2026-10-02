<script lang="ts">
  import { onMount } from "svelte";
  import { useMusicStore } from "../../store/index.ts";

  interface Props {
    mode?: "waveform" | "fluid_wave";
    accentColor?: string;
  }

  let {
    mode = "waveform",
    accentColor = "#06b6d4",
  }: Props = $props();

  let canvasRef = $state<HTMLCanvasElement | null>(null);

  onMount(() => {
    const canvas = canvasRef;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let phase = 0;
    let lastTime = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.max(1, Math.floor(rect.width * dpr));
      const targetH = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const render = (time: number) => {
      animId = requestAnimationFrame(render);
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      const width = canvas.width;
      const height = canvas.height;
      if (width <= 0 || height <= 0) return;

      const store = useMusicStore.getState();
      const tele = store.telemetry;
      const curTrack = store.currentTrack;
      const duration = tele.duration > 0 ? tele.duration : (curTrack?.duration_seconds || 0);
      const curTime = tele.current_time || 0;
      const progress = duration > 0 ? Math.min(1, Math.max(0, curTime / duration)) : 0;
      const isPlaying = (store.isPlaying || tele.state === "Playing") && tele.state !== "Stopped" && tele.state !== "Paused";

      ctx.clearRect(0, 0, width, height);

      // ==========================================================
      // MODE 1: ONDAS DE LA CANCIÓN EN HD (Waveform con alto detalle)
      // ==========================================================
      if (mode === "waveform") {
        const rawPeaks = tele.seekbar_spectrum || [];
        const hasRealPeaks = rawPeaks.length > 0;
        const binCount = hasRealPeaks ? rawPeaks.length : 160;

        const centerY = height * 0.5;
        const maxH = height * 0.46;
        const barW = Math.max(1.0, (width / binCount) * 0.72);
        const gap = (width - binCount * barW) / Math.max(1, binCount - 1);
        const cursorX = progress * width;

        for (let i = 0; i < binCount; i++) {
          let amp = 0;
          if (hasRealPeaks) {
            amp = Math.max(0.04, Math.min(1, rawPeaks[i] || 0));
          } else {
            const norm = i / (binCount - 1);
            const env = Math.sin(norm * Math.PI);
            amp = (0.22 + 0.28 * Math.sin(norm * 18) + 0.18 * Math.sin(norm * 44) + 0.1 * Math.cos(norm * 88)) * env;
            amp = Math.max(0.05, Math.min(0.95, Math.abs(amp)));
          }

          const barH = Math.max(1.5, amp * maxH);
          const x = i * (barW + gap);
          const isPlayed = x <= cursorX;

          if (isPlayed) {
            const grad = ctx.createLinearGradient(0, centerY - barH, 0, centerY + barH);
            grad.addColorStop(0, `${accentColor}99`);
            grad.addColorStop(0.5, `${accentColor}dd`);
            grad.addColorStop(1, `${accentColor}99`);
            ctx.fillStyle = grad;
          } else {
            ctx.fillStyle = `${accentColor}38`;
          }

          ctx.fillRect(x, centerY - barH, barW, barH * 2);
        }

        // Center horizon line (subtle)
        ctx.fillStyle = `${accentColor}18`;
        ctx.fillRect(0, centerY - 0.5, width, 1);

        // Playhead indicator (subtle 1px needle without harsh glow)
        if (duration > 0 || isPlaying) {
          ctx.fillStyle = `${accentColor}bb`;
          ctx.fillRect(Math.max(0, cursorX - 0.5), centerY - maxH * 1.02, 1, maxH * 2.04);
        }
      }

      // ==========================================================
      // MODE 2: ONDA FLUIDA CONTINUA MEJORADA (Osciloscopio analógico)
      // ==========================================================
      else {
        phase += isPlaying ? dt * 4.5 : dt * 1.6;

        let bassEnergy = 0;
        let midEnergy = 0;
        const spectrum = tele.spectrum || [];
        if (isPlaying && spectrum.length > 0) {
          const sampleCount = Math.min(12, spectrum.length);
          for (let s = 0; s < sampleCount; s++) {
            bassEnergy += spectrum[s] || 0;
          }
          bassEnergy = (bassEnergy / sampleCount);

          const midCount = Math.min(32, spectrum.length);
          for (let s = sampleCount; s < midCount; s++) {
            midEnergy += spectrum[s] || 0;
          }
          midEnergy = (midEnergy / (midCount - sampleCount));
        } else {
          bassEnergy = 0.08;
          midEnergy = 0.04;
        }

        const midY = height * 0.5;
        const amplitude = Math.min(height * 0.44, Math.max(3, height * (bassEnergy * 0.65 + midEnergy * 0.35 + 0.1)));
        const pointsCount = 48;
        const step = width / (pointsCount - 1);
        const points: { x: number; y: number }[] = [];

        for (let i = 0; i < pointsCount; i++) {
          const x = i * step;
          const normX = i / (pointsCount - 1);
          const envelope = Math.sin(normX * Math.PI);

          const freqVal = isPlaying && spectrum.length > 0
            ? (spectrum[Math.min(i, spectrum.length - 1)] || 0) * 0.8
            : 0;

          const wave =
            Math.sin(normX * 10 + phase) * 0.6 +
            Math.sin(normX * 22 - phase * 1.4) * 0.28 +
            Math.cos(normX * 36 + phase * 2) * (0.12 + freqVal * 0.3);

          const y = midY + wave * amplitude * envelope;
          points.push({ x, y });
        }

        // Draw translucent underfill
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
        areaGrad.addColorStop(0.7, `${accentColor}10`);
        areaGrad.addColorStop(1, "transparent");
        ctx.fillStyle = areaGrad;
        ctx.fill();

        // Draw luminous wave crest
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 0; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2;
          const yc = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1.8;
        ctx.shadowColor = accentColor;
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // White core filament
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
    };
  });
</script>

<canvas
  bind:this={canvasRef}
  class="w-full h-full block rounded"
></canvas>
