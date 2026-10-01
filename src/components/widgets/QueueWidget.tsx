import React, { useState } from "react";
import { useMusicStore } from "../../store/index.ts";
import { ListMusic, Play, Trash2, X, Radio as RadioIcon, Globe, Volume2, Download, SlidersHorizontal } from "lucide-react";
import { RadioHubModal } from "../radio/RadioHubModal.tsx";
import { StreamMusicModal } from "./StreamMusicModal.tsx";
import { SoundixDownloadDialog, trackToSoundixTrack, type NeoTrack } from "./SoundixDownloadDialog.tsx";
import { ColumnResizeHandle } from "./ColumnResizeHandle.tsx";
import { isStreamTrack } from "../../lib/streamTracks.ts";
import type { Track } from "../../types/index.ts";

const FORMAT_COLORS: Record<string, string> = {
  MP3: "#f59e0b",
  FLAC: "#22d3ee",
  WAV: "#a78bfa",
  OGG: "#84cc16",
  OPUS: "#60a5fa",
  AAC: "#fb7185",
  M4A: "#f472b6",
  ALAC: "#e2e8f0",
  STREAM: "#06b6d4",
  RADIO: "#ec4899",
};

type QueueColumn = "index" | "title" | "format" | "bitrate" | "duration" | "download";

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
    queueIndex,
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
  const [downloadTracks, setDownloadTracks] = useState<NeoTrack[] | null>(null);
  const [isColMenuOpen, setIsColMenuOpen] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<QueueColumn, number>>({
    index: 8,
    title: 42,
    format: 12,
    bitrate: 16,
    duration: 12,
    download: 10,
  });
  const [visibleCols, setVisibleCols] = useState({
    format: true,
    bitrate: true,
    duration: true,
    album: true,
    download: true,
  });

  const totalDuration = queue.reduce((acc, t) => acc + (t.duration_seconds || 0), 0);
  const remaining = queue.slice(Math.max(queueIndex, 0)).reduce((acc, t) => acc + (t.duration_seconds || 0), 0);

  const handleDownload = (track: Track, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!isStreamTrack(track)) return;
    setDownloadTracks([trackToSoundixTrack(track)]);
  };

  const resizeColumns = (left: QueueColumn, right: QueueColumn, deltaPixels: number) => {
    setColumnWidths((widths) => {
      const delta = deltaPixels * 0.18;
      const nextLeft = Math.max(6, Math.min(70, widths[left] + delta));
      const applied = nextLeft - widths[left];
      return { ...widths, [left]: nextLeft, [right]: Math.max(6, widths[right] - applied) };
    });
  };

  const gridTemplate = [
    `${columnWidths.index}px`,
    "minmax(0,1fr)",
    visibleCols.format ? `${columnWidths.format * 4.2}px` : null,
    visibleCols.bitrate ? `${columnWidths.bitrate * 4.2}px` : null,
    visibleCols.duration ? `${columnWidths.duration * 3.4}px` : null,
    visibleCols.download ? "22px" : null,
    "18px",
  ]
    .filter(Boolean)
    .join(" ");

  if (showRadio) {
    return <RadioHubModal isVisible onClose={() => setShowRadio(false)} embedded onBackToLibrary={() => setShowRadio(false)} />;
  }

  if (showStream) {
    return <StreamMusicModal isVisible onClose={() => setShowStream(false)} embedded onBackToLibrary={() => setShowStream(false)} />;
  }

  return (
    <div className="relative flex flex-col h-full bg-audiophile-surface">
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
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsColMenuOpen((open) => !open)}
              className="p-1.5 rounded-md text-audiophile-muted hover:text-audiophile-text hover:bg-white/5"
              title="Configurar columnas"
            >
              <SlidersHorizontal size={14} />
            </button>
            {isColMenuOpen && (
              <div className="absolute right-0 top-8 z-50 w-44 space-y-1.5 rounded-lg border border-slate-700 bg-slate-950 p-2 font-mono text-[10px] shadow-2xl">
                <div className="border-b border-slate-800 pb-1 font-bold text-slate-400">Columnas de cola</div>
                {([
                  ["album", "Álbum"],
                  ["format", "Tipo"],
                  ["bitrate", "Bitrate"],
                  ["duration", "Duración"],
                  ["download", "Descarga"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center justify-between text-slate-200">
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={visibleCols[key]}
                      onChange={(event) => setVisibleCols({ ...visibleCols, [key]: event.target.checked })}
                      className="accent-cyan-400"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
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
            className="sticky top-0 z-[1] grid items-center gap-2 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-audiophile-muted bg-audiophile-surface/95"
            style={{
              gridTemplateColumns: gridTemplate,
              borderBottom: "1px solid color-mix(in srgb, var(--app-accent, #06b6d4) 12%, transparent)",
            }}
          >
            <span className="relative">
              #
              <ColumnResizeHandle onResize={(delta) => resizeColumns("index", "title", delta)} />
            </span>
            <span className="relative min-w-0">
              Pista
              {visibleCols.format && <ColumnResizeHandle onResize={(delta) => resizeColumns("title", "format", delta)} />}
            </span>
            {visibleCols.format && (
              <span className="relative">
                Tipo
                {visibleCols.bitrate && <ColumnResizeHandle onResize={(delta) => resizeColumns("format", "bitrate", delta)} />}
              </span>
            )}
            {visibleCols.bitrate && (
              <span className="relative">
                Bitrate
                {visibleCols.duration && <ColumnResizeHandle onResize={(delta) => resizeColumns("bitrate", "duration", delta)} />}
              </span>
            )}
            {visibleCols.duration && <span className="text-right">Dur.</span>}
            {visibleCols.download && <span />}
            <span />
          </div>
          {queue.map((track, i) => {
            const isCurrent = i === queueIndex;
            const playingNow = isCurrent && isPlaying;
            const fmt = queueFormatLabel(track);
            const stream = isStreamTrack(track);

            return (
              <div
                key={`${track.filepath}-${i}`}
                className="grid items-center gap-2 px-3 py-2 cursor-pointer group transition-all duration-200"
                style={{
                  gridTemplateColumns: gridTemplate,
                  borderBottom: "1px solid color-mix(in srgb, white 6%, transparent)",
                  background: playingNow
                    ? `linear-gradient(90deg, ${appearance.accentColor}18, transparent 70%)`
                    : isCurrent
                      ? `${appearance.accentColor}0d`
                      : "transparent",
                }}
                onMouseEnter={(event) => {
                  if (!playingNow) {
                    event.currentTarget.style.background = `color-mix(in srgb, ${appearance.accentColor} 8%, transparent)`;
                  }
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = playingNow
                    ? `linear-gradient(90deg, ${appearance.accentColor}18, transparent 70%)`
                    : isCurrent
                      ? `${appearance.accentColor}0d`
                      : "transparent";
                }}
                onClick={() => void playFromQueue(i)}
                onDoubleClick={() => void playFromQueue(i)}
              >
                <button
                  type="button"
                  className="flex items-center justify-center text-[10px] text-audiophile-muted"
                  onClick={(event) => {
                    event.stopPropagation();
                    void playFromQueue(i);
                  }}
                  title={playingNow ? "Reproduciendo" : "Reproducir"}
                >
                  {playingNow ? (
                    <Volume2
                      size={13}
                      className="animate-pulse"
                      style={{
                        color: appearance.accentColor,
                        filter: `drop-shadow(0 0 6px ${appearance.accentColor})`,
                      }}
                    />
                  ) : (
                    <>
                      <span className="group-hover:hidden">{i + 1}</span>
                      <Play
                        size={12}
                        className="hidden group-hover:block fill-current"
                        style={{ color: appearance.accentColor }}
                      />
                    </>
                  )}
                </button>
                <div className="min-w-0">
                  <div
                    className={`text-[12px] truncate ${isCurrent ? "font-semibold" : "text-audiophile-text"}`}
                    style={isCurrent ? { color: appearance.accentColor } : undefined}
                  >
                    {track.title}
                  </div>
                  <div className="text-[10px] text-audiophile-muted truncate">
                    {track.artist}
                    {visibleCols.album && track.album ? ` · ${track.album}` : ""}
                  </div>
                </div>
                {visibleCols.format && (
                  <span
                    className="truncate text-[10px] font-bold tracking-wide"
                    style={{ color: FORMAT_COLORS[fmt] || appearance.accentColor }}
                  >
                    {fmt}
                  </span>
                )}
                {visibleCols.bitrate && (
                  <span className="truncate text-[10px] font-mono text-audiophile-muted tabular-nums">
                    {queueBitrateLabel(track)}
                  </span>
                )}
                {visibleCols.duration && (
                  <span className="text-right text-[10px] font-mono text-audiophile-muted tabular-nums">
                    {formatDuration(track.duration_seconds)}
                  </span>
                )}
                {visibleCols.download && (
                  <button
                    type="button"
                    onClick={(event) => handleDownload(track, event)}
                    disabled={!stream}
                    className="p-0.5 text-audiophile-muted hover:text-audiophile-text disabled:opacity-25"
                    title={stream ? "Descargar" : "Descarga disponible en pistas Stream"}
                  >
                    <Download size={12} />
                  </button>
                )}
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
      {downloadTracks && (
        <SoundixDownloadDialog
          tracks={downloadTracks}
          onClose={() => setDownloadTracks(null)}
        />
      )}
    </div>
  );
};
