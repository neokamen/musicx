<script lang="ts">
  import { onMount } from "svelte";
  import { useMusicStore } from "../../store/index.ts";

  const musicStore = useMusicStore;
  let telemetry = $derived($musicStore.telemetry);
  let appearance = $derived($musicStore.appearance);
  let accentColor = $derived(appearance.accentColor || "#06b6d4");

  let containerRef = $state<HTMLDivElement | null>(null);
  let canvasRef = $state<HTMLCanvasElement | null>(null);

  let isHovering = $state(false);
  let hoverX = $state(0);
  let isDragging = $state(false);

  let duration = $derived(
    telemetry.duration > 0
      ? telemetry.duration
      : $musicStore.currentTrack?.duration_seconds || 0
  );

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
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let lastTime = performance.now();

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

      // Throttle when stopped/paused
      const minInterval = playing ? 20 : 80;
      if (time - lastTime < minInterval) return;
      lastTime = time;

      resize();
      const width = canvas.width;
      const height = canvas.height;
      if (width <= 0 || height <= 0) return;

      ctx.clearRect(0, 0, width, height);

      const rawPeaks = tele.seekbar_spectrum || [];
      const hasRealPeaks = rawPeaks.length > 0;
      const binCount = Math.max(120, Math.min(600, Math.floor(width / 3)));

      const centerY = height * 0.5;
      const maxH = height * 0.44;
      const barW = Math.max(1, (width / binCount) * 0.68);
      const gap = (width - binCount * barW) / Math.max(1, binCount - 1);
      const cursorX = prog * width;

      const playedGrad = ctx.createLinearGradient(0, centerY - maxH, 0, centerY + maxH);
      playedGrad.addColorStop(0, `${accentColor}88`);
      playedGrad.addColorStop(0.5, `${accentColor}ff`);
      playedGrad.addColorStop(1, `${accentColor}88`);
      const unplayedFill = `${accentColor}2c`;

      for (let i = 0; i < binCount; i++) {
        let amp = 0;
        if (hasRealPeaks) {
          const t = (i / (binCount - 1)) * (rawPeaks.length - 1);
          const i0 = Math.floor(t);
          const i1 = Math.min(rawPeaks.length - 1, i0 + 1);
          const frac = t - i0;
          const v0 = rawPeaks[i0] || 0;
          const v1 = rawPeaks[i1] || 0;
          amp = Math.max(0.04, Math.min(1, v0 * (1 - frac) + v1 * frac));
        } else {
          const norm = i / (binCount - 1);
          const env = Math.sin(norm * Math.PI);
          amp = (0.22 + 0.28 * Math.sin(norm * 18) + 0.18 * Math.sin(norm * 44) + 0.1 * Math.cos(norm * 88)) * env;
          amp = Math.max(0.05, Math.min(0.95, Math.abs(amp)));
        }

        const barH = Math.max(2, amp * maxH);
        const x = i * (barW + gap);
        const isPlayed = x <= cursorX;

        ctx.fillStyle = isPlayed ? playedGrad : unplayedFill;
        ctx.fillRect(x, centerY - barH, barW, barH * 2);
      }

      // Center horizon line
      ctx.fillStyle = `${accentColor}20`;
      ctx.fillRect(0, centerY - 0.5, width, 1);

      // Playhead needle
      if (dur > 0 || playing) {
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = accentColor;
        ctx.shadowBlur = 8;
        ctx.fillRect(Math.max(0, cursorX - 1), centerY - maxH * 1.05, 2, maxH * 2.1);
        ctx.shadowBlur = 0;
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

  <!-- Waveform Canvas -->
  <div class="relative w-full h-full overflow-hidden">
    <canvas bind:this={canvasRef} class="w-full h-full block rounded"></canvas>

    <!-- Interactive Hover Needle -->
    {#if isHovering}
      <div
        class="pointer-events-none absolute top-0 bottom-0 w-px bg-white/70 shadow-[0_0_6px_#fff]"
        style="left: {hoverX}px;"
      ></div>
    {/if}
  </div>
</div>
