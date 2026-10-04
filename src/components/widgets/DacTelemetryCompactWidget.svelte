<script lang="ts">
  import { onMount } from "svelte";
  import { Cpu, Radio, Volume2 } from "@lucide/svelte";
  import { getBufferTelemetry, onBufferTelemetry } from "../../services/api.ts";
  import {
    audioFormatStore,
    selectedDeviceStore,
    appearanceStore,
    isPlayingStore,
    useMusicStore,
    AUDIO_ENGINES,
  } from "../../store/index.ts";
  import type { BufferTelemetry } from "../../types/index.ts";

  const INITIAL_BUFFER: BufferTelemetry = {
    buffer_capacity_frames: 0,
    buffer_fill_frames: 0,
    buffer_fill_percent: 0,
    hardware_buffer_frames: 0,
    sample_rate: 44100,
    channels: 2,
    latency_ms: 0,
    underruns: 0,
    overruns: 0,
    total_xruns: 0,
    io_read_time_ms: 0,
    is_network_mount: false,
    is_active: false,
  };

  let audioFormat = $derived($audioFormatStore);
  let selectedDevice = $derived($selectedDeviceStore);
  let appearance = $derived($appearanceStore);
  let isPlaying = $derived($isPlayingStore);

  let buffer = $state(INITIAL_BUFFER);

  onMount(() => {
    let unlisten: (() => void) | null = null;
    getBufferTelemetry()
      .then((initial) => {
        buffer = initial;
      })
      .catch(() => {});

    onBufferTelemetry((next) => {
      buffer = next;
    })
      .then((stop) => {
        unlisten = stop;
      })
      .catch(() => {});

    return () => {
      unlisten?.();
    };
  });

  let sampleRate = $derived(audioFormat.sample_rate || 44100);
  let bitDepth = $derived(audioFormat.bits_per_sample || 16);
  let bitrate = $derived(audioFormat.bitrate || 1411);
  let channels = $derived(audioFormat.channels === 1 ? "1.0 Mono" : `${audioFormat.channels || 2}.0 Stereo`);
  let device = $derived(selectedDevice || "Dispositivo predeterminado");

  const musicStore = useMusicStore;
  let audioSettings = $derived($musicStore.audioSettings);
  let bitPerfectMode = $derived($musicStore.bitPerfectMode);
  let currentAudioEngine = $derived(
    AUDIO_ENGINES.find((e) => e.id === audioSettings?.resamplingQuality) ||
    (bitPerfectMode ? AUDIO_ENGINES[0] : AUDIO_ENGINES[AUDIO_ENGINES.length - 1])
  );

  function handleCycleEngine() {
    const currentId = audioSettings?.resamplingQuality || (bitPerfectMode ? "bit_perfect" : "float32");
    const currentIndex = AUDIO_ENGINES.findIndex((e) => e.id === currentId);
    const nextIndex = (currentIndex + 1) % AUDIO_ENGINES.length;
    const nextEngine = AUDIO_ENGINES[nextIndex];
    useMusicStore.getState().setAudioSettings({ resamplingQuality: nextEngine.id });
  }
</script>

<div class="flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-audiophile-surface p-2 font-mono text-xs">
  <section
    class="flex max-h-full w-full flex-col justify-center overflow-hidden border border-slate-800 bg-slate-950 px-3 py-2.5 shadow-inner"
    style:border-color={appearance.neonGlow ? `${appearance.accentColor}55` : undefined}
  >
    <div class="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
      <span class="text-[9px] uppercase tracking-[0.16em] text-slate-500">Sample rate</span>
      <button
        type="button"
        onclick={handleCycleEngine}
        title={`Motor actual: ${currentAudioEngine.name} · ${currentAudioEngine.description} (clic para conmutar)`}
        class="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded border transition cursor-pointer hover:brightness-125"
        style:border-color="{currentAudioEngine.color}60"
        style:background-color="{currentAudioEngine.color}20"
        style:color={currentAudioEngine.color}
      >
        {currentAudioEngine.badge} · {currentAudioEngine.id === "bit_perfect" ? "Bit-Perfect" : currentAudioEngine.name.split(" ")[0]}
      </button>
    </div>
    <div class="flex items-baseline gap-1 pt-1">
      <span class="text-2xl font-black" style:color={appearance.accentColor}>
        {(sampleRate / 1000).toFixed(1)}
      </span>
      <span class="text-xs text-slate-400">kHz</span>
      <span class="ml-auto text-sm font-bold text-amber-300">
        {bitrate}<span class="ml-1 text-[9px] font-normal text-slate-500">kb/s</span>
      </span>
    </div>
    <div class="mt-1 flex items-center gap-2 text-[10px] text-slate-300">
      <span>{bitDepth}-bit</span><span class="text-slate-700">/</span><span>{channels}</span>
      <span class="ml-auto {isPlaying ? 'text-emerald-400' : 'text-slate-500'}">{isPlaying ? "Playing" : "Stopped"}</span>
    </div>
    <div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-800 pt-2 text-[9px]">
      <span class="flex min-w-0 items-center gap-1 text-slate-500"><Cpu size={10} class="shrink-0" />Hardware</span>
      <span class="truncate text-right font-semibold text-slate-200" title={device}>{device}</span>
      <span class="flex items-center gap-1 text-slate-500"><Radio size={10} />Buffer</span>
      <span class="text-right text-slate-200">{buffer.hardware_buffer_frames} f · {buffer.latency_ms.toFixed(2)} ms</span>
      <span class="flex items-center gap-1 text-slate-500"><Volume2 size={10} />Underruns</span>
      <span class="text-right font-bold {buffer.underruns ? 'text-rose-400' : 'text-emerald-400'}">{buffer.underruns}</span>
    </div>
  </section>
</div>
