import React, { useEffect, useState } from "react";
import { Activity, Radio, Waves } from "lucide-react";
import type { BufferTelemetry } from "../../types/index.ts";
import { getBufferTelemetry, onBufferTelemetry } from "../../services/api.ts";
import { useMusicStore } from "../../store/index.ts";

export const SignalStatsWidget: React.FC = () => {
  const { telemetry: audioTelemetry, currentTrack, selectedDevice, bitPerfectMode, appearance } = useMusicStore();
  const [bufferTelemetry, setBufferTelemetry] = useState<BufferTelemetry>({
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
  const sampleRate = audioTelemetry.sample_rate || currentTrack?.sample_rate || 44100;
  const bitDepth = audioTelemetry.bits_per_sample || currentTrack?.bit_depth || 16;
  const bitrate = audioTelemetry.bitrate || currentTrack?.bitrate_kbps || 0;
  const channelCount = audioTelemetry.channels || 2;
  const output = audioTelemetry.output_device || selectedDevice || "Dispositivo predeterminado";

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | null = null;
    getBufferTelemetry().then((initial) => {
      if (mounted) setBufferTelemetry(initial);
    }).catch(() => {});
    onBufferTelemetry((data) => {
      if (mounted) setBufferTelemetry(data);
    }).then((stop) => {
      if (mounted) unlisten = stop;
      else stop();
    }).catch(() => {});
    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  const statCells = [
    { label: "Sample rate", value: `${(sampleRate / 1000).toFixed(1)} kHz` },
    { label: "Profundidad", value: `${bitDepth} bit` },
    { label: "Bitrate", value: bitrate ? `${bitrate} kb/s` : "PCM" },
    { label: "Canales", value: `${channelCount} ch` },
    { label: "Latencia", value: `${bufferTelemetry.latency_ms.toFixed(2)} ms` },
    { label: "Buffer HW", value: `${bufferTelemetry.hardware_buffer_frames} f` },
    { label: "Xruns", value: String(bufferTelemetry.total_xruns) },
    { label: "Lectura I/O", value: `${bufferTelemetry.io_read_time_ms.toFixed(2)} ms` },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-audiophile-surface font-mono text-xs">
      <header className="flex shrink-0 items-center justify-between border-b border-audiophile-border px-3 py-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-audiophile-muted">
          <Activity size={13} style={{ color: appearance.accentColor }} />
          Signal telemetry
        </div>
        <span className={`text-[9px] uppercase ${audioTelemetry.state === "Playing" ? "text-emerald-400" : "text-slate-500"}`}>
          {audioTelemetry.state}
        </span>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-px bg-audiophile-border">
        {statCells.map(({ label, value }) => (
          <div key={label} className="flex min-w-0 flex-col justify-center bg-audiophile-surface px-3 py-2">
            <span className="text-[9px] uppercase text-audiophile-muted">{label}</span>
            <span className="truncate text-sm font-bold text-audiophile-text" title={value}>{value}</span>
          </div>
        ))}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-audiophile-border px-3 py-2 text-[9px]">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-slate-400" title={output}>
          <Radio size={11} className="shrink-0" />{output}
        </span>
        <span className={`flex shrink-0 items-center gap-1 ${bitPerfectMode || audioTelemetry.is_bit_perfect ? "text-emerald-400" : "text-slate-500"}`}>
          <Waves size={11} />{bitPerfectMode || audioTelemetry.is_bit_perfect ? "Exclusive" : "Shared"}
        </span>
      </footer>
    </div>
  );
};