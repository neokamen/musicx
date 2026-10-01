import React, { useState } from "react";
import { useMusicStore } from "../../store/index.ts";
import { ListMusic, Play, Trash2, X, Radio as RadioIcon, Globe } from "lucide-react";
import { RadioHubModal } from "../radio/RadioHubModal.tsx";
import { StreamMusicModal } from "./StreamMusicModal.tsx";
import { isStreamTrack } from "../../lib/streamTracks.ts";
import type { Track } from "../../types/index.ts";

function formatDuration(sec: number): string {
  if (!sec || isNaN(sec)) return "0:00";
  const mins = Math.floor(sec / 60);
  const remainingSecs = Math.floor(sec % 60);
  return `${mins}:${remainingSecs.toString().padStart(2, "0")}`;
}

function queueFormatLabel(track: Track): string {
  if (isStreamTrack(track)) return "STREAM";
  const fmt = (track.format || "").toUpperCase();
  return fmt || "AUDIO";
}

function queueBitrateLabel(track: Track): string {
  if (isStreamTrack(track)) {
    return track.bitrate_kbps > 0 ? `${track.bitrate_kbps} kbps` : "Live";
  }
  return track.bitrate_kbps > 0 ? `${track.bitrate_kbps} kbps` : "—";
}

export const QueueWidget: React.FC = () => {
  const {
    queue,
    currentIndex,
    currentTrack,
    isPlaying,
    play,
    playFromQueue,
    removeFromQueue,
    clearQueue,
    appearance,
  } = useMusicStore();
  const [showRadio, setShowRadio] = useState(false);
  const [showStream, setShowStream] = useState(false);

  const totalDuration = queue.reduce((acc, t) => acc + (t.duration_seconds || 0), 0);
  const remaining = queue.slice(Math.max(currentIndex, 0)).reduce((acc, t) => acc + (t.duration_seconds || 0), 0);

  if (showRadio) {
    return <RadioHubModal isVisible onClose={() => setShowRadio(false)} embedded onBackToLibrary={() => setShowRadio(false)} />;
  }

  if (showStream) {
    return <StreamMusicModal isVisible onClose={() => setShowStream(false)} embedded onBackToLibrary={() => setShowStream(false)} />;
  }

  return (
    <div className="flex flex-col h-full bg-audiophile-surface">
      <div
        className="flex items-center justify-between gap-3 px-3 py-2.5 border-b shrink-0"
        style={{
          borderColor: `${appearance.accentColor}28`,
          background: `linear-gradient(180deg, ${appearance.accentColor}12, transparent)`,
        }}
      >
        <div className="min-w-0 flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${appearance.accentColor}22`, color: appearance.accentColor }}
          >
            <ListMusic size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-audiophile-text">
              Cola de reproducción
            </div>
            <div className="text-[10px] text-audiophile-muted font-mono truncate">
              {queue.length} {queue.length === 1 ? "pista" : "pistas"}
              {queue.length > 0 && (
                <>
                  {" · "}
                  {formatDuration(totalDuration)}
                  {remaining > 0 && remaining !== totalDuration ? ` · quedan ${formatDuration(remaining)}` : ""}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setShowRadio(true)}
            className="p-1.5 rounded-md text-audiophile-muted hover:text-audiophile-text hover:bg-white/5"
            title="Radio"
          >
            <RadioIcon size={14} />
          </button>
          <button
            type="button"
            onClick={() => setShowStream(true)}
            className="p-1.5 rounded-md text-audiophile-muted hover:text-audiophile-text hover:bg-white/5"
            title="Stream Music"
          >
            <Globe size={14} />
          </button>
          {queue.length > 0 && (
            <button
              type="button"
              onClick={() => clearQueue()}
              className="p-1.5 rounded-md text-audiophile-muted hover:text-red-400 hover:bg-red-500/10"
              title="Vaciar cola"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-audiophile-muted p-6 gap-3">
          <ListMusic size={36} className="opacity-25" />
          <p className="text-sm">La cola está vacía</p>
          <p className="text-[11px] text-center max-w-[220px] opacity-70">
            Añade pistas locales o abre Radio / Stream Music desde la cabecera.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div
            className="sticky top-0 z-[1] grid items-center gap-2 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-audiophile-muted bg-audiophile-surface/95 border-b border-audiophile-border/60"
            style={{ gridTemplateColumns: "18px minmax(0,1fr) 58px 64px 40px 22px" }}
          >
            <span>#</span>
            <span>Pista</span>
            <span>Tipo</span>
            <span>Bitrate</span>
            <span className="text-right">Dur.</span>
            <span />
          </div>
          {queue.map((track, i) => {
            const isCurrent = i === currentIndex;
            const playingNow = isCurrent && isPlaying;
            const fmt = queueFormatLabel(track);
            const stream = isStreamTrack(track);

            return (
              <div
                key={`${track.filepath}-${i}`}
                className={`grid items-center gap-2 px-3 py-2 border-b border-audiophile-border/40 cursor-pointer group transition-colors ${
                  isCurrent ? "bg-audiophile-cyan/10" : "hover:bg-audiophile-surface2/50"
                }`}
                style={{ gridTemplateColumns: "18px minmax(0,1fr) 58px 64px 40px 22px" }}
                onClick={() => playFromQueue(i)}
              >
                <div className="flex items-center justify-center text-[10px] text-audiophile-muted">
                  {playingNow ? (
                    <Play size={11} className="fill-current" style={{ color: appearance.accentColor }} />
                  ) : (
                    <span className={isCurrent ? "text-audiophile-text font-semibold" : ""}>{i + 1}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <div
                    className={`text-[12px] truncate ${isCurrent ? "font-semibold" : "text-audiophile-text"}`}
                    style={isCurrent ? { color: appearance.accentColor } : undefined}
                  >
                    {track.title}
                  </div>
                  <div className="text-[10px] text-audiophile-muted truncate">
                    {track.artist}
                    {track.album ? ` · ${track.album}` : ""}
                  </div>
                </div>
                <span
                  className={`inline-flex items-center justify-center h-5 px-1 rounded text-[8px] font-bold tracking-wide ${
                    stream
                      ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                      : "bg-white/5 text-audiophile-muted border border-white/10"
                  }`}
                >
                  {fmt}
                </span>
                <span className="text-[10px] font-mono text-audiophile-muted tabular-nums truncate">
                  {queueBitrateLabel(track)}
                </span>
                <span className="text-[10px] font-mono text-audiophile-muted text-right tabular-nums">
                  {formatDuration(track.duration_seconds)}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromQueue(i);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-audiophile-muted hover:text-red-400"
                  title="Quitar"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {currentTrack && (
        <div
          className="px-3 py-2 border-t shrink-0 flex items-center justify-between gap-2"
          style={{ borderColor: `${appearance.accentColor}22` }}
        >
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-wider text-audiophile-muted">Ahora</div>
            <div className="text-[11px] text-audiophile-text truncate font-medium">{currentTrack.title}</div>
          </div>
          <button
            type="button"
            onClick={() => play(currentTrack)}
            className="text-[10px] px-2 py-1 rounded-md shrink-0"
            style={{ background: `${appearance.accentColor}18`, color: appearance.accentColor }}
          >
            {isPlaying ? "En Play" : "Reanudar"}
          </button>
        </div>
      )}
    </div>
  );
};
