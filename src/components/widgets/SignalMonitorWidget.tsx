import React from "react";
import { useMusicStore } from "../../store/index.ts";

export const SignalMonitorWidget: React.FC = () => {
  const { telemetry, currentTrack, bitPerfectMode } = useMusicStore();
  const sampleRate = telemetry.sample_rate || currentTrack?.sample_rate || 44100;
  const bitDepth = telemetry.bits_per_sample || currentTrack?.bit_depth || 16;
  const bitrate = telemetry.bitrate || currentTrack?.bitrate_kbps || 0;
  const channels = telemetry.channels || 2;
  const channelLabel = channels === 1 ? "1.0 Mono" : channels === 2 ? "2.0 Stereo" : `${channels}.0 ${channels > 2 ? "Surround" : "Canales"}`;
  const isBitPerfect = bitPerfectMode || telemetry.is_bit_perfect;

  return (
    <div className="flex h-full min-h-[76px] min-w-0 flex-col justify-between overflow-hidden border border-[#323232] bg-[#0b0c0e] px-2.5 py-2 font-mono text-[10px] text-slate-100">
      <header className="flex items-center justify-between border-b border-[#303236] pb-1.5 text-[8px] uppercase tracking-[0.16em]">
        <span className="text-slate-400">Sample rate</span>
        <span className={isBitPerfect ? "text-emerald-400" : "text-slate-500"}>{isBitPerfect ? "Bit-perfect" : "Shared"}</span>
      </header>
      <div className="flex min-w-0 items-end justify-between gap-2 py-1">
        <div className="flex min-w-0 items-baseline gap-1">
          <span className="truncate text-[23px] font-bold leading-none tracking-normal text-[#e87532]">{(sampleRate / 1000).toFixed(1)}</span>
          <span className="text-[10px] text-slate-400">kHz</span>
        </div>
        <div className="flex shrink-0 items-baseline gap-1 text-amber-300">
          <span className="text-[14px] font-bold leading-none">{bitrate || "PCM"}</span>
          {bitrate > 0 && <span className="text-[9px] text-slate-400">kb/s</span>}
        </div>
      </div>
      <footer className="flex items-center justify-between border-t border-[#303236] pt-1.5 text-[9px]">
        <span className="truncate text-slate-300">{bitDepth}-bit <span className="px-1 text-slate-600">|</span> {channelLabel}</span>
        <span className={telemetry.state === "Playing" ? "shrink-0 text-emerald-400" : "shrink-0 text-emerald-500/80"}>{telemetry.state}</span>
      </footer>
    </div>
  );
};