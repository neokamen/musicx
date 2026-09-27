import React, { useEffect, useState } from "react";
import { Activity, Radio, Signal, Wifi } from "lucide-react";
import { useMusicStore } from "../../store/index.ts";
import { radioAudioService } from "../../services/radioAudioService.ts";
import { formatDataSize } from "../../lib/formatBytes.ts";
import type { RadioPlaybackState } from "../../types/radio.ts";

export const RadioTelemetryWidget: React.FC = () => {
  const { activeRadioStation, isRadioPlaying, appearance } = useMusicStore();
  const [stream, setStream] = useState<RadioPlaybackState>({ status: "stopped", elapsedSeconds: 0 });

  useEffect(() => radioAudioService.subscribe(setStream), []);

  const isLive = isRadioPlaying && stream.status === "playing";
  const kbps = stream.bitrateKbps || activeRadioStation?.bitrate || 0;
  const throughput = (stream.bytesPerSecond || 0) / 1024;
  const throughputPercent = kbps > 0 ? Math.min(100, (throughput * 8 / kbps) * 100) : 0;
  const stationName = activeRadioStation?.name || "Sin emisora";
  const location = [activeRadioStation?.country, activeRadioStation?.language].filter(Boolean).join(" · ") || "Origen no indicado";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#101719] font-mono text-xs text-slate-100">
      <header className="flex shrink-0 items-center justify-between border-b border-emerald-950/80 px-3 py-2">
        <span className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-emerald-200/70">
          <Radio size={14} style={{ color: appearance.accentColor }} />Radio telemetry
        </span>
        <span className={`flex items-center gap-1.5 text-[9px] uppercase ${isLive ? "text-emerald-300" : "text-slate-500"}`}>
          <span className={`size-1.5 rounded-full ${isLive ? "animate-pulse bg-emerald-400" : "bg-slate-600"}`} />
          {stream.status}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-bold" title={stationName}>{stationName}</div>
            <div className="truncate text-[10px] text-slate-400">{location}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-lg font-bold" style={{ color: appearance.accentColor }}>{throughput.toFixed(1)}<span className="ml-1 text-[9px] text-slate-400">KB/s</span></div>
            <div className="text-[9px] text-slate-500">{stream.isRealDataUsage ? "medido" : "estimado"}</div>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden border border-emerald-950 bg-black/60 p-px">
          <div className="h-full transition-[width] duration-300" style={{ width: `${throughputPercent}%`, backgroundColor: appearance.accentColor, boxShadow: `0 0 12px ${appearance.accentColor}` }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="border border-white/10 bg-white/[0.03] p-2">
            <div className="flex items-center gap-1 text-[9px] uppercase text-slate-500"><Signal size={10} />Stream</div>
            <div className="mt-1 truncate text-sm font-bold">{activeRadioStation?.codec?.toUpperCase() || "Audio"} · {kbps || "?"} kb/s</div>
          </div>
          <div className="border border-white/10 bg-white/[0.03] p-2">
            <div className="flex items-center gap-1 text-[9px] uppercase text-slate-500"><Wifi size={10} />Sesión</div>
            <div className="mt-1 text-sm font-bold">{formatDataSize(stream.sessionBytesTotal || 0)}</div>
          </div>
        </div>
        <div className="mt-3 flex min-w-0 items-center gap-2 border-t border-white/10 pt-2 text-[10px] text-slate-400">
          <Activity size={12} className="shrink-0 text-emerald-300" />
          <span className="truncate" title={stream.streamTitle || activeRadioStation?.description || "Esperando metadatos"}>
            {stream.streamTitle || activeRadioStation?.description || "Esperando metadatos de pista"}
          </span>
        </div>
      </div>
    </div>
  );
};