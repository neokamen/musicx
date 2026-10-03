<script lang="ts">
  import { onMount } from "svelte";
  import { Cpu, Radio, Volume2 } from "@lucide/svelte";
  import { getBufferTelemetry, onBufferTelemetry } from "../../services/api.ts";
  import {
    audioFormatStore,
    selectedDeviceStore,
    appearanceStore,
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
  let clock = $derived(audioFormat.is_bit_perfect);
</script>

<div class="flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-audiophile-surface p-2 font-mono text-xs">
  <section
    class="flex max-h-full w-full flex-col justify-center overflow-hidden border border-slate-800 bg-slate-950 px-3 py-2.5 shadow-inner"
    style:border-color={appearance.neonGlow ? `${appearance.accentColor}55` : undefined}
  >
    <div class="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
      <span class="text-[9px] uppercase tracking-[0.16em] text-slate-500">Sample rate</span>
      <span class="text-[9px] uppercase {clock ? 'text-emerald-400' : 'text-slate-500'}">
        {clock ? "Bit-perfect" : telemetry.state}
      </span>
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
      <span class="ml-auto {clock ? 'text-emerald-400' : 'text-slate-500'}">{telemetry.state}</span>
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
