<script lang="ts">
  import { onMount } from "svelte";
  import { Activity, AudioLines, HardDrive, Radio, Waves } from "@lucide/svelte";
  import type { BufferTelemetry } from "../../types/index.ts";
  import type { RadioPlaybackState } from "../../types/radio.ts";
  import { getBufferTelemetry, onBufferTelemetry } from "../../services/api.ts";
  import { radioAudioService } from "../../services/radioAudioService.ts";
  import {
    useMusicStore,
    audioFormatStore,
    currentTrackStore,
    selectedDeviceStore,
    appearanceStore,
    activeRadioStationStore,
    isRadioPlayingStore,
  } from "../../store/index.ts";
  import SpectrumVisualizer from "./SpectrumVisualizer.svelte";

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  };

  let radioState = $state<RadioPlaybackState>({ status: "stopped", elapsedSeconds: 0 });
  let buffer = $state<BufferTelemetry>({
    buffer_capacity_frames: 0, buffer_fill_frames: 0, buffer_fill_percent: 0,
    hardware_buffer_frames: 0, sample_rate: 44100, channels: 2, latency_ms: 0,
    underruns: 0, overruns: 0, total_xruns: 0, io_read_time_ms: 0,
    is_network_mount: false, is_active: false,
  });

  onMount(() => {
    let unlisten: (() => void) | null = null;
    let mounted = true;
    getBufferTelemetry().then((value) => { if (mounted) buffer = value; }).catch(() => {});
    onBufferTelemetry((value) => { if (mounted) buffer = value; }).then((stop) => {
      if (mounted) unlisten = stop;
      else stop();
    }).catch(() => {});
    const unsubscribeRadio = radioAudioService.subscribe((s) => { radioState = s; });

    return () => {
      mounted = false;
      unlisten?.();
      unsubscribeRadio();
    };
  });

  let audioFormat = $derived($audioFormatStore);
  let currentTrack = $derived($currentTrackStore);
  let selectedDevice = $derived($selectedDeviceStore);
  let appearance = $derived($appearanceStore);
  let activeRadioStation = $derived($activeRadioStationStore);
  let isRadioPlaying = $derived($isRadioPlayingStore);

  let isRadioActive = $derived(Boolean(activeRadioStation) && (isRadioPlaying || radioState.status !== "stopped"));
  let sampleRate = $derived(audioFormat.sample_rate || buffer.sample_rate);
  let bitDepth = $derived(audioFormat.bits_per_sample || 16);
  let bitrate = $derived(
    isRadioActive
      ? radioState.bitrateKbps || activeRadioStation?.bitrate || 0
      : audioFormat.bitrate || 0
  );
  let source = $derived(
    isRadioActive
      ? activeRadioStation?.name || "Radio online"
      : currentTrack?.filepath || "Sin fuente activa"
  );

  let values = $derived([
    ["Sample rate", isRadioActive ? "Stream" : `${(sampleRate / 1000).toFixed(1)} kHz`],
    ["Bit depth", isRadioActive ? "N/A" : `${bitDepth} bit`],
    ["Bitrate", bitrate ? `${bitrate} kb/s` : "PCM"],
    ["Canales", `${isRadioActive ? 2 : telemetry.channels || buffer.channels} ch`],
    ["Codec", isRadioActive ? activeRadioStation?.codec?.toUpperCase() || "AUDIO" : currentTrack?.format?.toUpperCase() || "PCM"],
    ["Tiempo", isRadioActive ? formatTime(radioState.elapsedSeconds) : `${formatTime(telemetry.current_time)} / ${formatTime(telemetry.duration)}`],
    ["Volumen", `${Math.round(telemetry.volume * 100)}%`],
    ["Bit-perfect", !isRadioActive && (bitPerfectMode || telemetry.is_bit_perfect) ? "Activo" : "Compartido"],
    ["Buffer llenado", isRadioActive ? "Web stream" : `${buffer.buffer_fill_frames.toLocaleString()} / ${buffer.buffer_capacity_frames.toLocaleString()} f`],
    ["Buffer HW", isRadioActive ? "Web Audio" : `${buffer.hardware_buffer_frames.toLocaleString()} frames`],
    ["Latencia", isRadioActive ? "Web Audio" : `${buffer.latency_ms.toFixed(2)} ms`],
    ["Xruns", isRadioActive ? "N/A" : `${buffer.total_xruns} · ${buffer.underruns}↓ ${buffer.overruns}↑`],
    [isRadioActive ? "Descarga en vivo" : "Lectura I/O", isRadioActive ? `${formatDataSize(radioState.bytesPerSecond || 0)}/s` : `${buffer.io_read_time_ms.toFixed(2)} ms`],
    [isRadioActive ? "Acumulado" : "Fuente", isRadioActive ? formatDataSize(radioState.sessionBytesTotal || 0) : buffer.is_network_mount ? "Montaje de red" : "Almacenamiento local"],
    ["Salida", telemetry.output_device || selectedDevice || "Predeterminada"],
    ["Estado del buffer", buffer.is_active ? "Activo" : "En espera"],
  ]);

  let fill = $derived(Math.max(0, Math.min(100, buffer.buffer_fill_percent)));
</script>

<div class="flex h-full min-h-[240px] min-w-0 flex-col overflow-hidden bg-[#0b0e12] font-mono text-slate-100">
  <header class="flex shrink-0 items-center justify-between gap-2 border-b border-slate-700/70 px-2.5 py-2">
    <span class="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-slate-300">
      <Activity size={12} style="color: {appearance.accentColor}" /> Audio telemetry / full
    </span>
    <span class="shrink-0 text-[8px] uppercase {telemetry.state === 'Playing' ? 'text-emerald-400' : 'text-slate-500'}">
      {telemetry.state}
    </span>
  </header>
  <div class="flex min-w-0 items-center gap-2 border-b border-slate-800 px-2.5 py-1.5">
    <HardDrive size={11} class="shrink-0 text-slate-500" />
    <span class="truncate text-[9px] text-slate-300" title={source}>{source}</span>
    <span class="ml-auto shrink-0 text-[8px] text-slate-500">{isRadioActive ? radioState.streamTitle || "Radio" : currentTrack?.title || "--"}</span>
  </div>
  <div class="h-10 shrink-0 border-b border-slate-800 bg-black/30" title="Doble clic para cambiar el estilo del espectro">
    <SpectrumVisualizer height={40} />
  </div>
  <div class="flex shrink-0 items-center gap-2 px-2.5 py-1.5 text-[8px] text-slate-500">
    <span class="flex items-center gap-1"><Waves size={10} /> Ring buffer</span>
    <div class="h-1 flex-1 overflow-hidden bg-black/70">
      <div class="h-full" style="width: {fill}%; background-color: {appearance.accentColor};"></div>
    </div>
    <span class="w-10 text-right">{fill.toFixed(1)}%</span>
  </div>
  <div class="grid min-h-0 flex-1 grid-cols-2 gap-px overflow-auto border-t border-slate-800 bg-slate-800 sm:grid-cols-4">
    {#each values as [label, value]}
      <div class="min-w-0 bg-[#0b0e12] px-2 py-1.5">
        <div class="text-[7px] uppercase tracking-wider text-slate-500">{label}</div>
        <div class="truncate text-[9px] font-semibold text-slate-200" title={value}>{value}</div>
      </div>
    {/each}
  </div>
  <footer class="flex shrink-0 items-center justify-between border-t border-slate-800 px-2.5 py-1 text-[8px] text-slate-500">
    <span class="flex min-w-0 items-center gap-1 truncate">
      <Radio size={10} />
      {isRadioActive ? `${((radioState.bytesPerSecond || 0) / 1024).toFixed(1)} KB/s · ${radioState.isRealDataUsage ? "medido" : "estimado"}` : telemetry.output_device || selectedDevice || "Salida predeterminada"}
    </span>
    <span class="flex items-center gap-1">
      <AudioLines size={10} />
      {!isRadioActive && (bitPerfectMode || telemetry.is_bit_perfect) ? "Bit-perfect" : "Shared mode"}
    </span>
  </footer>
</div>
