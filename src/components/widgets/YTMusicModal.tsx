import React, { useState, useEffect } from "react";
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
  ArrowLeft,
} from "lucide-react";
import { useMusicStore } from "../../store/index.ts";

// ── Downloader Types (del NeoDownloader de Soundix) ─────────────────────────

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

interface OnlinePlaylistItem {
  id: string;
  title: string;
  uploader: string;
  url: string;
  cover: string;
  trackCount?: number;
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

export interface YTMusicModalProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
  onBackToLibrary?: () => void;
}

// ── Backend API Helpers ──────────────────────────────────────────────────────

async function invokeBackend<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

async function analyzeLink(query: string, limit = 20): Promise<NeoAnalyzeResult> {
  return invokeBackend<NeoAnalyzeResult>("analyze_source_link", { query, limit });
}

async function searchPlaylists(query: string): Promise<OnlinePlaylistItem[]> {
  return invokeBackend<OnlinePlaylistItem[]>("search_online_playlists", { query });
}

async function downloadBatch(tracks: NeoTrack[], options: Record<string, unknown>): Promise<string[]> {
  return invokeBackend<string[]>("download_track_batch", { tracks, options });
}

async function pickFolder(): Promise<string | null> {
  try { return invokeBackend<string | null>("pick_output_folder", {}); } catch { return null; }
}

// ── Component ─────────────────────────────────────────────────────────────────

export const YTMusicModal: React.FC<YTMusicModalProps> = ({
  isOpen,
  onClose,
  embedded = false,
  onBackToLibrary,
}) => {
  const { appearance } = useMusicStore();
  const accent = appearance.accentColor || "#06b6d4";

  // Tab: "player" | "downloader"
  const [activeTab, setActiveTab] = useState<"player" | "downloader">("player");
  
  // Downloader & Search State (exactamente como en Soundix)
  const [sourceInput, setSourceInput] = useState("");
  const [searchMode, setSearchMode] = useState<"tracks" | "playlists">("tracks");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSearchingPlaylists, setIsSearchingPlaylists] = useState(false);
  const [playlistResults, setPlaylistResults] = useState<OnlinePlaylistItem[]>([]);
  const [analyzeResult, setAnalyzeResult] = useState<NeoAnalyzeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Download Config Settings
  const [format, setFormat] = useState<string>("mp3");
  const [bitrate, setBitrate] = useState<string>("320k");
  const [sampleRate, setSampleRate] = useState<number>(44100);
  const [namingPattern, setNamingPattern] = useState<string>(NAMING_PATTERNS[0].value);
  const [saveInFolder, setSaveInFolder] = useState(true);
  const [embedId3Tags, setEmbedId3Tags] = useState(true);
  const [outputFolder, setOutputFolder] = useState("/home/neokamen/Descargas");
  const [showSettings, setShowSettings] = useState(false);

  // Progress State
  const [isDownloading, setIsDownloading] = useState(false);
  const [progresses, setProgresses] = useState<Record<string, NeoTrackProgress>>({});
  const [doneCount, setDoneCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let unlisten: (() => void) | null = null;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<NeoTrackProgress>("download-track-progress", (ev) => {
        setProgresses((prev) => ({ ...prev, [ev.payload.trackId]: ev.payload }));
      }).then((fn) => { unlisten = fn; });
    });
    return () => { unlisten?.(); };
  }, [isOpen]);

  if (!isOpen) return null;

  // Analizar o buscar en YouTube Music
  const handleAnalyze = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const query = (customQuery || sourceInput).trim();
    if (!query) return;

    setErrorMsg(null);
    setDoneCount(null);
    setProgresses({});

    const isUrl = query.startsWith("http://") || query.startsWith("https://");

    if (searchMode === "playlists" && !isUrl) {
      setIsSearchingPlaylists(true);
      setAnalyzeResult(null);
      try {
        const list = await searchPlaylists(query);
        setPlaylistResults(list);
        if (list.length === 0) setErrorMsg("No se encontraron álbumes ni playlists para esta búsqueda.");
      } catch (err: unknown) {
        setErrorMsg(String(err) || "Error buscando álbumes/playlists.");
      } finally {
        setIsSearchingPlaylists(false);
      }
      return;
    }

    setIsAnalyzing(true);
    setPlaylistResults([]);
    try {
      const res = await analyzeLink(query);
      setAnalyzeResult(res);
      setSelectedIds(new Set(res.tracks.map((t) => t.id)));
    } catch (err: unknown) {
      setErrorMsg(String(err) || "Error al analizar el contenido de YT Music.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSelectPlaylist = async (url: string) => {
    setSourceInput(url);
    handleAnalyze(undefined, url);
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
    setSelectedIds(
      selectedIds.size === analyzeResult.tracks.length
        ? new Set()
        : new Set(analyzeResult.tracks.map((t) => t.id))
    );
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
    const init: Record<string, NeoTrackProgress> = {};
    tracks.forEach((t) => { init[t.id] = { trackId: t.id, phase: "queued", percent: 0, message: "En cola..." }; });
    setProgresses(init);

    try {
      const files = await downloadBatch(tracks, {
        format,
        bitrate,
        sampleRate: format !== "mp4" && sampleRate !== 44100 ? sampleRate : undefined,
        saveInFolder,
        folderName: analyzeResult.kind !== "track" ? analyzeResult.name : undefined,
        namingPattern,
        embedId3Tags,
        outputFolder,
      });
      setDoneCount(files.length);
    } catch (err: unknown) {
      setErrorMsg(String(err) || "Error durante la descarga.");
    } finally {
      setIsDownloading(false);
    }
  };

  const phaseColors: Record<NeoTrackProgress["phase"], string> = {
    queued: "text-audiophile-muted", downloading: "text-blue-400", converting: "text-amber-400",
    tagging: "text-purple-400", done: "text-emerald-400", error: "text-rose-400",
  };

  const containerClasses = embedded
    ? "flex flex-col h-full w-full bg-audiophile-surface select-none font-sans overflow-hidden text-xs"
    : "fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm";

  const dialogClasses = embedded
    ? "flex flex-col h-full w-full bg-audiophile-surface overflow-hidden"
    : "relative flex flex-col w-[92vw] max-w-4xl h-[88vh] rounded-2xl overflow-hidden shadow-2xl border border-audiophile-border bg-audiophile-surface";

  return (
    <div className={containerClasses} onClick={embedded ? undefined : onClose}>
      <div className={dialogClasses} onClick={(e) => e.stopPropagation()}>
        {/* Encabezado con el estilo y acento de la app */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-audiophile-border bg-audiophile-surface2 shrink-0">
          <div className="flex items-center gap-2">
            {embedded && onBackToLibrary && (
              <button
                type="button"
                onClick={onBackToLibrary}
                className="p-1 rounded hover:bg-audiophile-border text-audiophile-text transition-colors cursor-pointer"
                title="Volver a la biblioteca"
              >
                <ArrowLeft size={14} />
              </button>
            )}
            <Globe size={16} style={{ color: accent }} />
            <span className="font-bold font-mono text-xs text-audiophile-text">YouTube Music</span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-audiophile-border text-audiophile-muted bg-audiophile-base">
              SOUNDIX ENGINE
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex items-center bg-audiophile-base rounded p-0.5 border border-audiophile-border">
              {(["player", "downloader"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className="px-2.5 py-1 rounded text-[11px] font-mono font-semibold transition cursor-pointer"
                  style={
                    activeTab === tab
                      ? { backgroundColor: accent, color: "#fff" }
                      : { color: "var(--app-muted, #94a3b8)" }
                  }
                >
                  {tab === "player" ? "▶ Buscador & YT Music" : "⬇ Descargador Soundix"}
                </button>
              ))}
            </div>

            {!embedded && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded hover:bg-audiophile-border text-audiophile-muted hover:text-audiophile-text transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Cuerpo Principal */}
        <div className="flex-1 min-h-0 flex flex-col bg-audiophile-surface overflow-hidden">
          {/* TAB 1: REPRODUCTOR / BUSCADOR EMBEBIDO */}
          {activeTab === "player" && (
            <div className="flex flex-col h-full w-full">
              {/* Barra de Búsqueda Integrada YT Music */}
              <div className="p-2 border-b border-audiophile-border bg-audiophile-surface2 flex gap-2 shrink-0">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!sourceInput.trim()) return;
                    const url = sourceInput.startsWith("http")
                      ? sourceInput
                      : `https://music.youtube.com/search?q=${encodeURIComponent(sourceInput)}`;
                    const frame = document.getElementById("yt-music-iframe") as HTMLIFrameElement;
                    if (frame) frame.src = url;
                  }}
                  className="flex-1 flex gap-2"
                >
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={sourceInput}
                      onChange={(e) => setSourceInput(e.target.value)}
                      placeholder="Buscar en YT Music: Canciones, Artistas, Álbumes o Enlace..."
                      className="w-full bg-audiophile-base border border-audiophile-border rounded px-3 py-1.5 pl-8 font-mono text-[11px] text-audiophile-text placeholder-audiophile-muted/50 focus:outline-none"
                    />
                    <Search size={13} className="absolute left-2.5 top-2 text-audiophile-muted" />
                  </div>
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded font-mono text-[11px] font-bold text-white transition cursor-pointer"
                    style={{ backgroundColor: accent }}
                  >
                    Buscar
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("downloader");
                    if (sourceInput.trim()) handleAnalyze();
                  }}
                  className="px-3 py-1.5 rounded border border-audiophile-border bg-audiophile-base hover:bg-audiophile-surface2 text-audiophile-text font-mono text-[11px] flex items-center gap-1.5 transition cursor-pointer shrink-0"
                  title="Analizar esta búsqueda en el Descargador de Soundix"
                >
                  <Download size={13} style={{ color: accent }} />
                  <span>Enviar a Descargador</span>
                </button>
              </div>

              {/* Contenedor IFrame de YouTube Music */}
              <div className="flex-1 w-full h-full bg-black relative">
                <iframe
                  id="yt-music-iframe"
                  src="https://music.youtube.com"
                  title="YouTube Music"
                  className="w-full h-full border-0"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
                />
              </div>
            </div>
          )}

          {/* TAB 2: DESCARGADOR DE MUSICA (SOUNDIX ENGINE COMPLETO) */}
          {activeTab === "downloader" && (
            <div className="flex flex-col h-full overflow-y-auto p-3 gap-3 font-mono text-xs text-audiophile-text">
              {/* Selector de Modo Canciones vs Álbumes + Búsqueda */}
              <div className="p-3 bg-audiophile-surface2 border border-audiophile-border rounded-lg flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setSearchMode("tracks"); setPlaylistResults([]); }}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      searchMode === "tracks" ? "text-white shadow-xs" : "bg-audiophile-base border border-audiophile-border text-audiophile-muted"
                    }`}
                    style={searchMode === "tracks" ? { backgroundColor: accent } : undefined}
                  >
                    <Music size={12} />
                    <span>Canciones sueltas</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchMode("playlists")}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      searchMode === "playlists" ? "text-white shadow-xs" : "bg-audiophile-base border border-audiophile-border text-audiophile-muted"
                    }`}
                    style={searchMode === "playlists" ? { backgroundColor: accent } : undefined}
                  >
                    <Disc size={12} />
                    <span>Álbumes / Playlists</span>
                  </button>
                </div>

                <form onSubmit={handleAnalyze} className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={sourceInput}
                      onChange={(e) => setSourceInput(e.target.value)}
                      placeholder={searchMode === "playlists" ? "Buscar álbumes o playlists... Ej: Meteora, Queen Greatest Hits" : "Pega URL de YT Music o busca: Artista - Canción"}
                      className="w-full bg-audiophile-base border border-audiophile-border rounded px-3 py-2 pl-8 text-[11px] text-audiophile-text placeholder-audiophile-muted/50 focus:outline-none"
                    />
                    <Search size={13} className="absolute left-2.5 top-2.5 text-audiophile-muted" />
                  </div>
                  <button
                    type="submit"
                    disabled={isAnalyzing || isSearchingPlaylists || !sourceInput.trim()}
                    className="px-4 py-2 rounded font-bold text-[11px] text-white flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shrink-0"
                    style={{ backgroundColor: accent }}
                  >
                    {isAnalyzing || isSearchingPlaylists ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                    {isAnalyzing ? "Analizando..." : searchMode === "playlists" ? "Buscar Álbumes" : "Analizar"}
                  </button>
                </form>

                {/* Resultados de Álbumes */}
                {playlistResults.length > 0 && !analyzeResult && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 pt-2 border-t border-audiophile-border">
                    {playlistResults.map((item) => (
                      <div key={item.id || item.url} className="p-2 bg-audiophile-base border border-audiophile-border rounded flex items-center gap-2.5">
                        <div className="size-10 rounded overflow-hidden bg-audiophile-surface shrink-0 border border-audiophile-border flex items-center justify-center">
                          {item.cover ? <img src={item.cover} alt={item.title} className="w-full h-full object-cover" /> : <Disc size={16} className="text-audiophile-muted" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-bold truncate text-audiophile-text">{item.title}</div>
                          <div className="text-[9px] text-audiophile-muted truncate">{item.uploader}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSelectPlaylist(item.url)}
                          className="px-2 py-1 rounded text-[10px] font-bold text-white transition cursor-pointer"
                          style={{ backgroundColor: accent }}
                        >
                          Cargar
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {errorMsg && (
                  <div className="p-2 rounded bg-rose-950/40 border border-rose-500/40 text-[10px] text-rose-300 flex items-center gap-2">
                    <AlertCircle size={13} /> {errorMsg}
                  </div>
                )}
                {doneCount !== null && (
                  <div className="p-2 rounded bg-emerald-950/40 border border-emerald-500/40 text-[10px] text-emerald-300 flex items-center gap-2">
                    <CheckCircle size={13} /> ¡{doneCount} pista(s) descargada(s) con éxito!
                  </div>
                )}
              </div>

              {/* Ajustes de Descarga Soundix */}
              <div className="border border-audiophile-border rounded-lg bg-audiophile-surface2 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowSettings(!showSettings)}
                  className="w-full px-3 py-2 flex items-center justify-between text-[11px] font-bold text-audiophile-text hover:bg-audiophile-base/50 transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <FolderTree size={13} style={{ color: accent }} />
                    Configuración de Conversión & Calidad (Soundix)
                  </span>
                  {showSettings ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>

                {showSettings && (
                  <div className="p-3 bg-audiophile-base border-t border-audiophile-border grid grid-cols-2 md:grid-cols-3 gap-2.5 text-[10px]">
                    <label className="flex flex-col gap-1">
                      <span className="text-audiophile-muted uppercase">Formato</span>
                      <select value={format} onChange={(e) => setFormat(e.target.value)} className="bg-audiophile-surface border border-audiophile-border rounded p-1 text-audiophile-text">
                        {FORMATS.map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-audiophile-muted uppercase">Bitrate</span>
                      <select value={bitrate} onChange={(e) => setBitrate(e.target.value)} className="bg-audiophile-surface border border-audiophile-border rounded p-1 text-audiophile-text">
                        {BITRATES.map((b) => <option key={b} value={b}>{b === "lossless" ? "Sin Pérdida" : b}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-audiophile-muted uppercase">Sample Rate</span>
                      <select value={sampleRate} onChange={(e) => setSampleRate(Number(e.target.value))} className="bg-audiophile-surface border border-audiophile-border rounded p-1 text-audiophile-text">
                        {SAMPLE_RATES.map((r) => <option key={r} value={r}>{r >= 1000 ? `${r / 1000} kHz` : r}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 col-span-2">
                      <span className="text-audiophile-muted uppercase">Estructura Nombres</span>
                      <select value={namingPattern} onChange={(e) => setNamingPattern(e.target.value)} className="bg-audiophile-surface border border-audiophile-border rounded p-1 text-audiophile-text">
                        {NAMING_PATTERNS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                    </label>
                    <div className="flex flex-col gap-1">
                      <span className="text-audiophile-muted uppercase">Carpeta Destino</span>
                      <button type="button" onClick={handlePickFolder} className="flex items-center gap-1 bg-audiophile-surface border border-audiophile-border rounded p-1 text-audiophile-text truncate">
                        <FolderOpen size={11} />
                        <span className="truncate text-[9px]">{outputFolder}</span>
                      </button>
                    </div>
                    <div className="col-span-full flex items-center gap-4 pt-1">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={saveInFolder} onChange={(e) => setSaveInFolder(e.target.checked)} className="accent-cyan-400" />
                        <span>Guardar en subcarpeta de álbum</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={embedId3Tags} onChange={(e) => setEmbedId3Tags(e.target.checked)} className="accent-cyan-400" />
                        <span className="flex items-center gap-1"><Tag size={10} /> Incrustar carátula e ID3</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Lista de Pistas Analizadas */}
              {analyzeResult && (
                <div className="flex flex-col gap-2 border border-audiophile-border rounded-lg p-2.5 bg-audiophile-surface2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Disc size={13} style={{ color: accent }} />
                      <span className="font-bold text-[11px]">{analyzeResult.name}</span>
                      <span className="text-[9px] text-audiophile-muted">({analyzeResult.totalTracks} pistas)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={toggleAll} className="px-2 py-0.5 rounded bg-audiophile-base border border-audiophile-border text-[9px] cursor-pointer">
                        {selectedIds.size === analyzeResult.tracks.length ? "Deseleccionar todo" : "Seleccionar todo"}
                      </button>
                      <button
                        type="button"
                        onClick={handleDownload}
                        disabled={isDownloading || selectedIds.size === 0}
                        className="px-3 py-1 rounded text-[10px] font-bold text-white flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                        style={{ backgroundColor: accent }}
                      >
                        {isDownloading ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                        Descargar ({selectedIds.size})
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 max-h-60 overflow-y-auto border border-audiophile-border rounded bg-audiophile-base p-1">
                    {analyzeResult.tracks.map((track) => {
                      const progress = progresses[track.id];
                      const isSelected = selectedIds.has(track.id);
                      return (
                        <div key={track.id} onClick={() => toggleTrack(track.id)} className="flex items-center gap-2 px-2 py-1.5 hover:bg-audiophile-surface2 rounded cursor-pointer text-[10px]">
                          <div style={{ color: isSelected ? accent : "#64748b" }}>
                            {isSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold truncate">{track.title}</div>
                            <div className="text-[9px] text-audiophile-muted truncate">{track.artist} · {track.album}</div>
                          </div>
                          {progress && (
                            <div className={`font-mono text-[9px] ${phaseColors[progress.phase]} shrink-0`}>
                              {progress.phase === "done" ? "✓ OK" : progress.phase === "error" ? "✗ Error" : `${progress.percent.toFixed(0)}%`}
                            </div>
                          )}
                          <div className="text-audiophile-muted shrink-0">{track.durationString}</div>
                        </div>
                      );
                    })}
                  </div>
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
