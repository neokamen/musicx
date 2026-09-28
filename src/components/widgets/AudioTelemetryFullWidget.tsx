import React, { useEffect, useState } from "react";
import { Activity, AudioLines, HardDrive, Radio, Waves } from "lucide-react";
import type { BufferTelemetry } from "../../types/index.ts";
import type { RadioPlaybackState } from "../../types/radio.ts";
import { getBufferTelemetry, onBufferTelemetry } from "../../services/api.ts";
import { radioAudioService } from "../../services/radioAudioService.ts";
import { formatDataSize } from "../../lib/formatBytes.ts";
import { useMusicStore } from "../../store/index.ts";
import { SpectrumVisualizer } from "./SpectrumVisualizer.tsx";

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
};

export const AudioTelemetryFullWidget: React.FC = () => {
  const { telemetry, currentTrack, selectedDevice, bitPerfectMode, appearance, activeRadioStation, isRadioPlaying } = useMusicStore();
  const [radioState, setRadioState] = useState<RadioPlaybackState>({ status: "stopped", elapsedSeconds: 0 });
  const [buffer, setBuffer] = useState<BufferTelemetry>({
    buffer_capacity_frames: 0, buffer_fill_frames: 0, buffer_fill_percent: 0,
    hardware_buffer_frames: 0, sample_rate: 44100, channels: 2, latency_ms: 0,
    underruns: 0, overruns: 0, total_xruns: 0, io_read_time_ms: 0,
    is_network_mount: false, is_active: false,
  });

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | null = null;
    getBufferTelemetry().then((value) => { if (mounted) setBuffer(value); }).catch(() => {});
    onBufferTelemetry((value) => { if (mounted) setBuffer(value); }).then((stop) => {
      if (mounted) unlisten = stop;
      else stop();
    }).catch(() => {});
    const unsubscribeRadio = radioAudioService.subscribe(setRadioState);
    return () => { mounted = false; unlisten?.(); unsubscribeRadio(); };
  }, []);

  const isRadioActive = Boolean(activeRadioStation) && (isRadioPlaying || radioState.status !== "stopped");
  const sampleRate = telemetry.sample_rate || currentTrack?.sample_rate || buffer.sample_rate;
  const bitDepth = telemetry.bits_per_sample || currentTrack?.bit_depth || 16;
  const bitrate = isRadioActive
    ? radioState.bitrateKbps || activeRadioStation?.bitrate || 0
    : telemetry.bitrate || currentTrack?.bitrate_kbps || 0;
  const source = isRadioActive
    ? activeRadioStation?.name || "Radio online"
    : telemetry.filepath || currentTrack?.filepath || "Sin fuente activa";
  const values = [
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
  ];
  const fill = Math.max(0, Math.min(100, buffer.buffer_fill_percent));

  return (
    <div className="flex h-full min-h-[240px] min-w-0 flex-col overflow-hidden bg-[#0b0e12] font-mono text-slate-100">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-700/70 px-2.5 py-2">
        <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-slate-300"><Activity size={12} style={{ color: appearance.accentColor }} /> Audio telemetry / full</span>
        <span className={`shrink-0 text-[8px] uppercase ${telemetry.state === "Playing" ? "text-emerald-400" : "text-slate-500"}`}>{telemetry.state}</span>
      </header>
      <div className="flex min-w-0 items-center gap-2 border-b border-slate-800 px-2.5 py-1.5">
        <HardDrive size={11} className="shrink-0 text-slate-500" />
        <span className="truncate text-[9px] text-slate-300" title={source}>{source}</span>
        <span className="ml-auto shrink-0 text-[8px] text-slate-500">{isRadioActive ? radioState.streamTitle || "Radio" : currentTrack?.title || "--"}</span>
      </div>
      <div className="h-10 shrink-0 border-b border-slate-800 bg-black/30" title="Doble clic para cambiar el estilo del espectro">
        <SpectrumVisualizer height={40} />
      </div>
      <div className="flex shrink-0 items-center gap-2 px-2.5 py-1.5 text-[8px] text-slate-500">
        <span className="flex items-center gap-1"><Waves size={10} /> Ring buffer</span>
        <div className="h-1 flex-1 overflow-hidden bg-black/70"><div className="h-full" style={{ width: `${fill}%`, backgroundColor: appearance.accentColor }} /></div>
        <span className="w-10 text-right">{fill.toFixed(1)}%</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-px overflow-auto border-t border-slate-800 bg-slate-800 sm:grid-cols-4">
        {values.map(([label, value]) => (
          <div key={label} className="min-w-0 bg-[#0b0e12] px-2 py-1.5">
            <div className="text-[7px] uppercase tracking-wider text-slate-500">{label}</div>
            <div className="truncate text-[9px] font-semibold text-slate-200" title={value}>{value}</div>
          </div>
        ))}
      </div>
      <footer className="flex shrink-0 items-center justify-between border-t border-slate-800 px-2.5 py-1 text-[8px] text-slate-500">
        <span className="flex min-w-0 items-center gap-1 truncate"><Radio size={10} /> {isRadioActive ? `${((radioState.bytesPerSecond || 0) / 1024).toFixed(1)} KB/s · ${radioState.isRealDataUsage ? "medido" : "estimado"}` : telemetry.output_device || selectedDevice || "Salida predeterminada"}</span>
        <span className="flex items-center gap-1"><AudioLines size={10} /> {!isRadioActive && (bitPerfectMode || telemetry.is_bit_perfect) ? "Bit-perfect" : "Shared mode"}</span>
      </footer>
    </div>
  );
};