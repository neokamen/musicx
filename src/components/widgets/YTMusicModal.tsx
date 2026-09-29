import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  X, Search, Download, Loader2, Play, Music,
  CheckSquare, Square, FolderOpen, ChevronDown,
  ChevronUp, AlertCircle, CheckCircle, Globe,
} from "lucide-react";
import { useMusicStore } from "../../store/index.ts";
import { playTrack } from "../../services/api.ts";

// ── Types ────────────────────────────────────────────────────────────────────

interface YtmTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  duration_string: string;
  thumbnail: string;
  webpage_url: string;
}

const FORMATS = ["mp3", "flac", "wav", "m4a", "opus", "ogg"] as const;
const BITRATES = ["320k", "256k", "192k", "128k", "lossless"] as const;
const SAMPLE_RATES = [44100, 48000, 88200, 96000, 192000] as const;
const NAMING_PATTERNS = [
  { label: "Artista / Álbum / Título",        value: "%(uploader)s/%(album)s/%(title)s" },
  { label: "Artista / Año – Álbum / Nº Título", value: "%(uploader)s/%(release_year)s - %(album)s/%(track_number)s - %(title)s" },
  { label: "Artista – Título",                 value: "%(uploader)s - %(title)s" },
  { label: "Título",                           value: "%(title)s" },
] as const;

// ── Component ────────────────────────────────────────────────────────────────

interface YTMusicModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const YTMusicModal: React.FC<YTMusicModalProps> = ({ isOpen, onClose }) => {
  const { appearance } = useMusicStore();
  const accent = appearance.accentColor || "#06b6d4";

  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YtmTrack[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Playback state
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isLoadingPlay, setIsLoadingPlay] = useState(false);

  // Download options
  const [format, setFormat] = useState("mp3");
  const [bitrate, setBitrate] = useState("320k");
  const [sampleRate, setSampleRate] = useState(44100);
  const [namingPattern, setNamingPattern] = useState<string>(NAMING_PATTERNS[0].value);
  const [embedId3, setEmbedId3] = useState(true);
  const [outputFolder, setOutputFolder] = useState("/home/neokamen/Descargas");
  const [showOptions, setShowOptions] = useState(false);

  // Download state
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (!isOpen) return null;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setIsSearching(true);
    setSearchError(null);
    setResults([]);
    setSelectedIds(new Set());
    setDownloadMsg(null);
    setDownloadError(null);
    try {
      const tracks = await invoke<YtmTrack[]>("ytm_search", { query: q, limit: 20 });
      setResults(tracks);
    } catch (err: any) {
      setSearchError(String(err));
    } finally {
      setIsSearching(false);
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
    if (selectedIds.size === results.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(results.map(t => t.id)));
    }
  };

  const handlePlay = async (track: YtmTrack) => {
    setIsLoadingPlay(true);
    setPlayingId(track.id);
    setSearchError(null);
    try {
      // Download to temp file then play via musicx audio engine
      const path = await invoke<string>("ytm_stream_to_temp", { url: track.webpage_url });
      await playTrack(path);
    } catch (err: any) {
      setSearchError(`Error al reproducir: ${String(err)}`);
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
    } catch { /* ignore */ }
  };

  const handleDownload = async () => {
    const tracks = results.filter(t => selectedIds.has(t.id));
    if (tracks.length === 0) return;
    setIsDownloading(true);
    setDownloadMsg(null);
    setDownloadError(null);
    let ok = 0;
    let fail = 0;
    for (const track of tracks) {
      try {
        await invoke("ytm_download", {
          options: {
            url: track.webpage_url,
            output_folder: outputFolder,
            format,
            bitrate,
            sample_rate: sampleRate !== 44100 ? sampleRate : null,
            embed_id3: embedId3,
            save_in_folder: true,
            naming_pattern: namingPattern,
          }
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setIsDownloading(false);
    if (fail > 0) {
      setDownloadError(`${fail} pista${fail > 1 ? "s" : ""} fallaron. ${ok} descargadas.`);
    } else {
      setDownloadMsg(`✓ ${ok} pista${ok > 1 ? "s descargadas" : " descargada"} en ${outputFolder}`);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-[88vw] max-w-3xl h-[82vh] rounded-xl overflow-hidden shadow-2xl border"
        style={{ backgroundColor: "var(--app-surface, #0f172a)", borderColor: `${accent}35` }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-3 px-4 py-2.5 border-b shrink-0"
          style={{ borderColor: `${accent}25`, background: `${accent}0d` }}
        >
          <Globe size={16} style={{ color: accent }} />
          <span className="font-bold text-sm text-white">YT Music</span>
          <span className="text-[10px] text-slate-400 px-2 py-0.5 rounded-full border border-slate-700 font-mono">
            BÚSQUEDA + DESCARGA
          </span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Search bar ──────────────────────────────────────────────────── */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar canción, artista o álbum en YouTube Music..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none transition-colors"
                style={{ borderColor: query ? `${accent}60` : undefined }}
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={isSearching || !query.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-opacity shrink-0"
              style={{ backgroundColor: accent }}
            >
              {isSearching
                ? <><Loader2 size={13} className="animate-spin" /> Buscando...</>
                : <><Search size={13} /> Buscar</>}
            </button>
          </form>
        </div>

        {/* ── Feedback messages ────────────────────────────────────────────── */}
        {searchError && (
          <div className="mx-4 mb-2 flex items-center gap-2 p-2.5 rounded-lg bg-rose-950/50 border border-rose-500/40 text-xs text-rose-300 shrink-0">
            <AlertCircle size={13} /> {searchError}
          </div>
        )}
        {downloadMsg && (
          <div className="mx-4 mb-2 flex items-center gap-2 p-2.5 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-xs text-emerald-300 shrink-0">
            <CheckCircle size={13} /> {downloadMsg}
          </div>
        )}
        {downloadError && (
          <div className="mx-4 mb-2 flex items-center gap-2 p-2.5 rounded-lg bg-amber-950/50 border border-amber-500/40 text-xs text-amber-300 shrink-0">
            <AlertCircle size={13} /> {downloadError}
          </div>
        )}

        {/* ── Results list ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 min-h-0">
          {results.length === 0 && !isSearching && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 py-10">
              <Music size={36} className="opacity-25" />
              <p className="text-sm">Busca canciones, artistas o álbumes</p>
              <p className="text-xs opacity-60">Requiere yt-dlp instalado en el sistema</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="flex flex-col divide-y" style={{ borderColor: `${accent}15` }}>
              {results.map(track => {
                const isSelected = selectedIds.has(track.id);
                const isThisPlaying = playingId === track.id;
                return (
                  <div
                    key={track.id}
                    className="flex items-center gap-3 py-2 group hover:bg-white/3 rounded-lg px-1 transition-colors"
                  >
                    {/* Checkbox */}
                    <button
                      type="button"
                      onClick={() => toggleSelect(track.id)}
                      className="shrink-0 cursor-pointer transition-colors"
                      style={{ color: isSelected ? accent : "#475569" }}
                    >
                      {isSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                    </button>

                    {/* Thumbnail */}
                    <div className="w-9 h-9 rounded shrink-0 overflow-hidden bg-slate-800 relative">
                      {track.thumbnail ? (
                        <img
                          src={track.thumbnail}
                          alt={track.title}
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <Music size={14} className="absolute inset-0 m-auto text-slate-600" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-white truncate leading-tight">{track.title}</div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {track.artist}{track.album ? ` · ${track.album}` : ""}
                      </div>
                    </div>

                    {/* Duration */}
                    <span className="text-[10px] text-slate-500 font-mono shrink-0">{track.duration_string}</span>

                    {/* Play button */}
                    <button
                      type="button"
                      onClick={() => handlePlay(track)}
                      disabled={isLoadingPlay}
                      className="shrink-0 p-1.5 rounded-lg cursor-pointer transition-all opacity-0 group-hover:opacity-100 disabled:opacity-40"
                      style={{ backgroundColor: `${accent}20`, color: accent }}
                      title="Reproducir ahora"
                    >
                      {isThisPlaying && isLoadingPlay
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Play size={13} fill="currentColor" />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Download bar (only when results exist) ───────────────────────── */}
        {results.length > 0 && (
          <div
            className="shrink-0 border-t px-4 py-2"
            style={{ borderColor: `${accent}20`, background: `${accent}08` }}
          >
            {/* Options toggle */}
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
                  {selectedIds.size === results.length ? "Ninguno" : "Todos"}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={isDownloading || selectedIds.size === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white cursor-pointer disabled:opacity-50 transition-opacity"
                  style={{ backgroundColor: accent }}
                >
                  {isDownloading
                    ? <><Loader2 size={12} className="animate-spin" /> Descargando...</>
                    : <><Download size={12} /> Descargar ({selectedIds.size})</>}
                </button>
              </div>
            </div>

            {/* Expandable options */}
            {showOptions && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1.5 pb-0.5 text-[11px]">
                <label className="flex flex-col gap-0.5">
                  <span className="text-slate-500 uppercase tracking-wider text-[9px]">Formato</span>
                  <select
                    value={format}
                    onChange={e => setFormat(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-white focus:outline-none"
                    style={{ colorScheme: "dark" }}
                  >
                    {FORMATS.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                  </select>
                </label>

                <label className="flex flex-col gap-0.5">
                  <span className="text-slate-500 uppercase tracking-wider text-[9px]">Calidad</span>
                  <select
                    value={bitrate}
                    onChange={e => setBitrate(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-white focus:outline-none"
                    style={{ colorScheme: "dark" }}
                  >
                    {BITRATES.map(b => <option key={b} value={b}>{b === "lossless" ? "Sin pérdida" : b}</option>)}
                  </select>
                </label>

                <label className="flex flex-col gap-0.5">
                  <span className="text-slate-500 uppercase tracking-wider text-[9px]">Sample Rate</span>
                  <select
                    value={sampleRate}
                    onChange={e => setSampleRate(Number(e.target.value))}
                    className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-white focus:outline-none"
                    style={{ colorScheme: "dark" }}
                  >
                    {SAMPLE_RATES.map(r => <option key={r} value={r}>{r >= 1000 ? `${r / 1000} kHz` : r}</option>)}
                  </select>
                </label>

                <label className="flex flex-col gap-0.5">
                  <span className="text-slate-500 uppercase tracking-wider text-[9px]">Estructura</span>
                  <select
                    value={namingPattern}
                    onChange={e => setNamingPattern(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-white focus:outline-none"
                    style={{ colorScheme: "dark" }}
                  >
                    {NAMING_PATTERNS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </label>

                {/* Folder + ID3 toggle */}
                <div className="col-span-full flex items-center gap-4 pt-0.5">
                  <button
                    type="button"
                    onClick={handlePickFolder}
                    className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-white bg-slate-800 border border-slate-700 rounded px-2 py-1 cursor-pointer transition-colors"
                  >
                    <FolderOpen size={11} />
                    <span className="truncate max-w-[180px]">{outputFolder}</span>
                  </button>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none text-[10px] text-slate-400">
                    <button
                      type="button"
                      onClick={() => setEmbedId3(v => !v)}
                      style={{ color: embedId3 ? accent : "#475569" }}
                      className="cursor-pointer"
                    >
                      {embedId3 ? <CheckSquare size={13} /> : <Square size={13} />}
                    </button>
                    Incrustar carátula + ID3
                  </label>
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
