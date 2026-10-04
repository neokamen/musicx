<script lang="ts">
  import { onMount } from "svelte";
  import { Zap, Clock } from "@lucide/svelte";
  import { useMusicStore } from "../../store/index.ts";

  const musicStore = useMusicStore;
  let telemetry = $derived($musicStore.telemetry);
  let appearance = $derived($musicStore.appearance);
  let accentColor = $derived(appearance.accentColor || "#06b6d4");

  let containerRef = $state<HTMLDivElement | null>(null);
  let canvasRef = $state<HTMLCanvasElement | null>(null);

  let isHovering = $state(false);
  let hoverX = $state(0);
  let hoverRatio = $state(0);
  let isDragging = $state(false);

  let duration = $derived(
    telemetry.duration > 0
      ? telemetry.duration
      : $musicStore.currentTrack?.duration_seconds || 0
  );
  let currentTime = $derived(telemetry.current_time || 0);

  function formatTime(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  function handlePointerDown(e: PointerEvent) {
    if (!containerRef) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    isDragging = true;
    updateSeekFromEvent(e);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    hoverX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    hoverRatio = rect.width > 0 ? hoverX / rect.width : 0;
    isHovering = true;
    if (isDragging) {
      updateSeekFromEvent(e);
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (isDragging) {
      isDragging = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
  }

  function handlePointerLeave() {
    if (!isDragging) {
      isHovering = false;
    }
  }

  function updateSeekFromEvent(e: PointerEvent) {
    if (!containerRef || duration <= 0) return;
    const rect = containerRef.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    useMusicStore.getState().seek(ratio * duration);
  }

  onMount(() => {
    const canvas = canvasRef;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let animId: number;
    let lastTime = 0;
    let lastRenderProg = -1;

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

    const render = (time: number) => {
      animId = requestAnimationFrame(render);
      if (document.hidden) return;

      const store = useMusicStore.getState();
      const tele = store.telemetry;
      const curTrack = store.currentTrack;
      const dur = tele.duration > 0 ? tele.duration : (curTrack?.duration_seconds || 0);
      const curTime = tele.current_time || 0;
      const prog = dur > 0 ? Math.min(1, Math.max(0, curTime / dur)) : 0;
      const playing = (store.isPlaying || tele.state === "Playing") && tele.state !== "Stopped" && tele.state !== "Paused";

      // Ultra low consumption throttle:
      // When playing, ~30 FPS (33ms). When paused/stopped, only redraw if progress changed or every 250ms.
      const interval = playing ? 33 : 250;
      if (time - lastTime < interval && Math.abs(prog - lastRenderProg) < 0.0005) {
        return;
      }
      lastTime = time;
      lastRenderProg = prog;

      resize();
      const width = canvas.width;
      const height = canvas.height;
      if (width <= 0 || height <= 0) return;

      // Dark background fill (opaque, faster than clearRect)
      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, width, height);

      const rawPeaks = tele.seekbar_spectrum || [];
      const hasRealPeaks = rawPeaks.length > 0;
      const binCount = Math.max(80, Math.min(320, Math.floor(width / 4)));

      const centerY = height * 0.5;
      const maxH = height * 0.44;
      const barW = Math.max(1, Math.floor((width / binCount) * 0.72));
      const gap = (width - binCount * barW) / Math.max(1, binCount - 1);
      const cursorX = prog * width;

      const unplayedColor = "rgba(148, 163, 184, 0.25)";
      const playedColor = accentColor;

      // Render crisp bars without shadowBlur for minimal CPU/GPU overhead
      for (let i = 0; i < binCount; i++) {
        let amp = 0;
        if (hasRealPeaks) {
          const t = (i / (binCount - 1)) * (rawPeaks.length - 1);
          const i0 = Math.floor(t);
          const i1 = Math.min(rawPeaks.length - 1, i0 + 1);
          const frac = t - i0;
          const v0 = rawPeaks[i0] || 0;
          const v1 = rawPeaks[i1] || 0;
          amp = Math.max(0.05, Math.min(1, v0 * (1 - frac) + v1 * frac));
        } else {
          const norm = i / (binCount - 1);
          const env = Math.sin(norm * Math.PI);
          amp = (0.24 + 0.3 * Math.sin(norm * 16) + 0.16 * Math.sin(norm * 38)) * env;
          amp = Math.max(0.06, Math.min(0.95, Math.abs(amp)));
        }

        const barH = Math.max(2, Math.round(amp * maxH));
        const x = Math.round(i * (barW + gap));
        const isPlayed = x <= cursorX;

        ctx.fillStyle = isPlayed ? playedColor : unplayedColor;
        ctx.fillRect(x, Math.round(centerY - barH), barW, Math.round(barH * 2));
      }

      // Center horizon line
      ctx.fillStyle = "rgba(148, 163, 184, 0.15)";
      ctx.fillRect(0, Math.round(centerY), width, 1);

      // Playhead needle (crisp white line, no shadow blur)
      if (dur > 0 || playing) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(Math.round(cursorX) - 1, 0, 2, height);
      }
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={containerRef}
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointerleave={handlePointerLeave}
  class="relative w-full h-full min-h-[40px] rounded-xl border border-slate-800/80 bg-slate-950/90 shadow-inner select-none cursor-pointer overflow-hidden group p-2"
>
  <!-- Header overlay with timestamps and eco badge -->
  <div class="pointer-events-none absolute inset-x-2.5 top-2 z-20 flex items-center justify-between text-[9px] font-mono text-slate-400">
    <div class="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-800/80 backdrop-blur-xs">
      <Clock size={10} style="color: {accentColor};" />
      <span class="font-bold text-slate-200">{formatTime(currentTime)}</span>
      <span class="text-slate-600">/</span>
      <span>{formatTime(duration)}</span>
    </div>

    <div class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900/70 border border-slate-800/70 text-[8.5px] font-bold text-emerald-400">
      <Zap size={9} />
      <span>ECO</span>
    </div>
  </div>

  <!-- Waveform Canvas -->
  <div class="relative w-full h-full overflow-hidden">
    <canvas bind:this={canvasRef} class="w-full h-full block rounded"></canvas>

    <!-- Interactive Hover Needle & Time Tag -->
    {#if isHovering}
      <div
        class="pointer-events-none absolute top-0 bottom-0 w-px bg-white/80"
        style="left: {hoverX}px;"
      ></div>
      <div
        class="pointer-events-none absolute top-8 -translate-x-1/2 rounded bg-slate-900/90 border border-slate-700 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white shadow-md z-30"
        style="left: {hoverX}px;"
      >
        {formatTime(hoverRatio * duration)}
      </div>
    {/if}
  </div>
</div>
