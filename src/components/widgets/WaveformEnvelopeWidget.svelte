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
    let pulsePhase = 0;

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

      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      if (playing) pulsePhase += dt * 3;

      resize();
      const width = canvas.width;
      const height = canvas.height;
      if (width <= 0 || height <= 0) return;

      ctx.clearRect(0, 0, width, height);

      const rawPeaks = tele.seekbar_spectrum || [];
      const hasRealPeaks = rawPeaks.length > 0;
      const pointCount = Math.max(64, Math.min(256, Math.floor(width / 6)));
      const step = width / (pointCount - 1);

      const centerY = height * 0.52;
      const maxAmp = height * 0.44;
      const cursorX = prog * width;

      const upperPoints: { x: number; y: number }[] = [];
      const lowerPoints: { x: number; y: number }[] = [];

      for (let i = 0; i < pointCount; i++) {
        const x = i * step;
        let amp = 0;
        if (hasRealPeaks) {
          const t = (i / (pointCount - 1)) * (rawPeaks.length - 1);
          const i0 = Math.floor(t);
          const i1 = Math.min(rawPeaks.length - 1, i0 + 1);
          const frac = t - i0;
          const v0 = rawPeaks[i0] || 0;
          const v1 = rawPeaks[i1] || 0;
          amp = Math.max(0.06, Math.min(1, v0 * (1 - frac) + v1 * frac));
        } else {
          const norm = i / (pointCount - 1);
          const env = Math.sin(norm * Math.PI);
          amp = (0.24 + 0.35 * Math.sin(norm * 14) + 0.22 * Math.cos(norm * 32)) * env;
          amp = Math.max(0.06, Math.min(0.95, Math.abs(amp)));
        }

        const yTop = centerY - amp * maxAmp;
        const yBottom = centerY + amp * maxAmp * 0.65;
        upperPoints.push({ x, y: yTop });
        lowerPoints.push({ x, y: yBottom });
      }

      // 1. Draw Underfill Silhouette (Full)
      ctx.beginPath();
      ctx.moveTo(upperPoints[0].x, centerY);
      ctx.lineTo(upperPoints[0].x, upperPoints[0].y);
      for (let i = 0; i < upperPoints.length - 1; i++) {
        const xc = (upperPoints[i].x + upperPoints[i + 1].x) / 2;
        const yc = (upperPoints[i].y + upperPoints[i + 1].y) / 2;
        ctx.quadraticCurveTo(upperPoints[i].x, upperPoints[i].y, xc, yc);
      }
      ctx.lineTo(upperPoints[upperPoints.length - 1].x, upperPoints[upperPoints.length - 1].y);
      ctx.lineTo(upperPoints[upperPoints.length - 1].x, centerY);

      // Backwards on lower
      for (let i = lowerPoints.length - 1; i > 0; i--) {
        const xc = (lowerPoints[i].x + lowerPoints[i - 1].x) / 2;
        const yc = (lowerPoints[i].y + lowerPoints[i - 1].y) / 2;
        ctx.quadraticCurveTo(lowerPoints[i].x, lowerPoints[i].y, xc, yc);
      }
      ctx.closePath();

      // Unplayed background silhouette
      ctx.fillStyle = `${accentColor}16`;
      ctx.fill();

      // 2. Clip and draw Played Highlighted Gradient
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, cursorX, height);
      ctx.clip();

      const playedGrad = ctx.createLinearGradient(0, centerY - maxAmp, 0, centerY + maxAmp * 0.65);
      playedGrad.addColorStop(0, `${accentColor}95`);
      playedGrad.addColorStop(0.5, `${accentColor}55`);
      playedGrad.addColorStop(1, `${accentColor}18`);

      ctx.beginPath();
      ctx.moveTo(upperPoints[0].x, centerY);
      ctx.lineTo(upperPoints[0].x, upperPoints[0].y);
      for (let i = 0; i < upperPoints.length - 1; i++) {
        const xc = (upperPoints[i].x + upperPoints[i + 1].x) / 2;
        const yc = (upperPoints[i].y + upperPoints[i + 1].y) / 2;
        ctx.quadraticCurveTo(upperPoints[i].x, upperPoints[i].y, xc, yc);
      }
      ctx.lineTo(upperPoints[upperPoints.length - 1].x, upperPoints[upperPoints.length - 1].y);
      ctx.lineTo(upperPoints[upperPoints.length - 1].x, centerY);
      for (let i = lowerPoints.length - 1; i > 0; i--) {
        const xc = (lowerPoints[i].x + lowerPoints[i - 1].x) / 2;
        const yc = (lowerPoints[i].y + lowerPoints[i - 1].y) / 2;
        ctx.quadraticCurveTo(lowerPoints[i].x, lowerPoints[i].y, xc, yc);
      }
      ctx.closePath();
      ctx.fillStyle = playedGrad;
      ctx.fill();
      ctx.restore();

      // 3. Neon Upper Crest
      ctx.beginPath();
      ctx.moveTo(upperPoints[0].x, upperPoints[0].y);
      for (let i = 0; i < upperPoints.length - 1; i++) {
        const xc = (upperPoints[i].x + upperPoints[i + 1].x) / 2;
        const yc = (upperPoints[i].y + upperPoints[i + 1].y) / 2;
        ctx.quadraticCurveTo(upperPoints[i].x, upperPoints[i].y, xc, yc);
      }
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2.2;
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Subtle white filament on crest
      ctx.strokeStyle = "#ffffff66";
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // 4. Mirrored Lower Crest
      ctx.beginPath();
      ctx.moveTo(lowerPoints[0].x, lowerPoints[0].y);
      for (let i = 0; i < lowerPoints.length - 1; i++) {
        const xc = (lowerPoints[i].x + lowerPoints[i + 1].x) / 2;
        const yc = (lowerPoints[i].y + lowerPoints[i + 1].y) / 2;
        ctx.quadraticCurveTo(lowerPoints[i].x, lowerPoints[i].y, xc, yc);
      }
      ctx.strokeStyle = `${accentColor}55`;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Centerline
      ctx.fillStyle = `${accentColor}25`;
      ctx.fillRect(0, centerY - 0.5, width, 1);

      // Playhead Laser & Bead
      if (dur > 0 || playing) {
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = accentColor;
        ctx.shadowBlur = 12;
        ctx.fillRect(Math.max(0, cursorX - 1), centerY - maxAmp * 1.05, 2, maxAmp * 1.8);

        // Center bead
        const beadRadius = 3.5 + Math.sin(pulsePhase) * 0.8;
        ctx.beginPath();
        ctx.arc(cursorX, centerY, Math.max(2, beadRadius), 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
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
  title="Haz clic o arrastra para mover la pista"
>
  <!-- Background Glow on Hover -->
  <div
    class="pointer-events-none absolute inset-0 opacity-10 transition-opacity duration-300 group-hover:opacity-25"
    style="background: radial-gradient(circle at 50% 50%, {accentColor}, transparent 60%);"
  ></div>

  <!-- Waveform Canvas -->
  <div class="relative w-full h-full overflow-hidden">
    <canvas bind:this={canvasRef} class="w-full h-full block rounded"></canvas>

    <!-- Interactive Hover Needle -->
    {#if isHovering}
      <div
        class="pointer-events-none absolute top-0 bottom-0 w-px bg-white/70 shadow-[0_0_8px_#fff]"
        style="left: {hoverX}px;"
      ></div>
    {/if}
  </div>
</div>
