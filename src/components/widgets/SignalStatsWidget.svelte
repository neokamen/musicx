<script lang="ts">
  import { onMount } from "svelte";
  import { Activity, Radio, Waves } from "@lucide/svelte";
  import type { BufferTelemetry } from "../../types/index.ts";
  import { getBufferTelemetry, onBufferTelemetry } from "../../services/api.ts";
  import {
    audioFormatStore,
    selectedDeviceStore,
    appearanceStore,
  } from "../../store/index.ts";

  let audioFormat = $derived($audioFormatStore);
  let selectedDevice = $derived($selectedDeviceStore);
  let appearance = $derived($appearanceStore);

  let bufferTelemetry = $state<BufferTelemetry>({
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
        bufferTelemetry = initial;
      })
      .catch(() => {});

    onBufferTelemetry((data) => {
      bufferTelemetry = data;
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
  let bitrate = $derived(audioFormat.bitrate || 0);
  let channelCount = $derived(audioFormat.channels || 2);
  let output = $derived(selectedDevice || "Dispositivo predeterminado");

  let statCells = $derived([
    { label: "Sample rate", value: `${(sampleRate / 1000).toFixed(1)} kHz` },
    { label: "Profundidad", value: `${bitDepth} bit` },
    { label: "Bitrate", value: bitrate ? `${bitrate} kb/s` : "PCM" },
    { label: "Canales", value: `${channelCount} ch` },
    { label: "Latencia", value: `${bufferTelemetry.latency_ms.toFixed(2)} ms` },
    { label: "Buffer HW", value: `${bufferTelemetry.hardware_buffer_frames} f` },
    { label: "Xruns", value: String(bufferTelemetry.total_xruns) },
    { label: "Lectura I/O", value: `${bufferTelemetry.io_read_time_ms.toFixed(2)} ms` },
  ]);
</script>

<div class="flex h-full min-h-0 flex-col overflow-hidden bg-audiophile-surface font-mono text-xs">
  <header class="flex shrink-0 items-center justify-between border-b border-audiophile-border px-3 py-2">
    <div class="flex items-center gap-2 text-[10px] uppercase tracking-widest text-audiophile-muted">
      <Activity size={13} style="color: {appearance.accentColor}" />
      Signal telemetry
    </div>
    <span class="text-[9px] uppercase {audioTelemetry.state === 'Playing' ? 'text-emerald-400' : 'text-slate-500'}">
      {audioTelemetry.state}
    </span>
  </header>
  <div class="grid min-h-0 flex-1 grid-cols-2 gap-px bg-audiophile-border">
    {#each statCells as { label, value } (label)}
      <div class="flex min-w-0 flex-col justify-center bg-audiophile-surface px-3 py-2">
        <span class="text-[9px] uppercase text-audiophile-muted">{label}</span>
        <span class="truncate text-sm font-bold text-audiophile-text" title={value}>{value}</span>
      </div>
    {/each}
  </div>
  <footer class="flex shrink-0 items-center justify-between gap-2 border-t border-audiophile-border px-3 py-2 text-[9px]">
    <span class="flex min-w-0 items-center gap-1.5 truncate text-slate-400" title={output}>
      <Radio size={11} class="shrink-0" />{output}
    </span>
    <span class="flex shrink-0 items-center gap-1 {bitPerfectMode || audioTelemetry.is_bit_perfect ? 'text-emerald-400' : 'text-slate-500'}">
      <Waves size={11} />{bitPerfectMode || audioTelemetry.is_bit_perfect ? "Exclusive" : "Shared"}
    </span>
  </footer>
</div>
