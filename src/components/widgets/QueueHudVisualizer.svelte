<script lang="ts">
  import { onMount } from "svelte";
  import { useMusicStore } from "../../store/index.ts";

  interface Props {
    accentColor?: string;
  }

  let {
    accentColor = "#06b6d4",
  }: Props = $props();

  let canvasRef = $state<HTMLCanvasElement | null>(null);
  let isSeeking = $state(false);

  function formatTime(sec: number): string {
    if (!sec || isNaN(sec) || sec < 0) return "0:00";
    const mins = Math.floor(sec / 60);
    const remainingSecs = Math.floor(sec % 60);
    return `${mins}:${remainingSecs.toString().padStart(2, "0")}`;
  }

  function handleSeek(clientX: number) {
    const canvas = canvasRef;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const pct = x / rect.width;
    const store = useMusicStore.getState();
    const duration = store.telemetry.duration || store.currentTrack?.duration_seconds || 0;
    if (duration > 0) {
      store.seek(pct * duration);
    }
  }

  onMount(() => {
    const canvas = canvasRef;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

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

    const render = () => {
      animId = requestAnimationFrame(render);

      const width = canvas.width;
      const height = canvas.height;
      if (width <= 0 || height <= 0) return;

      const store = useMusicStore.getState();
      const tele = store.telemetry;
      const curTrack = store.currentTrack;
      const duration = tele.duration > 0 ? tele.duration : (curTrack?.duration_seconds || 0);
      const curTime = tele.current_time || 0;
      const progress = duration > 0 ? Math.min(1, Math.max(0, curTime / duration)) : 0;
      const isPlaying = (store.isPlaying || tele.state === "Playing") && tele.state !== "Stopped";

      ctx.clearRect(0, 0, width, height);

      // Raw precomputed song waveform peaks (192 bins from Rust Symphonia analysis)
      const rawPeaks = tele.seekbar_spectrum || [];
      const hasRealPeaks = rawPeaks.length > 0;
      const binCount = hasRealPeaks ? rawPeaks.length : 128;

      const centerY = height * 0.5;
      const maxHalfH = height * 0.44;
      const barW = Math.max(1.2, width / binCount - 0.8);
      const gap = (width - binCount * barW) / Math.max(1, binCount - 1);
      const cursorX = progress * width;

      // Draw each wave slice across the whole duration of the song
      for (let i = 0; i < binCount; i++) {
        let amp = 0;
        if (hasRealPeaks) {
          amp = Math.max(0.06, Math.min(1, rawPeaks[i] || 0));
        } else {
          // Synthetic audio envelope if waveform is still computing
          const norm = i / (binCount - 1);
          const env = Math.sin(norm * Math.PI);
          amp = (0.2 + 0.3 * Math.sin(norm * 14) + 0.15 * Math.sin(norm * 38)) * env;
          amp = Math.max(0.06, Math.min(0.9, Math.abs(amp)));
        }

        const barH = Math.max(2, amp * maxHalfH);
        const x = i * (barW + gap);
        const isPlayed = x <= cursorX;

        if (isPlayed) {
          // Played waveform: illuminated in current theme accent color
          const grad = ctx.createLinearGradient(0, centerY - barH, 0, centerY + barH);
          grad.addColorStop(0, accentColor);
          grad.addColorStop(0.5, "#ffffff");
          grad.addColorStop(1, accentColor);
          ctx.fillStyle = grad;
        } else {
          // Unplayed waveform: dimmed background theme tone
          ctx.fillStyle = `${accentColor}28`;
        }

        // Mirrored symmetrical soundwave
        ctx.fillRect(x, centerY - barH, barW, barH * 2);
      }

      // Center subtle guideline
      ctx.fillStyle = `${accentColor}30`;
      ctx.fillRect(0, centerY - 0.5, width, 1);

      // Playhead Laser Cursor
      if (duration > 0 || isPlaying) {
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = accentColor;
        ctx.shadowBlur = 8;
        ctx.fillRect(Math.max(0, cursorX - 1), 0, 2, height);
        ctx.shadowBlur = 0;

        // Glowing playhead dot at center
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.arc(cursorX, centerY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(cursorX, centerY, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="relative w-full select-none">
  <canvas
    bind:this={canvasRef}
    onpointerdown={(e) => {
      isSeeking = true;
      handleSeek(e.clientX);
    }}
    onpointermove={(e) => {
      if (isSeeking) handleSeek(e.clientX);
    }}
    onpointerup={() => {
      isSeeking = false;
    }}
    onpointerleave={() => {
      isSeeking = false;
    }}
    class="w-full h-8 block rounded cursor-ew-resize bg-black/40 transition-opacity hover:opacity-95"
    title="Ondas de la canción (clic o arrastra para desplazarte)"
  ></canvas>
  <div class="flex justify-between items-center text-[8px] font-mono opacity-60 px-0.5 mt-0.5" style="color: {accentColor};">
    <span>{formatTime($useMusicStore.telemetry.current_time || 0)}</span>
    <span>{formatTime($useMusicStore.telemetry.duration || $useMusicStore.currentTrack?.duration_seconds || 0)}</span>
  </div>
</div>
