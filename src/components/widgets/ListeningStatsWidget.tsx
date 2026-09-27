import React from "react";
import { Clock3, Disc3, Headphones } from "lucide-react";
import { useMusicStore } from "../../store/index.ts";

export const ListeningStatsWidget: React.FC = () => {
  const { listeningStats, telemetry, currentTrack, appearance } = useMusicStore();
  const totalSeconds = Math.max(0, Math.floor(listeningStats.totalSecondsListened));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const trackName = currentTrack
    ? `${currentTrack.artist || "Artista desconocido"} · ${currentTrack.title}`
    : "Sin pista activa";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-audiophile-surface p-3 font-mono text-xs">
      <header className="flex shrink-0 items-center justify-between border-b border-audiophile-border pb-2">
        <span className="text-[10px] uppercase tracking-widest text-audiophile-muted">Listening log</span>
        <span className={`size-1.5 rounded-full ${telemetry.state === "Playing" ? "bg-emerald-400" : "bg-slate-600"}`} />
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 py-3">
        <div className="flex min-w-0 flex-col justify-center border-l-2 border-cyan-500/70 bg-audiophile-surface2/50 px-2">
          <Clock3 size={13} className="mb-1 text-cyan-300" />
          <span className="truncate text-lg font-bold" style={{ color: appearance.accentColor }}>{hours}h {minutes}m</span>
          <span className="text-[9px] uppercase text-audiophile-muted">Tiempo total</span>
        </div>
        <div className="flex min-w-0 flex-col justify-center border-l-2 border-amber-500/70 bg-audiophile-surface2/50 px-2">
          <Disc3 size={13} className="mb-1 text-amber-300" />
          <span className="truncate text-lg font-bold text-audiophile-text">{listeningStats.totalTracksPlayed.toLocaleString()}</span>
          <span className="text-[9px] uppercase text-audiophile-muted">Pistas</span>
        </div>
        <div className="flex min-w-0 flex-col justify-center border-l-2 border-emerald-500/70 bg-audiophile-surface2/50 px-2">
          <Headphones size={13} className="mb-1 text-emerald-300" />
          <span className="truncate text-lg font-bold text-audiophile-text">{listeningStats.totalSessions.toLocaleString()}</span>
          <span className="text-[9px] uppercase text-audiophile-muted">Sesiones</span>
        </div>
      </div>
      <footer className="shrink-0 truncate border-t border-audiophile-border pt-2 text-[10px] text-slate-400" title={trackName}>
        {telemetry.state === "Playing" ? trackName : "Reproducción en pausa"}
      </footer>
    </div>
  );
};