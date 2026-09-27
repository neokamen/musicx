import React from "react";
import { useMusicStore } from "../../store/index.ts";

export const InspectorWidget: React.FC = () => {
  const { currentTrack, telemetry } = useMusicStore();

  const format =
    currentTrack?.format ||
    (telemetry.filepath ? telemetry.filepath.split(".").pop()?.toUpperCase() : "PCM");
  const sampleRate = telemetry.sample_rate || currentTrack?.sample_rate || 44100;
  const bitDepth = telemetry.bits_per_sample || currentTrack?.bit_depth || 16;
  const bitrate = telemetry.bitrate || currentTrack?.bitrate_kbps || 1411;

  return (
    <div className="flex flex-col h-full w-full bg-audiophile-surface select-none font-sans overflow-hidden text-xs">
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 font-mono">
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center">
            <div>
              <div className="text-[9px] uppercase text-slate-400">Códec</div>
              <div className="text-xs font-bold text-white">{format}</div>
            </div>
          </div>

          <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center">
            <div>
              <div className="text-[9px] uppercase text-slate-400">Sample Rate</div>
              <div className="text-xs font-bold text-white">{(sampleRate / 1000).toFixed(1)} kHz</div>
            </div>
          </div>

          <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center">
            <div>
              <div className="text-[9px] uppercase text-slate-400">Profundidad</div>
              <div className="text-xs font-bold text-white">{bitDepth} bits</div>
            </div>
          </div>

          <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center">
            <div>
              <div className="text-[9px] uppercase text-slate-400">Bitrate</div>
              <div className="text-xs font-bold text-white">{bitrate} kbps</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
