import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Music,
  Search,
  Download,
  Loader2,
  CheckCircle,
  AlertCircle,
  FolderOpen,
  ArrowRight,
  Disc,
  CheckSquare,
  Square,
  Tag,
  FolderTree,
  ChevronDown,
  ChevronUp,
  Globe,
} from "lucide-react";
import { useMusicStore } from "../../store/index.ts";

// ── Download types (mirrored from Soundix NeoDownloader) ────────────────────

interface NeoTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  year?: string;
  trackNumber: number;
  totalTracks: number;
  duration: number;
  durationString: string;
  coverUrl: string;
  sourceUrl?: string;
}

interface NeoAnalyzeResult {
  kind: "track" | "playlist" | "album" | "search";
  name: string;
  totalTracks: number;
  tracks: NeoTrack[];
}

interface NeoTrackProgress {
  trackId: string;
  phase: "queued" | "downloading" | "converting" | "tagging" | "done" | "error";
  percent: number;
  message: string;
  filePath?: string;
}

const FORMATS = ["mp3", "flac", "wav", "m4a", "opus", "ogg"] as const;
const BITRATES = ["lossless", "320k", "256k", "192k", "128k"] as const;
const SAMPLE_RATES = [44100, 48000, 88200, 96000, 192000] as const;
const NAMING_PATTERNS = [
  { label: "Artista / Año – Álbum / Nº – Título", value: "{artist}/{year} - {album}/{trackNumber} - {title}" },
  { label: "Artista / Álbum / Nº – Título", value: "{artist}/{album}/{trackNumber} - {title}" },
  { label: "Artista – Título", value: "{artist} - {title}" },
  { label: "Título", value: "{title}" },
  { label: "Nº – Título", value: "{trackNumber} - {title}" },
] as const;

interface YTMusicModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function invokeBackend<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

async function analyzeLink(query: string, limit = 20): Promise<NeoAnalyzeResult> {
  return invokeBackend<NeoAnalyzeResult>("analyze_source_link", { query, limit });
}

async function downloadBatch(
  tracks: NeoTrack[],
  options: Record<string, unknown>,
): Promise<string[]> {
  return invokeBackend<string[]>("download_track_batch", { tracks, options });
}

async function pickFolder(): Promise<string | null> {
  try {
    return invokeBackend<string | null>("pick_output_folder", {});
  } catch {
    return null;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export const YTMusicModal: React.FC<YTMusicModalProps> = ({ isOpen, onClose }) => {
  const { appearance } = useMusicStore();
  const accent = appearance.accentColor || "#06b6d4";

  // Tab: "player" or "downloader"
  const [activeTab, setActiveTab] = useState<"player" | "downloader">("player");

  // ── Downloader state ──────────────────────────────────────────────────────
  const [sourceInput, setSourceInput] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<NeoAnalyzeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Settings
  const [format, setFormat] = useState<string>("mp3");
  const [bitrate, setBitrate] = useState<string>("320k");
  const [sampleRate, setSampleRate] = useState<number>(44100);
  const [namingPattern, setNamingPattern] = useState<string>(NAMING_PATTERNS[0].value);
  const [saveInFolder, setSaveInFolder] = useState(true);
  const [embedId3Tags, setEmbedId3Tags] = useState(true);
  const [outputFolder, setOutputFolder] = useState("/home/neokamen/Descargas");
  const [showSettings, setShowSettings] = useState(false);

  // Download progress
  const [isDownloading, setIsDownloading] = useState(false);
  const [progresses, setProgresses] = useState<Record<string, NeoTrackProgress>>({});
  const [doneCount, setDoneCount] = useState<number | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Listen to per-track download-progress events
    let unlisten: (() => void) | null = null;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<NeoTrackProgress>("download-track-progress", (ev) => {
        setProgresses((prev) => ({ ...prev, [ev.payload.trackId]: ev.payload }));
      }).then((fn) => { unlisten = fn; });
    });
    return () => { unlisten?.(); };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAnalyze = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = sourceInput.trim();
    if (!q) return;
    setIsAnalyzing(true);
    setErrorMsg(null);
    setAnalyzeResult(null);
    setProgresses({});
    setDoneCount(null);
    try {
      const res = await analyzeLink(q);
      setAnalyzeResult(res);
      setSelectedIds(new Set(res.tracks.map((t) => t.id)));
    } catch (err: any) {
      setErrorMsg(err?.toString() || "Error al analizar el enlace.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleTrack = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!analyzeResult) return;
    if (selectedIds.size === analyzeResult.tracks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(analyzeResult.tracks.map((t) => t.id)));
    }
  };

  const handlePickFolder = async () => {
    const f = await pickFolder();
    if (f) setOutputFolder(f);
  };

  const handleDownload = async () => {
    if (!analyzeResult) return;
    const tracks = analyzeResult.tracks.filter((t) => selectedIds.has(t.id));
    if (tracks.length === 0) return;

    setIsDownloading(true);
    setErrorMsg(null);
    setDoneCount(null);

    const initialProgress: Record<string, NeoTrackProgress> = {};
    tracks.forEach((t) => {
      initialProgress[t.id] = { trackId: t.id, phase: "queued", percent: 0, message: "En cola..." };
    });
    setProgresses(initialProgress);

    const options = {
      format,
      bitrate,
      sampleRate: format !== "mp4" && sampleRate !== 44100 ? sampleRate : undefined,
      saveInFolder,
      folderName: analyzeResult.kind !== "track" ? analyzeResult.name : undefined,
      namingPattern,
      embedId3Tags,
      outputFolder,
    };

    try {
      const files = await downloadBatch(tracks, options);
      setDoneCount(files.length);
    } catch (err: any) {
      setErrorMsg(err?.toString() || "Error durante la descarga.");
    } finally {
      setIsDownloading(false);
    }
  };

  const phaseColors: Record<NeoTrackProgress["phase"], string> = {
    queued: "text-slate-400",
    downloading: "text-blue-400",
    converting: "text-amber-400",
    tagging: "text-purple-400",
    done: "text-emerald-400",
    error: "text-rose-400",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex flex-col w-[92vw] max-w-4xl h-[88vh] rounded-2xl overflow-hidden shadow-2xl border"
        style={{ backgroundColor: "#0a0f1a", borderColor: `${accent}40` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b shrink-0"
          style={{ borderColor: `${accent}30`, background: `${accent}10` }}
        >
          <div className="flex items-center gap-2.5">
            <Globe size={18} style={{ color: accent }} />
            <span className="font-bold text-sm text-white">YT Music</span>
            <span className="text-[10px] text-slate-400 font-mono px-2 py-0.5 rounded-full border border-slate-700">STREAMING + DOWNLOAD</span>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-slate-900/60 rounded-lg p-1">
            {(["player", "downloader"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer"
                style={
                  activeTab === tab
                    ? { backgroundColor: accent, color: "#fff" }
                    : { color: "#94a3b8" }
                }
              >
                {tab === "player" ? "▶ Reproductor" : "⬇ Descargador"}
              </button>
            ))}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {/* ── PLAYER TAB ── */}
          {activeTab === "player" && (
            <iframe
              ref={iframeRef}
              src="https://music.youtube.com"
              title="YouTube Music"
              className="w-full h-full border-0"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
            />
          )}

          {/* ── DOWNLOADER TAB ── */}
          {activeTab === "downloader" && (
            <div className="flex flex-col h-full overflow-y-auto gap-4 p-4 text-sm">
              {/* Search / URL bar */}
              <form onSubmit={handleAnalyze} className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={sourceInput}
                    onChange={(e) => setSourceInput(e.target.value)}
                    placeholder="Pega URL de YouTube Music o busca: artista álbum canción..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 pl-9 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                    style={{ borderColor: `${accent}40` }}
                  />
                  <Search size={14} className="absolute left-3 top-3.5 text-slate-500" />
                </div>
                <button
                  type="submit"
                  disabled={isAnalyzing || !sourceInput.trim()}
                  className="px-5 py-2.5 rounded-xl font-bold text-sm text-white flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 shrink-0"
                  style={{ backgroundColor: accent }}
                >
                  {isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                  {isAnalyzing ? "Analizando..." : "Analizar"}
                </button>
              </form>

              {errorMsg && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300">
                  <AlertCircle size={14} />
                  {errorMsg}
                </div>
              )}

              {doneCount !== null && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-300">
                  <CheckCircle size={14} />
                  ¡{doneCount} pista{doneCount !== 1 ? "s" : ""} descargada{doneCount !== 1 ? "s" : ""}!
                </div>
              )}

              {/* Settings toggle */}
              <div className="rounded-xl border border-slate-700/60 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowSettings(!showSettings)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-900/60 hover:bg-slate-800/60 transition-colors cursor-pointer text-xs text-slate-300 font-semibold"
                >
                  <span className="flex items-center gap-2">
                    <FolderTree size={13} style={{ color: accent }} />
                    Opciones de Descarga
                  </span>
                  {showSettings ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>

                {showSettings && (
                  <div className="p-4 bg-slate-950/40 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    {/* Format */}
                    <label className="flex flex-col gap-1">
                      <span className="text-slate-400 uppercase tracking-wider text-[10px]">Formato</span>
                      <select
                        value={format}
                        onChange={(e) => setFormat(e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white focus:outline-none"
                        style={{ colorScheme: "dark" }}
                      >
                        {FORMATS.map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                      </select>
                    </label>

                    {/* Bitrate */}
                    <label className="flex flex-col gap-1">
                      <span className="text-slate-400 uppercase tracking-wider text-[10px]">Bitrate</span>
                      <select
                        value={bitrate}
                        onChange={(e) => setBitrate(e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white focus:outline-none"
                        style={{ colorScheme: "dark" }}
                      >
                        {BITRATES.map((b) => <option key={b} value={b}>{b === "lossless" ? "Sin pérdida" : b}</option>)}
                      </select>
                    </label>

                    {/* Sample rate */}
                    <label className="flex flex-col gap-1">
                      <span className="text-slate-400 uppercase tracking-wider text-[10px]">Sample Rate</span>
                      <select
                        value={sampleRate}
                        onChange={(e) => setSampleRate(Number(e.target.value))}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white focus:outline-none"
                        style={{ colorScheme: "dark" }}
                      >
                        {SAMPLE_RATES.map((r) => <option key={r} value={r}>{r >= 1000 ? `${r / 1000} kHz` : r}</option>)}
                      </select>
                    </label>

                    {/* Naming pattern */}
                    <label className="flex flex-col gap-1 col-span-2">
                      <span className="text-slate-400 uppercase tracking-wider text-[10px]">Estructura de carpetas</span>
                      <select
                        value={namingPattern}
                        onChange={(e) => setNamingPattern(e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white focus:outline-none"
                        style={{ colorScheme: "dark" }}
                      >
                        {NAMING_PATTERNS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                    </label>

                    {/* Output folder */}
                    <div className="flex flex-col gap-1">
                      <span className="text-slate-400 uppercase tracking-wider text-[10px]">Carpeta destino</span>
                      <button
                        type="button"
                        onClick={handlePickFolder}
                        className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-300 hover:text-white hover:border-slate-500 transition-colors cursor-pointer"
                      >
                        <FolderOpen size={12} />
                        <span className="truncate max-w-[120px] text-[10px]">{outputFolder || "Seleccionar..."}</span>
                      </button>
                    </div>

                    {/* Toggles */}
                    <div className="col-span-full flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <button
                          type="button"
                          onClick={() => setSaveInFolder(!saveInFolder)}
                          className="cursor-pointer"
                          style={{ color: saveInFolder ? accent : "#64748b" }}
                        >
                          {saveInFolder ? <CheckSquare size={15} /> : <Square size={15} />}
                        </button>
                        <span className="text-slate-300">Guardar en carpeta del álbum</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <button
                          type="button"
                          onClick={() => setEmbedId3Tags(!embedId3Tags)}
                          className="cursor-pointer"
                          style={{ color: embedId3Tags ? accent : "#64748b" }}
                        >
                          {embedId3Tags ? <CheckSquare size={15} /> : <Square size={15} />}
                        </button>
                        <span className="text-slate-300 flex items-center gap-1">
                          <Tag size={11} /> Incrustar ID3 / metadatos
                        </span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Track list */}
              {analyzeResult && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Disc size={14} style={{ color: accent }} />
                      <span className="font-bold text-white">{analyzeResult.name}</span>
                      <span className="text-[10px] text-slate-400 px-1.5 py-0.5 rounded-full bg-slate-800 border border-slate-700">
                        {analyzeResult.totalTracks} pistas
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleAll}
                        className="text-[10px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700 cursor-pointer transition-colors"
                      >
                        {selectedIds.size === analyzeResult.tracks.length ? "Deseleccionar todo" : "Seleccionar todo"}
                      </button>
                      <button
                        type="button"
                        onClick={handleDownload}
                        disabled={isDownloading || selectedIds.size === 0}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white transition-all cursor-pointer disabled:opacity-50"
                        style={{ backgroundColor: accent }}
                      >
                        {isDownloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        Descargar ({selectedIds.size})
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 max-h-72 overflow-y-auto rounded-xl border border-slate-700/60">
                    {analyzeResult.tracks.map((track) => {
                      const progress = progresses[track.id];
                      const isSelected = selectedIds.has(track.id);
                      return (
                        <div
                          key={track.id}
                          onClick={() => toggleTrack(track.id)}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800/40 cursor-pointer transition-colors"
                        >
                          <div style={{ color: isSelected ? accent : "#475569" }}>
                            {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-semibold text-white truncate">{track.title}</div>
                            <div className="text-[10px] text-slate-400 truncate">{track.artist} · {track.album}</div>
                          </div>
                          {progress && (
                            <div className={`text-[10px] font-mono ${phaseColors[progress.phase]} shrink-0`}>
                              {progress.phase === "done" ? "✓" : progress.phase === "error" ? "✗" : `${progress.percent.toFixed(0)}%`}
                            </div>
                          )}
                          <div className="text-[10px] text-slate-500 shrink-0 font-mono">{track.durationString}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!analyzeResult && !isAnalyzing && (
                <div className="flex flex-col items-center justify-center flex-1 gap-3 text-slate-500 py-12">
                  <Music size={40} className="opacity-30" />
                  <p className="text-sm">Pega una URL de YouTube Music o escribe un nombre para buscar</p>
                  <p className="text-xs opacity-60">Soporta canciones individuales, álbumes y playlists completas</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default YTMusicModal;
