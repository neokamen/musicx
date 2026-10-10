<script lang="ts">
  import { onMount } from "svelte";
  import { useMusicStore, appearanceStore } from "../../store/index.ts";
  import { Activity, Layers, Sparkles, Volume2 } from "@lucide/svelte";

  interface Props {
    height?: number;
    nodeKey?: string;
    isEditing?: boolean;
  }

  let { nodeKey = undefined }: Props = $props();

  let appearance = $derived($appearanceStore);
  let accentColor = $derived(appearance.accentColor || "#06b6d4");

  type FftwMode = "precision_bars" | "dual_stereo" | "vector_curve" | "lab_crt";

  const MODES: { id: FftwMode; label: string; icon: any }[] = [
    { id: "precision_bars", label: "FFTW3 Estudio (64 Bandas)", icon: Activity },
    { id: "dual_stereo", label: "FFTW3 Estéreo Dual (L / R)", icon: Volume2 },
    { id: "vector_curve", label: "FFTW3 Curva Vectorial", icon: Sparkles },
    { id: "lab_crt", label: "FFTW3 Monitor de Frecuencia", icon: Layers },
  ];

  function getInitialMode(): FftwMode {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(nodeKey ? `musicx_fftw_mode_${nodeKey}` : "musicx_fftw_mode");
      if (saved && MODES.some((m) => m.id === saved)) {
        return saved as FftwMode;
      }
    }
    return "precision_bars";
  }

  let currentMode = $state<FftwMode>(getInitialMode());
  let showLabels = $state<boolean>(true);
  let peakHoldEnabled = $state<boolean>(true);
  let canvasRef = $state<HTMLCanvasElement | null>(null);

  function cycleMode() {
    const idx = MODES.findIndex((m) => m.id === currentMode);
    const next = MODES[(idx + 1) % MODES.length].id;
    currentMode = next;
    if (typeof window !== "undefined") {
      localStorage.setItem(nodeKey ? `musicx_fftw_mode_${nodeKey}` : "musicx_fftw_mode", next);
    }
  }

  onMount(() => {
    const canvas = canvasRef;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animId: number;
    let lastTime = performance.now();

    const BANDS = 64;
    // Smoothed FFT level buffers (zero allocation during loop)
    const levelsMono = new Float32Array(BANDS);
    const peaksMono = new Float32Array(BANDS);
    const levelsLeft = new Float32Array(BANDS);
    const peaksLeft = new Float32Array(BANDS);
    const levelsRight = new Float32Array(BANDS);
    const peaksRight = new Float32Array(BANDS);

    const resize = () => {
      if (!canvas) return;
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

    const FREQ_LABELS = [
      { text: "32", normX: 0.05 },
      { text: "64", normX: 0.16 },
      { text: "125", normX: 0.28 },
      { text: "250", normX: 0.40 },
      { text: "500", normX: 0.52 },
      { text: "1k", normX: 0.64 },
      { text: "2k", normX: 0.76 },
      { text: "4k", normX: 0.86 },
      { text: "8k", normX: 0.94 },
      { text: "16k", normX: 0.99 },
    ];

    const DB_GRID = [-6, -12, -18, -24, -36];

    const render = (time: number) => {
      animId = requestAnimationFrame(render);
      if (document.hidden) return;

      const store = useMusicStore.getState();
      const tele = store.telemetry;
      const playing = (store.isPlaying || tele.state === "Playing") && tele.state !== "Stopped" && tele.state !== "Paused";

      // Throttle when idle to 15 FPS to conserve CPU, 60 FPS when active
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      const minInterval = playing ? 16 : 66;
      if (time - lastTime < minInterval) return;
      lastTime = time;

      resize();
      const w = canvas.width;
      const h = canvas.height;
      if (w <= 0 || h <= 0) return;

      ctx.clearRect(0, 0, w, h);

      const rawMono = tele.spectrum || [];
      const rawLeft = tele.spectrum_left || [];
      const rawRight = tele.spectrum_right || [];

      // Ballistic smoothing for FFTW3 (rapid attack, smooth logarithmic decay)
      const attack = Math.min(1, dt * 26);
      const decay = dt * 1.8;

      for (let i = 0; i < BANDS; i++) {
        // Mono
        const targetM = playing ? (rawMono[i] || 0) : 0;
        if (targetM > levelsMono[i]) {
          levelsMono[i] += (targetM - levelsMono[i]) * attack;
        } else {
          levelsMono[i] = Math.max(0, levelsMono[i] - decay);
        }
        if (levelsMono[i] > peaksMono[i]) {
          peaksMono[i] = levelsMono[i];
        } else {
          peaksMono[i] = Math.max(0, peaksMono[i] - dt * 0.45);
        }

        // Left
        const targetL = playing ? (rawLeft[i] || targetM) : 0;
        if (targetL > levelsLeft[i]) {
          levelsLeft[i] += (targetL - levelsLeft[i]) * attack;
        } else {
          levelsLeft[i] = Math.max(0, levelsLeft[i] - decay);
        }
        if (levelsLeft[i] > peaksLeft[i]) {
          peaksLeft[i] = levelsLeft[i];
        } else {
          peaksLeft[i] = Math.max(0, peaksLeft[i] - dt * 0.45);
        }

        // Right
        const targetR = playing ? (rawRight[i] || targetM) : 0;
        if (targetR > levelsRight[i]) {
          levelsRight[i] += (targetR - levelsRight[i]) * attack;
        } else {
          levelsRight[i] = Math.max(0, levelsRight[i] - decay);
        }
        if (levelsRight[i] > peaksRight[i]) {
          peaksRight[i] = levelsRight[i];
        } else {
          peaksRight[i] = Math.max(0, peaksRight[i] - dt * 0.45);
        }
      }

      // Check if completely idle
      let maxSignal = 0;
      for (let i = 0; i < BANDS; i++) {
        if (levelsMono[i] > maxSignal) maxSignal = levelsMono[i];
      }

      const activeColor = accentColor;
      const bottomPadding = showLabels ? 18 : 2;
      const usableH = h - bottomPadding;

      // ── Draw Modes ──
      switch (currentMode) {
        case "precision_bars": {
          // Analytical FFTW Studio Bars with peak hold
          // Background reference grid lines (-6, -12, -24, -36 dB)
          ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
          ctx.lineWidth = 1;
          for (const db of DB_GRID) {
            const frac = 1 - Math.abs(db) / 48;
            const y = usableH * (1 - frac);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
          }

          const slotW = w / BANDS;
          const barW = Math.max(1, slotW * 0.72);
          const gap = slotW - barW;

          for (let i = 0; i < BANDS; i++) {
            const val = levelsMono[i];
            const barH = val * (usableH - 2);
            const x = i * slotW + gap / 2;
            const y = usableH - barH;

            if (barH > 0.5) {
              ctx.fillStyle = activeColor;
              ctx.fillRect(x, y, barW, barH);
            }

            // Floating peak cap
            if (peakHoldEnabled && peaksMono[i] > 0.02) {
              const peakY = Math.max(2, usableH - peaksMono[i] * (usableH - 2));
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(x, peakY - 1, barW, 2);
            }
          }
          break;
        }

        case "dual_stereo": {
          // Split L (top half) / R (bottom half)
          const midH = usableH * 0.5;
          ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, midH);
          ctx.lineTo(w, midH);
          ctx.stroke();

          const slotW = w / BANDS;
          const barW = Math.max(1, slotW * 0.75);
          const gap = slotW - barW;

          // Left channel (spikes upwards from center)
          for (let i = 0; i < BANDS; i++) {
            const valL = levelsLeft[i];
            const barH = valL * (midH - 4);
            const x = i * slotW + gap / 2;
            const y = midH - barH;
            if (barH > 0.5) {
              ctx.fillStyle = activeColor;
              ctx.fillRect(x, y, barW, barH);
            }
            if (peakHoldEnabled && peaksLeft[i] > 0.02) {
              const peakY = Math.max(2, midH - peaksLeft[i] * (midH - 4));
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(x, peakY - 1, barW, 1.5);
            }
          }

          // Right channel (spikes downwards from center)
          for (let i = 0; i < BANDS; i++) {
            const valR = levelsRight[i];
            const barH = valR * (midH - 4);
            const x = i * slotW + gap / 2;
            const y = midH;
            if (barH > 0.5) {
              ctx.fillStyle = `${activeColor}bb`;
              ctx.fillRect(x, y, barW, barH);
            }
            if (peakHoldEnabled && peaksRight[i] > 0.02) {
              const peakY = Math.min(usableH - 2, midH + peaksRight[i] * (midH - 4));
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(x, peakY, barW, 1.5);
            }
          }

          // Channel indicators
          ctx.font = "9px monospace";
          ctx.fillStyle = "rgba(255,255,255,0.45)";
          ctx.fillText("CH-L", 6, 12);
          ctx.fillText("CH-R", 6, midH + 14);
          break;
        }

        case "vector_curve": {
          // Pure spline curve across FFT points, zero fill underneath
          ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
          ctx.lineWidth = 1;
          for (const db of DB_GRID) {
            const frac = 1 - Math.abs(db) / 48;
            const y = usableH * (1 - frac);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
          }

          const points: { x: number; y: number }[] = [];
          for (let i = 0; i < BANDS; i++) {
            const x = (i / (BANDS - 1)) * w;
            const val = levelsMono[i];
            const y = usableH - val * (usableH - 4);
            points.push({ x, y });
          }

          if (points.length > 1) {
            // Main vector stroke (no fill below)
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 0; i < points.length - 1; i++) {
              const xc = (points[i].x + points[i + 1].x) / 2;
              const yc = (points[i].y + points[i + 1].y) / 2;
              ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
            }
            ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
            ctx.strokeStyle = activeColor;
            ctx.lineWidth = 2.2;
            ctx.stroke();

            // Optical filament core
            ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
          break;
        }

        case "lab_crt": {
          // Phosphor analytical frequency meter with vertical band divisions
          const slotW = w / BANDS;
          for (let i = 0; i < BANDS; i++) {
            const val = levelsMono[i];
            const barH = val * (usableH - 2);
            const x = i * slotW;

            // Discrete matrix segments
            const segmentH = 3;
            const segmentGap = 1.5;
            const numSegments = Math.floor(barH / (segmentH + segmentGap));

            for (let s = 0; s < numSegments; s++) {
              const segY = usableH - (s + 1) * (segmentH + segmentGap);
              const frac = s / (usableH / (segmentH + segmentGap));
              ctx.fillStyle = frac > 0.85 ? "#f43f5e" : frac > 0.65 ? "#f59e0b" : activeColor;
              ctx.fillRect(x + 1, segY, slotW - 2, segmentH);
            }
          }
          break;
        }
      }

      // ── Sub-bass / Bass / Mid / Treble acoustic region badges ──
      if (showLabels) {
        ctx.font = "9px monospace";
        ctx.fillStyle = "rgba(148, 163, 184, 0.55)";
        for (const label of FREQ_LABELS) {
          const lx = label.normX * w;
          ctx.fillText(label.text, Math.max(2, lx - 8), h - 4);
        }
      }
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  });
</script>

<div class="relative flex h-full w-full flex-col overflow-hidden bg-audiophile-base select-none">
  <!-- Minimalist HUD Header -->
  <div class="flex h-7 shrink-0 items-center justify-between border-b border-audiophile-border bg-audiophile-surface px-2.5">
    <div class="flex items-center gap-1.5 font-mono text-[10px] text-audiophile-muted">
      <span class="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
      <span class="font-semibold text-audiophile-text">FFTW3</span>
      <span class="text-[9px] text-audiophile-muted opacity-60">Engine · Ultra-Ligero</span>
    </div>

    <div class="flex items-center gap-1">
      <button
        type="button"
        onclick={cycleMode}
        class="flex h-5 items-center gap-1 rounded border border-audiophile-border bg-audiophile-surface2 px-1.5 font-mono text-[9px] text-audiophile-muted hover:border-audiophile-cyan hover:text-white transition"
        title="Cambiar modo de visualización FFTW3 (Doble clic en gráfica)"
      >
        <span>{MODES.find((m) => m.id === currentMode)?.label}</span>
      </button>

      <button
        type="button"
        onclick={() => (peakHoldEnabled = !peakHoldEnabled)}
        class="flex h-5 w-5 items-center justify-center rounded border border-audiophile-border bg-audiophile-surface2 font-mono text-[9px] {peakHoldEnabled ? 'text-audiophile-cyan border-audiophile-cyan/40' : 'text-audiophile-muted'} hover:text-white transition"
        title="Alternar retención de picos (Peak Hold)"
      >
        P
      </button>

      <button
        type="button"
        onclick={() => (showLabels = !showLabels)}
        class="flex h-5 w-5 items-center justify-center rounded border border-audiophile-border bg-audiophile-surface2 font-mono text-[9px] {showLabels ? 'text-audiophile-cyan border-audiophile-cyan/40' : 'text-audiophile-muted'} hover:text-white transition"
        title="Alternar etiquetas de frecuencia (Hz)"
      >
        Hz
      </button>
    </div>
  </div>

  <!-- Canvas Surface -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="relative min-h-0 flex-1 w-full overflow-hidden" ondblclick={cycleMode}>
    <canvas
      bind:this={canvasRef}
      class="block h-full w-full cursor-pointer"
      title="Doble clic para alternar modo FFTW3"
    ></canvas>
  </div>
</div>
