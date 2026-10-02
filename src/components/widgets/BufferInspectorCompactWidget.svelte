<script lang="ts">
  import { onMount } from "svelte";
  import type { BufferTelemetry } from "../../types/index.ts";
  import { onBufferTelemetry, setAudioBufferSize, getBufferTelemetry } from "../../services/api.ts";
  import { useMusicStore } from "../../store/index.ts";
  import { isStreamTrack } from "../../lib/streamTracks.ts";
  import { radioAudioService } from "../../services/radioAudioService.ts";
  import { formatDataSizeParts } from "../../lib/formatBytes.ts";
  import { Sliders } from "@lucide/svelte";

  const BUFFER_SIZES = [64, 128, 256, 512, 1024];

  const musicStore = useMusicStore;
  let appearance = $derived($musicStore.appearance);
  let activeRadioStation = $derived($musicStore.activeRadioStation);
  let isRadioPlaying = $derived($musicStore.isRadioPlaying);
  let isPlaying = $derived($musicStore.isPlaying);
  let currentTrack = $derived($musicStore.currentTrack);

  let telemetry = $state<BufferTelemetry>({
    buffer_capacity_frames: 88200,
    buffer_fill_frames: 0,
    buffer_fill_percent: 0,
    hardware_buffer_frames: 256,
    sample_rate: 44100,
    channels: 2,
    latency_ms: 5.80,
    underruns: 0,
    overruns: 0,
    total_xruns: 0,
    io_read_time_ms: 0,
    is_network_mount: false,
    is_active: false,
  });

  let selectedBufferSize = $state<number>(256);
  let isChangingBuffer = $state(false);

  let isRadioMode = $derived(Boolean(isRadioPlaying && activeRadioStation));
  let isStreamMode = $derived(Boolean(isStreamTrack(currentTrack) && isPlaying && !isRadioMode));
  let isNetworkMode = $derived(isRadioMode || isStreamMode);

  let radioBytesPerSecond = $state(0);
  let radioSessionBytes = $state(0);
  let radioIsRealUsage = $state(false);

  onMount(() => {
    const unsub = radioAudioService.subscribe((playbackState) => {
      radioBytesPerSecond = playbackState.status === "playing" ? playbackState.bytesPerSecond || 0 : 0;
      radioSessionBytes = playbackState.sessionBytesTotal || 0;
      radioIsRealUsage = Boolean(playbackState.isRealDataUsage);
    });

    getBufferTelemetry()
      .then((init) => {
        telemetry = init;
        selectedBufferSize = init.hardware_buffer_frames;
      })
      .catch(console.error);

    let unlisten: (() => void) | null = null;
    let mounted = true;

    onBufferTelemetry((data) => {
      if (!mounted) return;
      telemetry = data;
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(console.error);

    return () => {
      mounted = false;
      unsub();
      if (unlisten) unlisten();
    };
  });

  async function handleBufferSizeChange(newSize: number) {
    if (isChangingBuffer || newSize === telemetry.hardware_buffer_frames) return;
    isChangingBuffer = true;
    try {
      const confirmed = await setAudioBufferSize(newSize);
      selectedBufferSize = confirmed;
      telemetry.hardware_buffer_frames = confirmed;
      telemetry.latency_ms = (confirmed / (telemetry.sample_rate || 44100)) * 1000;
      const latMap: Record<number, "ultra_low" | "low" | "medium" | "stable"> = {
        64: "ultra_low",
        256: "low",
        512: "medium",
        1024: "stable",
      };
      if (latMap[confirmed]) {
        useMusicStore.getState().setAudioSettings({ bufferLatency: latMap[confirmed] });
      }
    } catch (e) {
      console.error("Failed to change buffer size:", e);
    } finally {
      isChangingBuffer = false;
    }
  }

  const SEGMENTS_COUNT = 100;
  let radioExpectedBps = $derived(
    isStreamMode && currentTrack?.bitrate_kbps
      ? (currentTrack.bitrate_kbps * 1000) / 8
      : activeRadioStation?.bitrate && activeRadioStation.bitrate > 0
        ? (activeRadioStation.bitrate * 1000) / 8
        : 40 * 1024
  );
  let radioFillPercent = $derived(
    radioExpectedBps > 0 ? Math.min(100, (radioBytesPerSecond / radioExpectedBps) * 100) : 0
  );
  let displayFillPercent = $derived(isNetworkMode ? radioFillPercent : telemetry.buffer_fill_percent);
  let sessionDataParts = $derived(formatDataSizeParts(radioSessionBytes));
  let activeSegments = $derived(
    Math.min(SEGMENTS_COUNT, Math.max(0, Math.round((displayFillPercent / 100) * SEGMENTS_COUNT)))
  );
</script>

<div class="flex flex-col h-full bg-audiophile-surface text-audiophile-text border border-audiophile-border p-2.5 rounded-sm select-none justify-between gap-2 overflow-hidden text-xs">
  <!-- Metrics Row: Latency + Fill % + I/O -->
  <div class="grid grid-cols-3 gap-1.5 text-center">
    <div class="bg-audiophile-surface2/50 border border-slate-600/35 p-1.5 rounded">
      <div class="text-[9px] text-audiophile-muted uppercase">Latency</div>
      <div class="text-sm font-bold font-mono tracking-tight" style:color={appearance.accentColor}>
        {telemetry.latency_ms.toFixed(2)} <span class="text-[9px] font-normal text-audiophile-muted">ms</span>
      </div>
    </div>

    <div class="bg-audiophile-surface2/50 border border-slate-600/35 p-1.5 rounded">
      <div class="text-[9px] text-audiophile-muted uppercase">
        {isNetworkMode ? (radioIsRealUsage ? "En vivo" : "Estimado") : "Lleno"}
      </div>
      <div class="text-sm font-bold font-mono tracking-tight {isNetworkMode ? 'text-white' : 'text-audiophile-text'}">
        {#if isNetworkMode}
          {(radioBytesPerSecond / 1024).toFixed(1)} <span class="text-[9px] font-normal text-audiophile-muted">KB/s</span>
        {:else}
          {telemetry.buffer_fill_percent.toFixed(1)}%
        {/if}
      </div>
    </div>

    <div class="bg-audiophile-surface2/50 border border-slate-600/35 p-1.5 rounded">
      <div class="text-[9px] text-audiophile-muted uppercase">
        {isNetworkMode ? "Sesión" : "I/O Read"}
      </div>
      <div class="text-sm font-bold font-mono tracking-tight text-audiophile-text">
        {#if isNetworkMode}
          {sessionDataParts.value} <span class="text-[9px] font-normal text-audiophile-muted">{sessionDataParts.unit}</span>
        {:else}
          {telemetry.io_read_time_ms.toFixed(2)} ms
        {/if}
      </div>
    </div>
  </div>

  <!-- Mini Segmented Bar -->
  <div class="space-y-1">
    <div class="flex justify-between text-[9px] font-mono text-audiophile-muted">
      <span>{isNetworkMode ? (isStreamMode ? "Stream en vivo" : "Descarga en vivo") : "Ring Buffer"}</span>
      <span>
        {isNetworkMode
          ? isStreamMode
            ? currentTrack?.title || "Stream Music"
            : activeRadioStation?.name || "Radio online"
          : `${telemetry.buffer_fill_frames.toLocaleString()} / ${telemetry.buffer_capacity_frames.toLocaleString()} f`}
      </span>
    </div>
    <div
      class="grid gap-[1px] h-2.5 bg-black/40 p-0.5 rounded border border-slate-600/25"
      style="grid-template-columns: repeat({SEGMENTS_COUNT}, minmax(0, 1fr))"
    >
      {#each Array.from({ length: SEGMENTS_COUNT }) as _, idx}
        {@const isActive = idx < activeSegments}
        <div
          class="h-full rounded-3xs transition-all duration-75 {isActive
            ? idx < 75
              ? 'shadow-sm'
              : idx < 90
                ? 'bg-amber-400 shadow-[0_0_3px_#f59e0b]'
                : 'bg-rose-500 shadow-[0_0_3px_#f43f5e]'
            : 'bg-neutral-800/40'}"
          style:background-color={isActive && idx < 75 ? appearance.accentColor : undefined}
        ></div>
      {/each}
    </div>
  </div>

  <!-- Frame size quick selector -->
  <div class="pt-1 border-t border-slate-600/25">
    <div class="flex items-center justify-between text-[9px] font-mono text-audiophile-muted mb-1">
      <span class="flex items-center gap-1">
        <Sliders size={10} /> Tamaño Buffer
      </span>
      <span class="text-audiophile-text font-bold">{selectedBufferSize} frames</span>
    </div>
    <div class="grid grid-cols-5 gap-1">
      {#each BUFFER_SIZES as size (size)}
        {@const isSelected = selectedBufferSize === size}
        <button
          type="button"
          disabled={isChangingBuffer}
          onclick={() => handleBufferSizeChange(size)}
          class="py-0.5 text-[10px] font-mono rounded border transition-colors {isSelected
            ? 'font-bold border-audiophile-cyan text-audiophile-text'
            : 'bg-audiophile-base border-slate-600/45 text-audiophile-muted hover:text-audiophile-text'} {isChangingBuffer
            ? 'opacity-50 cursor-not-allowed'
            : 'cursor-pointer'}"
          style:border-color={isSelected ? appearance.accentColor : undefined}
          style:color={isSelected ? appearance.accentColor : undefined}
        >
          {size}
        </button>
      {/each}
    </div>
  </div>
</div>
