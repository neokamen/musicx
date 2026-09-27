import React, { useEffect, useState } from "react";
import { AudioLines, HardDrive, Radio, Timer, Waves } from "lucide-react";
import type { BufferTelemetry } from "../../types/index.ts";
import { getBufferTelemetry, onBufferTelemetry } from "../../services/api.ts";
import { useMusicStore } from "../../store/index.ts";

export const AudioDiagnosticsWidget: React.FC = () => {
  const { telemetry, currentTrack, activeRadioStation, isRadioPlaying, appearance } = useMusicStore();
  const [buffer, setBuffer] = useState<BufferTelemetry>({
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

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | null = null;
    getBufferTelemetry().then((initial) => { if (mounted) setBuffer(initial); }).catch(() => {});
    onBufferTelemetry((next) => { if (mounted) setBuffer(next); }).then((stop) => {
      if (mounted) unlisten = stop;
      else stop();
    }).catch(() => {});
    return () => { mounted = false; unlisten?.(); };
  }, []);

  const source = isRadioPlaying ? activeRadioStation?.name || "Radio online" : telemetry.filepath || currentTrack?.filepath || "Sin fuente";
  const detailRows = [
    { label: "Estado", value: telemetry.state },
    { label: "Formato", value: `${currentTrack?.format || (isRadioPlaying ? activeRadioStation?.codec?.toUpperCase() : "PCM") || "PCM"} · ${telemetry.channels || 2} canales` },
    { label: "Reloj", value: `${((telemetry.sample_rate || buffer.sample_rate || 44100) / 1000).toFixed(1)} kHz / ${telemetry.bits_per_sample || currentTrack?.bit_depth || 16} bit` },
    { label: "Bitrate", value: `${telemetry.bitrate || currentTrack?.bitrate_kbps || activeRadioStation?.bitrate || 0} kb/s` },
    { label: "Buffer hardware", value: `${buffer.hardware_buffer_frames} frames · ${buffer.latency_ms.toFixed(2)} ms` },
    { label: "Ring buffer", value: `${buffer.buffer_fill_frames.toLocaleString()} / ${buffer.buffer_capacity_frames.toLocaleString()} frames` },
    { label: "Lectura", value: `${buffer.io_read_time_ms.toFixed(2)} ms · ${buffer.is_network_mount ? "red" : "local"}` },
    { label: "XRuns", value: `${buffer.total_xruns} (${buffer.underruns} underruns / ${buffer.overruns} overruns)` },
  ];
  const fill = Math.max(0, Math.min(100, buffer.buffer_fill_percent));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#111820] font-mono text-xs text-slate-100">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-700/70 px-3 py-2">
        <span className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-400"><AudioLines size={13} style={{ color: appearance.accentColor }} />Diagnóstico de audio</span>
        <span className="text-[9px] uppercase text-slate-500">{buffer.is_active ? "Engine active" : "Standby"}</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3">
        <div className="flex min-w-0 items-center gap-2 border-l-2 px-2 py-1.5" style={{ borderColor: appearance.accentColor, backgroundColor: `${appearance.accentColor}10` }}>
          {isRadioPlaying ? <Radio size={13} className="shrink-0" /> : <HardDrive size={13} className="shrink-0" />}
          <span className="truncate text-[10px] text-slate-300" title={source}>{source}</span>
        </div>
        <div className="flex items-center justify-between text-[9px] text-slate-500">
          <span className="flex items-center gap-1"><Timer size={10} />Ring buffer fill</span>
          <span>{fill.toFixed(1)}%</span>
        </div>
        <div className="h-2 shrink-0 overflow-hidden bg-black/60">
          <div className="h-full transition-[width] duration-200" style={{ width: `${fill}%`, backgroundColor: appearance.accentColor }} />
        </div>
        <div className="grid min-h-0 grid-cols-2 gap-px border border-slate-700/60 bg-slate-700/60">
          {detailRows.map(({ label, value }) => (
            <div key={label} className="min-w-0 bg-[#111820] px-2 py-1.5">
              <div className="text-[8px] uppercase text-slate-500">{label}</div>
              <div className="truncate text-[10px] font-semibold text-slate-200" title={value}>{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-auto flex shrink-0 items-center gap-1 border-t border-slate-700/60 pt-1.5 text-[9px] text-slate-500">
          <Waves size={10} />{buffer.is_network_mount ? "Fuente montada en red" : "Fuente en almacenamiento local"}
        </div>
      </div>
    </div>
  );
};