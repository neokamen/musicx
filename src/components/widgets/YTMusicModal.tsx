import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  X, Search, Download, Loader2, Play, Music2,
  CheckSquare, Square, FolderOpen, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle, Globe,
  X as XIcon,
} from "lucide-react";
import { useMusicStore } from "../../store/index.ts";
import { playTrack } from "../../services/api.ts";

// ── Types (identical to Soundix NeoDownloader) ───────────────────────────────

interface NeoTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  year: string;
  trackNumber: number;
  totalTracks: number;
  duration: number;
  durationString: string;
  coverUrl: string;
  sourceUrl?: string;
}

interface AnalyzeResult {
  kind: "track" | "playlist" | "album" | "search";
  name: string;
  totalTracks: number;
  tracks: NeoTrack[];
}

interface TrackProgress {
  trackId: string;
  phase: "queued" | "downloading" | "converting" | "tagging" | "done" | "error";
  percent: number;
  message: string;
  filePath?: string;
}

const FORMATS   = ["mp3", "flac", "wav", "m4a", "opus"] as const;
const BITRATES  = ["320k", "256k", "192k", "128k", "lossless"] as const;
const SAMPLE_RATES = [44100, 48000, 88200, 96000, 192000] as const;
const NAMING_PATTERNS = [
  { label: "Artista / Año – Álbum / Nº Título", value: "artist_year_album_track_title" },
  { label: "Artista / Álbum / Nº Título",        value: "artist_album_track_title" },
  { label: "Artista – Título",                    value: "artist_title" },
  { label: "Título",                              value: "title" },
] as const;

// ── Component ────────────────────────────────────────────────────────────────

interface YTMusicModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const YTMusicModal: React.FC<YTMusicModalProps> = ({ isOpen, onClose }) => {
  const { appearance } = useMusicStore();
  const accent = appearance.accentColor || "#06b6d4";

  // Search
  const [query, setQuery]           = useState("");
  const [result, setResult]         = useState<AnalyzeResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Playback
  const [playingId, setPlayingId]   = useState<string | null>(null);
  const [isLoadingPlay, setIsLoadingPlay] = useState(false);

  // Download options
  const [format, setFormat]         = useState<string>("mp3");
  const [bitrate, setBitrate]       = useState<string>("320k");
  const [sampleRate, setSampleRate] = useState<number>(44100);
  const [namingPattern, setNamingPattern] = useState<string>("artist_year_album_track_title");
  const [embedId3, setEmbedId3]     = useState(true);
  const [outputFolder, setOutputFolder] = useState("/home/neokamen/Descargas");
  const [showOptions, setShowOptions] = useState(false);

  // Progress per track
  const [progress, setProgress]     = useState<Record<string, TrackProgress>>({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadDone, setDownloadDone] = useState(false);

  const unlistenRef = useRef<(() => void) | null>(null);

  // ── Progress listener ─────────────────────────────────────────────────────

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<TrackProgress>("download-track-progress", (event) => {
      const p = event.payload;
      setProgress(prev => ({ ...prev, [p.trackId]: p }));
    }).then(fn => { unlisten = fn; unlistenRef.current = fn; });
    return () => { unlisten?.(); };
  }, []);

  if (!isOpen) return null;

  const tracks = result?.tracks ?? [];

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setResult(null);
    setSelectedIds(new Set());
    setProgress({});
    setDownloadDone(false);
    try {
      const res = await invoke<AnalyzeResult>("analyze_source_link", { urlOrQuery: q, limit: 20 });
      setResult(res);
      // Auto-select all
      setSelectedIds(new Set(res.tracks.map(t => t.id)));
    } catch (err: any) {
      setAnalyzeError(String(err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === tracks.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(tracks.map(t => t.id)));
  };

  const handlePlay = async (track: NeoTrack) => {
    setIsLoadingPlay(true);
    setPlayingId(track.id);
    try {
      // Download to temp as mp3 then play via MusicX audio engine
      const tmpFolder = "/tmp/musicx_ytm";
      await invoke("download_track_batch", {
        tracks: [track],
        options: {
          format: "mp3",
          bitrate: "320k",
          sampleRate: null,
          saveInFolder: false,
          folderName: null,
          namingPattern: "title",
          embedId3Tags: false,
          outputFolder: tmpFolder,
          youtubeCookies: null,
          cookiesFromBrowser: null,
          downloadLyrics: false,
          trackCovers: {},
        },
      });
      // The file will be at /tmp/musicx_ytm/<title>.mp3
      const safeTitle = track.title.replace(/[\\/:*?"<>|]/g, "_").trim();
      const filePath = `${tmpFolder}/${safeTitle}.mp3`;
      await playTrack(filePath);
    } catch (err: any) {
      setAnalyzeError(`Error reproduciendo: ${String(err)}`);
      setPlayingId(null);
    } finally {
      setIsLoadingPlay(false);
    }
  };

  const handlePickFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false, title: "Carpeta de destino" });
      if (typeof dir === "string") setOutputFolder(dir);
    } catch { /* fallback: no dialog available */ }
  };

  const handleDownload = async () => {
    const toDownload = tracks.filter(t => selectedIds.has(t.id));
    if (toDownload.length === 0) return;
    setIsDownloading(true);
    setDownloadDone(false);
    setProgress({});
    // Pre-set queued status
    const init: Record<string, TrackProgress> = {};
    toDownload.forEach(t => {
      init[t.id] = { trackId: t.id, phase: "queued", percent: 0, message: "En cola…" };
    });
    setProgress(init);
    try {
      await invoke("download_track_batch", {
        tracks: toDownload,
        options: {
          format,
          bitrate,
          sampleRate: sampleRate !== 44100 ? sampleRate : null,
          saveInFolder: false,
          folderName: null,
          namingPattern,
          embedId3Tags: embedId3,
          outputFolder,
          youtubeCookies: null,
          cookiesFromBrowser: null,
          downloadLyrics: false,
          trackCovers: {},
        },
      });
    } catch (err: any) {
      setAnalyzeError(`Error en descarga: ${String(err)}`);
    } finally {
      setIsDownloading(false);
      setDownloadDone(true);
    }
  };

  const handleCancel = async () => {
    await invoke("cancel_download_batch").catch(() => {});
    setIsDownloading(false);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const phaseColor = (phase: TrackProgress["phase"]) => {
    switch (phase) {
      case "done":        return "#22c55e";
      case "error":       return "#ef4444";
      case "converting":  return "#f59e0b";
      case "downloading": return accent;
      default:            return "#64748b";
    }
  };

  const phaseLabel = (p: TrackProgress) => {
    if (p.phase === "done")  return "✓";
    if (p.phase === "error") return "✗";
    if (p.phase === "queued") return "…";
    return `${p.percent}%`;
  };

  const allDone = isDownloading === false && downloadDone &&
    tracks.filter(t => selectedIds.has(t.id)).every(t =>
      progress[t.id]?.phase === "done" || progress[t.id]?.phase === "error"
    );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-[90vw] max-w-3xl h-[84vh] rounded-xl overflow-hidden shadow-2xl border"
        style={{ backgroundColor: "var(--app-surface, #0f172a)", borderColor: `${accent}35` }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-3 px-4 py-2.5 border-b shrink-0"
          style={{ borderColor: `${accent}25`, background: `${accent}0d` }}
        >
          <Globe size={15} style={{ color: accent }} />
          <span className="font-bold text-sm text-white">YT Music</span>
          {result && (
            <span className="text-[10px] text-slate-400 px-2 py-0.5 rounded-full border border-slate-700 font-mono capitalize">
              {result.kind} · {result.totalTracks} pistas
            </span>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* ── Search bar ──────────────────────────────────────────────────── */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Busca canción, artista, álbum… o pega una URL de YouTube / Spotify"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none transition-colors"
                style={{ borderColor: query ? `${accent}60` : undefined }}
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={isAnalyzing || !query.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 transition-opacity"
              style={{ backgroundColor: accent }}
            >
              {isAnalyzing
                ? <><Loader2 size={13} className="animate-spin" /> Buscando…</>
                : <><Search size={13} /> Buscar</>}
            </button>
          </form>
        </div>

        {/* ── Error / feedback ────────────────────────────────────────────── */}
        {analyzeError && (
          <div className="mx-4 mb-2 flex items-center gap-2 p-2.5 rounded-lg bg-rose-950/50 border border-rose-500/40 text-xs text-rose-300 shrink-0">
            <AlertCircle size={13} className="shrink-0" /> <span>{analyzeError}</span>
          </div>
        )}
        {allDone && (
          <div className="mx-4 mb-2 flex items-center gap-2 p-2.5 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-xs text-emerald-300 shrink-0">
            <CheckCircle size={13} /> Descarga completada en <strong>{outputFolder}</strong>
          </div>
        )}

        {/* ── Track list ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 min-h-0">
          {tracks.length === 0 && !isAnalyzing && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 py-10">
              <Music2 size={40} className="opacity-20" />
              <p className="text-sm">Busca canciones, artistas, álbumes o pega una URL</p>
              <p className="text-xs opacity-50">YouTube, listas de reproducción y Spotify compatibles</p>
            </div>
          )}

          {tracks.map(track => {
            const isSelected = selectedIds.has(track.id);
            const prog       = progress[track.id];
            const isThisPlay = playingId === track.id;

            return (
              <div
                key={track.id}
                className="flex items-center gap-3 py-2 group hover:bg-white/3 rounded-lg px-1 transition-colors border-b last:border-b-0"
                style={{ borderColor: `${accent}10` }}
              >
                {/* Checkbox */}
                <button
                  type="button"
                  onClick={() => toggleSelect(track.id)}
                  className="shrink-0 cursor-pointer"
                  style={{ color: isSelected ? accent : "#475569" }}
                >
                  {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                </button>

                {/* Thumbnail */}
                <div className="w-9 h-9 rounded shrink-0 overflow-hidden bg-slate-800 relative">
                  {track.coverUrl ? (
                    <img
                      src={track.coverUrl}
                      alt={track.title}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <Music2 size={14} className="absolute inset-0 m-auto text-slate-600" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-white truncate leading-tight">{track.title}</div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {track.artist}{track.album && track.album !== track.title ? ` · ${track.album}` : ""}
                  </div>
                </div>

                {/* Duration */}
                <span className="text-[10px] text-slate-500 font-mono shrink-0">{track.durationString}</span>

                {/* Progress badge */}
                {prog && (
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
                    style={{ backgroundColor: `${phaseColor(prog.phase)}20`, color: phaseColor(prog.phase) }}
                  >
                    {phaseLabel(prog)}
                  </span>
                )}

                {/* Play button */}
                <button
                  type="button"
                  onClick={() => handlePlay(track)}
                  disabled={isLoadingPlay}
                  className="shrink-0 p-1.5 rounded-lg cursor-pointer transition-all opacity-0 group-hover:opacity-100 disabled:opacity-30"
                  style={{ backgroundColor: `${accent}20`, color: accent }}
                  title="Reproducir ahora"
                >
                  {isThisPlay && isLoadingPlay
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Play size={13} fill="currentColor" />}
                </button>
              </div>
            );
          })}
        </div>

        {/* ── Bottom bar ───────────────────────────────────────────────────── */}
        {tracks.length > 0 && (
          <div
            className="shrink-0 border-t px-4 py-2"
            style={{ borderColor: `${accent}20`, background: `${accent}08` }}
          >
            {/* Options toggle row */}
            <div className="flex items-center justify-between mb-1.5">
              <button
                type="button"
                onClick={() => setShowOptions(v => !v)}
                className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-white cursor-pointer transition-colors"
              >
                {showOptions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                Opciones de descarga
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-[10px] text-slate-500 hover:text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700 cursor-pointer"
                >
                  {selectedIds.size === tracks.length ? "Ninguno" : "Todos"}
                </button>

                {isDownloading ? (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer bg-rose-700 text-white hover:bg-rose-600"
                  >
                    <XIcon size={12} /> Cancelar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={selectedIds.size === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white cursor-pointer disabled:opacity-50 transition-opacity"
                    style={{ backgroundColor: accent }}
                  >
                    <Download size={12} /> Descargar ({selectedIds.size})
                  </button>
                )}
              </div>
            </div>

            {/* Expandable options */}
            {showOptions && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1.5 pb-1 text-[11px]">
                {/* Format */}
                <label className="flex flex-col gap-0.5">
                  <span className="text-slate-500 uppercase tracking-wider text-[9px]">Formato</span>
                  <select value={format} onChange={e => setFormat(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-white focus:outline-none"
                    style={{ colorScheme: "dark" }}>
                    {FORMATS.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                  </select>
                </label>

                {/* Bitrate */}
                <label className="flex flex-col gap-0.5">
                  <span className="text-slate-500 uppercase tracking-wider text-[9px]">Calidad</span>
                  <select value={bitrate} onChange={e => setBitrate(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-white focus:outline-none"
                    style={{ colorScheme: "dark" }}>
                    {BITRATES.map(b => <option key={b} value={b}>{b === "lossless" ? "Sin pérdida" : b}</option>)}
                  </select>
                </label>

                {/* Sample rate */}
                <label className="flex flex-col gap-0.5">
                  <span className="text-slate-500 uppercase tracking-wider text-[9px]">Sample Rate</span>
                  <select value={sampleRate} onChange={e => setSampleRate(Number(e.target.value))}
                    className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-white focus:outline-none"
                    style={{ colorScheme: "dark" }}>
                    {SAMPLE_RATES.map(r => <option key={r} value={r}>{r >= 1000 ? `${r / 1000} kHz` : r}</option>)}
                  </select>
                </label>

                {/* Naming pattern */}
                <label className="flex flex-col gap-0.5">
                  <span className="text-slate-500 uppercase tracking-wider text-[9px]">Estructura</span>
                  <select value={namingPattern} onChange={e => setNamingPattern(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-white focus:outline-none"
                    style={{ colorScheme: "dark" }}>
                    {NAMING_PATTERNS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </label>

                {/* Folder + ID3 */}
                <div className="col-span-full flex flex-wrap items-center gap-3 pt-0.5">
                  <button
                    type="button"
                    onClick={handlePickFolder}
                    className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-white bg-slate-800 border border-slate-700 rounded px-2 py-1 cursor-pointer transition-colors"
                  >
                    <FolderOpen size={11} />
                    <span className="truncate max-w-[220px]">{outputFolder}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEmbedId3(v => !v)}
                    className="flex items-center gap-1.5 text-[10px] cursor-pointer select-none"
                    style={{ color: embedId3 ? accent : "#64748b" }}
                  >
                    {embedId3 ? <CheckSquare size={13} /> : <Square size={13} />}
                    <span className="text-slate-400">Carátula + ID3</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default YTMusicModal;
