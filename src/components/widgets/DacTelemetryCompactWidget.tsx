import React, { useEffect, useState } from "react";
import { Cpu, Radio, Volume2 } from "lucide-react";
import { getBufferTelemetry, onBufferTelemetry } from "../../services/api.ts";
import { useMusicStore } from "../../store/index.ts";
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

export const DacTelemetryCompactWidget: React.FC = () => {
  const { telemetry, currentTrack, bitPerfectMode, selectedDevice, appearance } = useMusicStore();
  const [buffer, setBuffer] = useState(INITIAL_BUFFER);

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

  const sampleRate = telemetry.sample_rate || currentTrack?.sample_rate || 44100;
  const bitDepth = telemetry.bits_per_sample || currentTrack?.bit_depth || 16;
  const bitrate = telemetry.bitrate || currentTrack?.bitrate_kbps || 1411;
  const channels = telemetry.channels === 1 ? "1.0 Mono" : `${telemetry.channels || 2}.0 Stereo`;
  const device = telemetry.output_device || selectedDevice || "Dispositivo predeterminado";
  const clock = bitPerfectMode || telemetry.is_bit_perfect;

  return (
    <div className="flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-audiophile-surface p-2 font-mono text-xs">
      <section
        className="flex max-h-full w-full flex-col justify-center overflow-hidden border border-slate-800 bg-slate-950 px-3 py-2.5 shadow-inner"
        style={{ borderColor: appearance.neonGlow ? `${appearance.accentColor}55` : undefined }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
          <span className="text-[9px] uppercase tracking-[0.16em] text-slate-500">Sample rate</span>
          <span className={`text-[9px] uppercase ${clock ? "text-emerald-400" : "text-slate-500"}`}>{clock ? "Bit-perfect" : telemetry.state}</span>
        </div>
        <div className="flex items-baseline gap-1 pt-1">
          <span className="text-2xl font-black" style={{ color: appearance.accentColor }}>{(sampleRate / 1000).toFixed(1)}</span>
          <span className="text-xs text-slate-400">kHz</span>
          <span className="ml-auto text-sm font-bold text-amber-300">{bitrate}<span className="ml-1 text-[9px] font-normal text-slate-500">kb/s</span></span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-300">
          <span>{bitDepth}-bit</span><span className="text-slate-700">/</span><span>{channels}</span>
          <span className={`ml-auto ${clock ? "text-emerald-400" : "text-slate-500"}`}>{telemetry.state}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-800 pt-2 text-[9px]">
          <span className="flex min-w-0 items-center gap-1 text-slate-500"><Cpu size={10} className="shrink-0" />Hardware</span>
          <span className="truncate text-right font-semibold text-slate-200" title={device}>{device}</span>
          <span className="flex items-center gap-1 text-slate-500"><Radio size={10} />Buffer</span>
          <span className="text-right text-slate-200">{buffer.hardware_buffer_frames} f · {buffer.latency_ms.toFixed(2)} ms</span>
          <span className="flex items-center gap-1 text-slate-500"><Volume2 size={10} />Underruns</span>
          <span className={`text-right font-bold ${buffer.underruns ? "text-rose-400" : "text-emerald-400"}`}>{buffer.underruns}</span>
        </div>
      </section>
    </div>
  );
};