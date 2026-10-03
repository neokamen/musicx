<script lang="ts">
  import { onMount } from "svelte";
  import { AudioLines, HardDrive, Radio, Timer, Waves } from "@lucide/svelte";
  import type { BufferTelemetry } from "../../types/index.ts";
  import { getBufferTelemetry, onBufferTelemetry } from "../../services/api.ts";
  import {
    audioFormatStore,
    currentTrackStore,
    activeRadioStationStore,
    isRadioPlayingStore,
    isPlayingStore,
    appearanceStore,
  } from "../../store/index.ts";

  let audioFormat = $derived($audioFormatStore);
  let currentTrack = $derived($currentTrackStore);
  let activeRadioStation = $derived($activeRadioStationStore);
  let isRadioPlaying = $derived($isRadioPlayingStore);
  let isPlaying = $derived($isPlayingStore);
  let appearance = $derived($appearanceStore);

  let buffer = $state<BufferTelemetry>({
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
  });

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

  let source = $derived(
    isRadioPlaying
      ? activeRadioStation?.name || "Radio online"
      : currentTrack?.filepath || "Sin fuente"
  );

  let detailRows = $derived([
    { label: "Estado", value: isPlaying ? "Playing" : "Stopped" },
    {
      label: "Formato",
      value: `${currentTrack?.format || (isRadioPlaying ? activeRadioStation?.codec?.toUpperCase() : "PCM") || "PCM"} · ${audioFormat.channels || 2} canales`,
    },
    {
      label: "Reloj",
      value: `${((audioFormat.sample_rate || buffer.sample_rate || 44100) / 1000).toFixed(1)} kHz / ${audioFormat.bits_per_sample || 16} bit`,
    },
    {
      label: "Bitrate",
      value: `${audioFormat.bitrate || activeRadioStation?.bitrate || 0} kb/s`,
    },
    {
      label: "Buffer hardware",
      value: `${buffer.hardware_buffer_frames} frames · ${buffer.latency_ms.toFixed(2)} ms`,
    },
    {
      label: "Ring buffer",
      value: `${buffer.buffer_fill_frames.toLocaleString()} / ${buffer.buffer_capacity_frames.toLocaleString()} frames`,
    },
    {
      label: "Lectura",
      value: `${buffer.io_read_time_ms.toFixed(2)} ms · ${buffer.is_network_mount ? "red" : "local"}`,
    },
    {
      label: "XRuns",
      value: `${buffer.total_xruns} (${buffer.underruns} underruns / ${buffer.overruns} overruns)`,
    },
  ]);

  let fill = $derived(Math.max(0, Math.min(100, buffer.buffer_fill_percent)));
</script>

<div class="flex h-full min-h-0 flex-col overflow-hidden bg-[#111820] font-mono text-xs text-slate-100">
  <header class="flex shrink-0 items-center justify-between border-b border-slate-700/70 px-3 py-2">
    <span class="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-400">
      <AudioLines size={13} style="color: {appearance.accentColor}" />Diagnóstico de audio
    </span>
    <span class="text-[9px] uppercase text-slate-500">{buffer.is_active ? "Engine active" : "Standby"}</span>
  </header>
  <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3">
    <div
      class="flex min-w-0 items-center gap-2 border-l-2 px-2 py-1.5"
      style:border-color={appearance.accentColor}
      style:background-color="{appearance.accentColor}10"
    >
      {#if isRadioPlaying}
        <Radio size={13} class="shrink-0" />
      {:else}
        <HardDrive size={13} class="shrink-0" />
      {/if}
      <span class="truncate text-[10px] text-slate-300" title={source}>{source}</span>
    </div>
    <div class="flex items-center justify-between text-[9px] text-slate-500">
      <span class="flex items-center gap-1"><Timer size={10} />Ring buffer fill</span>
      <span>{fill.toFixed(1)}%</span>
    </div>
    <div class="h-2 shrink-0 overflow-hidden bg-black/60">
      <div
        class="h-full transition-[width] duration-200"
        style:width="{fill}%"
        style:background-color={appearance.accentColor}
      ></div>
    </div>
    <div class="grid min-h-0 grid-cols-2 gap-px border border-slate-700/60 bg-slate-700/60">
      {#each detailRows as { label, value } (label)}
        <div class="min-w-0 bg-[#111820] px-2 py-1.5">
          <div class="text-[8px] uppercase text-slate-500">{label}</div>
          <div class="truncate text-[10px] font-semibold text-slate-200" title={value}>{value}</div>
        </div>
      {/each}
    </div>
    <div class="mt-auto flex shrink-0 items-center gap-1 border-t border-slate-700/60 pt-1.5 text-[9px] text-slate-500">
      <Waves size={10} />{buffer.is_network_mount ? "Fuente montada en red" : "Fuente en almacenamiento local"}
    </div>
  </div>
</div>
