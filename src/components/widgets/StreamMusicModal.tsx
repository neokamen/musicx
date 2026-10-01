import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Globe, Search, Download, Play, Pause, Loader2, Music, ArrowLeft,
  CheckSquare, Square, FolderOpen,
  AlertCircle, CheckCircle, X, Check, ListPlus, ListMusic,
} from "lucide-react";
import { useMusicStore } from "../../store/index.ts";
import { isStreamTrack, streamFilepath, streamTrackFromNeo } from "../../lib/streamTracks.ts";

// ── Types (Identical to Soundix NeoDownloader) ───────────────────────────────

export interface NeoTrack {
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

export interface AnalyzeResult {
  kind: "track" | "playlist" | "album" | "search";
  name: string;
  totalTracks: number;
  tracks: NeoTrack[];
}

export interface TrackProgress {
  trackId: string;
  phase: "queued" | "downloading" | "converting" | "tagging" | "done" | "error";
  percent: number;
  message: string;
  filePath?: string;
}

const FORMATS = ["mp3", "flac", "wav", "m4a", "opus"] as const;
const BITRATES = ["320k", "256k", "192k", "128k", "lossless"] as const;
const SAMPLE_RATES = [44100, 48000, 88200, 96000, 192000] as const;
const NAMING_PATTERNS = [
  { label: "Artista / Año – Álbum / Nº Título", value: "artist_year_album_track_title" },
  { label: "Artista / Álbum / Nº Título", value: "artist_album_track_title" },
  { label: "Artista – Título", value: "artist_title" },
  { label: "Título", value: "title" },
] as const;

export const DEFAULT_STREAM_TRACKS: NeoTrack[] = [
  {
    id: "yt_cZnBNuqqz5g",
    title: "Bohemian Rhapsody",
    artist: "Queen",
    album: "A Night at the Opera",
    year: "1975",
    trackNumber: 1,
    totalTracks: 8,
    duration: 355,
    durationString: "5:55",
    coverUrl: "https://i.ytimg.com/vi/cZnBNuqqz5g/hq720.jpg",
    sourceUrl: "https://www.youtube.com/watch?v=cZnBNuqqz5g",
  },
  {
    id: "yt_fTKqtvXjkvo",
    title: "Trending Global Pop Hits",
    artist: "Dua Lipa & Top Artists",
    album: "Top Hits 2026",
    year: "2026",
    trackNumber: 2,
    totalTracks: 8,
    duration: 215,
    durationString: "3:35",
    coverUrl: "https://i.ytimg.com/vi/fTKqtvXjkvo/hq720.jpg",
    sourceUrl: "https://www.youtube.com/watch?v=fTKqtvXjkvo",
  },
  {
    id: "yt_oSBx5IfabCo",
    title: "Blinding Lights / Billboard Top",
    artist: "The Weeknd & Ed Sheeran",
    album: "After Hours / Chart Hits",
    year: "2025",
    trackNumber: 3,
    totalTracks: 8,
    duration: 202,
    durationString: "3:22",
    coverUrl: "https://i.ytimg.com/vi/oSBx5IfabCo/hq720.jpg",
    sourceUrl: "https://www.youtube.com/watch?v=oSBx5IfabCo",
  },
  {
    id: "yt_WBy8ETk_Fqs",
    title: "Die With A Smile / Pop Acoustic",
    artist: "Lady Gaga & Bruno Mars",
    album: "Spotify Hits Collection",
    year: "2025",
    trackNumber: 4,
    totalTracks: 8,
    duration: 251,
    durationString: "4:11",
    coverUrl: "https://i.ytimg.com/vi/WBy8ETk_Fqs/hq720.jpg",
    sourceUrl: "https://www.youtube.com/watch?v=WBy8ETk_Fqs",
  },
  {
    id: "yt_i26406_EldM",
    title: "Don't Stop Me Now / Live Tribute",
    artist: "Queen & Elton John",
    album: "The Platinum Collection",
    year: "1992",
    trackNumber: 5,
    totalTracks: 8,
    duration: 220,
    durationString: "3:40",
    coverUrl: "https://i.ytimg.com/vi/i26406_EldM/hq720.jpg",
    sourceUrl: "https://www.youtube.com/watch?v=i26406_EldM",
  },
  {
    id: "yt_Fpdr4ZlPItg",
    title: "Every Breath You Take",
    artist: "The Police",
    album: "Synchronicity",
    year: "1983",
    trackNumber: 6,
    totalTracks: 8,
    duration: 254,
    durationString: "4:14",
    coverUrl: "https://i.ytimg.com/vi/Fpdr4ZlPItg/hq720.jpg",
    sourceUrl: "https://www.youtube.com/watch?v=Fpdr4ZlPItg",
  },
  {
    id: "yt_7aURX_GwFmk",
    title: "Espresso / UK Top Singles",
    artist: "Sabrina Carpenter",
    album: "Short n' Sweet",
    year: "2024",
    trackNumber: 7,
    totalTracks: 8,
    duration: 175,
    durationString: "2:55",
    coverUrl: "https://i.ytimg.com/vi/7aURX_GwFmk/hq720.jpg",
    sourceUrl: "https://www.youtube.com/watch?v=7aURX_GwFmk",
  },
  {
    id: "yt_97K9ByldojI",
    title: "Summer Vibes & Chill Sunset",
    artist: "Coldplay & Avicii",
    album: "Summer Chill Collection",
    year: "2025",
    trackNumber: 8,
    totalTracks: 8,
    duration: 230,
    durationString: "3:50",
    coverUrl: "https://i.ytimg.com/vi/97K9ByldojI/hq720.jpg",
    sourceUrl: "https://www.youtube.com/watch?v=97K9ByldojI",
  },
];

type SearchFilterCategory = "all" | "songs" | "artists" | "albums";

interface StreamMusicModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  embedded?: boolean;
  onBackToLibrary?: () => void;
}

export const StreamMusicModal: React.FC<StreamMusicModalProps> = ({ isOpen = false, onClose = () => {}, embedded = false, onBackToLibrary }) => {
  const {
    appearance,
    isStreamMusicOpen,
    setStreamMusicOpen,
    play,
    addToQueue,
    currentTrack,
    isPlaying,
    togglePlayPause,
  } = useMusicStore();
  const accent = appearance.accentColor || "#06b6d4";

  // Visual modal open state (synced with props and store)
  const isVisible = embedded || isOpen || isStreamMusicOpen;

  // Search state — initialized with curated default stream catalog
  const [query, setQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState<SearchFilterCategory>("all");
  const [result, setResult] = useState<AnalyzeResult | null>({
    kind: "search",
    name: "Catálogo Recomendado en Streaming",
    totalTracks: DEFAULT_STREAM_TRACKS.length,
    tracks: DEFAULT_STREAM_TRACKS,
  });
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Local table filter (filter results in-memory by artist or title)
  const [localFilter, setLocalFilter] = useState("");

  // Selection for batch operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Download options (Soundix engine)
  const [format, setFormat] = useState<string>("mp3");
  const [bitrate, setBitrate] = useState<string>("320k");
  const [sampleRate, setSampleRate] = useState<number>(44100);
  const [namingPattern, setNamingPattern] = useState<string>("artist_year_album_track_title");
  const [embedId3, setEmbedId3] = useState(true);
  const [outputFolder, setOutputFolder] = useState("/home/neokamen/Descargas");
  const [showOptions, setShowOptions] = useState(false);
  const [downloadDialogTracks, setDownloadDialogTracks] = useState<NeoTrack[] | null>(null);
  const [downloadDraft, setDownloadDraft] = useState({ title: "", artist: "", album: "", coverUrl: "" });

  // Download tracking
  const [progress, setProgress] = useState<Record<string, TrackProgress>>({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccessMsg, setDownloadSuccessMsg] = useState<string | null>(null);
  const [pendingPlayId, setPendingPlayId] = useState<string | null>(null);
  const [queueHint, setQueueHint] = useState<string | null>(null);

  // Listen to Soundix download-track-progress events
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<TrackProgress>("download-track-progress", (event) => {
      const p = event.payload;
      setProgress((prev) => ({ ...prev, [p.trackId]: p }));
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const hasAutoLoadedRef = useRef(false);

  const executeSearch = useCallback(async (
    searchTerm: string,
    category: SearchFilterCategory = "all",
    isBackgroundInitial = false
  ) => {
    const q = (searchTerm.trim() || "Top Hits").trim();

    setIsSearching(true);
    setSearchError(null);
    if (!isBackgroundInitial) {
      setSelectedIds(new Set());
    }
    setProgress({});
    setDownloadSuccessMsg(null);

    // Apply smart query modifier if not a direct URL
    let finalQuery = q;
    const isDirectUrl = q.startsWith("http://") || q.startsWith("https://");
    if (!isDirectUrl) {
      if (category === "artists") {
        finalQuery = `${q} artist`;
      } else if (category === "albums") {
        finalQuery = `${q} album`;
      } else if (category === "songs") {
        finalQuery = `${q} song`;
      }
    }

    try {
      const res = await invoke<AnalyzeResult>("analyze_source_link", {
        urlOrQuery: finalQuery,
        limit: 25,
      });
      if (res && res.tracks && res.tracks.length > 0) {
        setResult(res);
        setSelectedIds(new Set());
      }
    } catch (err: any) {
      console.warn("Stream search error:", err);
      if (!isBackgroundInitial) {
        setSearchError(String(err));
      }
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!isVisible || hasAutoLoadedRef.current) return;
    hasAutoLoadedRef.current = true;
    void executeSearch("Top Hits 2026", "songs", true);
  }, [isVisible, executeSearch]);

  const rawTracks = result?.tracks ?? [];
  const filteredTracks = useMemo(() => {
    if (!localFilter.trim()) return rawTracks;
    const lower = localFilter.toLowerCase().trim();
    return rawTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(lower) ||
        t.artist.toLowerCase().includes(lower) ||
        t.album.toLowerCase().includes(lower)
    );
  }, [rawTracks, localFilter]);

  const handleModalClose = () => {
    onClose();
    if (!embedded) setStreamMusicOpen(false);
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const term = query.trim() || "Top Hits";
    if (!query.trim()) setQuery("Top Hits");
    executeSearch(term, searchFilter, false);
  };

  const handleFilterCategoryChange = (cat: SearchFilterCategory) => {
    setSearchFilter(cat);
    const term = query.trim() || "Top Hits";
    executeSearch(term, cat, false);
  };

  // Quick filter clicks from the table: search all tracks from artist / album
  const handleQuickArtistSearch = (artistName: string) => {
    setQuery(artistName);
    setSearchFilter("artists");
    executeSearch(artistName, "artists");
  };

  const handleQuickAlbumSearch = (albumName: string) => {
    setQuery(albumName);
    setSearchFilter("albums");
    executeSearch(albumName, "albums");
  };

  const handlePlayNow = async (track: NeoTrack) => {
    const mxTrack = streamTrackFromNeo(track);
    if (currentTrack?.filepath === mxTrack.filepath) {
      await togglePlayPause();
      return;
    }
    setPendingPlayId(track.id);
    setSearchError(null);
    try {
      await play(mxTrack);
    } catch (err: unknown) {
      setSearchError(`Error al iniciar stream: ${String(err)}`);
    } finally {
      setPendingPlayId(null);
    }
  };

  const handleAddToQueue = (track: NeoTrack) => {
    addToQueue(streamTrackFromNeo(track));
    setQueueHint(`Añadida a la cola: ${track.title}`);
    window.setTimeout(() => setQueueHint(null), 2200);
  };

  const handleAddSelectedToQueue = () => {
    const selected = filteredTracks.filter((t) => selectedIds.has(t.id)).map(streamTrackFromNeo);
    if (selected.length === 0) return;
    addToQueue(selected);
    setQueueHint(`${selected.length} canciones añadidas a la cola de MusicX`);
    window.setTimeout(() => setQueueHint(null), 2200);
  };

  const formatSeconds = (sec: number) => {
    if (!sec || isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── Download Handlers (Soundix Integration) ────────────────────────────────

  const handlePickFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false, title: "Carpeta de destino" });
      if (typeof dir === "string") setOutputFolder(dir);
    } catch {
      // Fallback
    }
  };

  const openDownloadDialog = (tracks: NeoTrack[]) => {
    if (tracks.length === 0) return;
    const first = tracks[0];
    setDownloadDraft({
      title: first.title,
      artist: first.artist,
      album: first.album,
      coverUrl: first.coverUrl || "",
    });
    setDownloadDialogTracks(tracks);
    setShowOptions(false);
  };

  // Single track direct download opens the compact Soundix-style editor first.
  const handleDownloadSingleTrack = (track: NeoTrack) => {
    openDownloadDialog([track]);
  };

  const performDownload = async (tracks: NeoTrack[]) => {
    if (tracks.length === 0) return;
    setIsDownloading(true);
    setDownloadSuccessMsg(null);

    const finalTracks = tracks.map((track, index) => index === 0
      ? { ...track, title: downloadDraft.title || track.title, artist: downloadDraft.artist || track.artist, album: downloadDraft.album || track.album, coverUrl: downloadDraft.coverUrl || track.coverUrl }
      : track
    );

    const initProg: Record<string, TrackProgress> = {};
    const trackCovers: Record<string, string> = {};
    finalTracks.forEach((t) => {
      initProg[t.id] = { trackId: t.id, phase: "queued", percent: 0, message: "En cola..." };
      if (t.coverUrl) trackCovers[t.id] = t.coverUrl;
    });
    setProgress((prev) => ({ ...prev, ...initProg }));

    try {
      await invoke("download_track_batch", {
        tracks: finalTracks,
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
          trackCovers,
        },
      });
      setDownloadSuccessMsg(`✓ ${finalTracks.length === 1 ? `"${finalTracks[0].title}"` : `${finalTracks.length} pistas`} guardadas en ${outputFolder}`);
      setDownloadDialogTracks(null);
    } catch (err: any) {
      setSearchError(`Error en descarga: ${String(err)}`);
    } finally {
      setIsDownloading(false);
    }
  };

  // Batch download of selected tracks opens the compact offline editor.
  const handleDownloadSelected = async () => {
    const toDownload = filteredTracks.filter((t) => selectedIds.has(t.id));
    openDownloadDialog(toDownload);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredTracks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTracks.map((t) => t.id)));
    }
  };

  const phaseColor = (phase: TrackProgress["phase"]) => {
    switch (phase) {
      case "done":
        return "#22c55e";
      case "error":
        return "#ef4444";
      case "converting":
      case "tagging":
        return "#f59e0b";
      case "downloading":
        return accent;
      default:
        return "#64748b";
    }
  };

  if (!isVisible) return null;

  const heroTrack = filteredTracks[0] || rawTracks[0];
  const shelfTracks = filteredTracks.slice(0, 8);
  const listTracks = filteredTracks.slice(0, 40);
  const selectedCount = selectedIds.size;
  const streamStatusLabel = currentTrack && isStreamTrack(currentTrack)
    ? `${isPlaying ? "Sonando" : "Pausado"}: ${currentTrack.title}`
    : "Listo para mezclar streaming con tu biblioteca local";

  return (
    <div className={embedded ? "h-full min-h-0 w-full bg-transparent" : "fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-xl animate-fade-in"} onClick={embedded ? undefined : handleModalClose}>
      <div
        className={embedded ? "relative flex h-full w-full overflow-hidden rounded-none border-0 shadow-none" : "relative flex h-[88vh] w-[94vw] max-w-6xl overflow-hidden rounded-[28px] border shadow-2xl"}
        style={{
          background: `radial-gradient(circle at 18% 0%, ${accent}24 0, transparent 34%), linear-gradient(145deg, var(--app-bg, rgba(8,13,24,0.98)), var(--app-surface, rgba(2,6,14,0.98)))`,
          borderColor: `${accent}35`,
          boxShadow: `0 24px 70px rgba(0,0,0,0.78), 0 0 45px ${accent}18`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="hidden w-56 shrink-0 flex-col border-r border-white/10 bg-black/20 p-4 lg:flex">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl" style={{ backgroundColor: `${accent}24`, color: accent }}><Globe size={20} /></div>
            <div><div className="text-sm font-black tracking-tight text-white">Stream Music</div><div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">MusicX Online</div></div>
          </div>
          <div className="space-y-1.5 text-sm">
            {([{ id: "all", label: "Descubrir" }, { id: "songs", label: "Canciones" }, { id: "artists", label: "Artistas" }, { id: "albums", label: "Álbumes" }] as const).map((cat) => (
              <button key={cat.id} type="button" onClick={() => handleFilterCategoryChange(cat.id)} className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left transition hover:bg-white/8" style={{ backgroundColor: searchFilter === cat.id ? `${accent}20` : "transparent", color: searchFilter === cat.id ? "#fff" : "#94a3b8" }}>
                <span>{cat.label}</span>{searchFilter === cat.id && <span className="size-1.5 rounded-full" style={{ backgroundColor: accent }} />}
              </button>
            ))}
          </div>
          <div className="mt-auto rounded-3xl border border-white/10 bg-white/[0.035] p-3 text-xs text-slate-400">
            <div className="mb-1 font-semibold text-white">Integrado con MusicX</div>
            <p>Play, cola mixta, EQ Pro, volumen e In Play usan el reproductor principal.</p>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-5 py-4">
            <form onSubmit={handleSearchSubmit} className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar música, artistas, álbumes o pegar enlace..." className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.055] pl-11 pr-12 text-sm text-white outline-none placeholder:text-slate-500 focus:border-white/25" autoFocus />
              {query && <button type="button" onClick={() => setQuery("")} className="absolute right-12 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"><X size={14} /></button>}
              <button type="submit" disabled={isSearching || !query.trim()} className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-xl text-white transition disabled:opacity-40" style={{ backgroundColor: accent }} title="Buscar">
                {isSearching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
              </button>
            </form>
            <button type="button" onClick={() => setShowOptions((v) => !v)} className="hidden items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 sm:flex" title="Guardar música offline"><Download size={14} style={{ color: accent }} /> Guardar offline</button>
            {embedded && onBackToLibrary ? <button onClick={onBackToLibrary} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="Volver a la biblioteca" title="Volver a la biblioteca"><ArrowLeft size={16} /></button> : <button onClick={handleModalClose} className="rounded-2xl p-2 text-slate-400 transition hover:bg-white/10 hover:text-white" title="Cerrar Stream Music"><X size={18} /></button>}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {(searchError || downloadSuccessMsg || queueHint) && (
              <div className="mb-4 space-y-2">
                {searchError && <div className="flex items-center gap-2 rounded-2xl border border-rose-500/40 bg-rose-950/50 p-3 text-xs text-rose-200"><AlertCircle size={15} /><span className="flex-1">{searchError}</span><button onClick={() => setSearchError(null)}><X size={13} /></button></div>}
                {downloadSuccessMsg && <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs text-emerald-200"><CheckCircle size={15} /><span className="flex-1">{downloadSuccessMsg}</span><button onClick={() => setDownloadSuccessMsg(null)}><X size={13} /></button></div>}
                {queueHint && <div className="flex items-center gap-2 rounded-2xl border bg-white/[0.045] p-3 text-xs text-slate-200" style={{ borderColor: `${accent}40` }}><ListMusic size={15} style={{ color: accent }} /><span>{queueHint}</span></div>}
              </div>
            )}

            <section className="mb-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="relative min-h-[238px] overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.045] p-5">
                {heroTrack?.coverUrl && <img src={heroTrack.coverUrl} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl" />}
                <div className="relative z-10 flex h-full flex-col justify-between gap-5">
                  <div><div className="mb-2 text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: accent }}>Sonora style streaming</div><h2 className="max-w-xl text-3xl font-black leading-tight text-white">{heroTrack ? heroTrack.title : "Tu nueva puerta de entrada a música online"}</h2><p className="mt-2 max-w-xl text-sm text-slate-300">{heroTrack ? `${heroTrack.artist} · ${heroTrack.album || "Stream Music"}` : "Busca, escucha y añade a cola sin salir del reproductor principal de MusicX."}</p></div>
                  <div className="flex flex-wrap items-center gap-2">
                    {heroTrack && <button type="button" onClick={() => void handlePlayNow(heroTrack)} className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-black text-black shadow-lg transition hover:scale-[1.02]" style={{ backgroundColor: accent }}>{pendingPlayId === heroTrack.id ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />} Reproducir</button>}
                    {heroTrack && <button type="button" onClick={() => handleAddToQueue(heroTrack)} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"><ListPlus size={16} /> Añadir a cola</button>}
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">{streamStatusLabel}</span>
                  </div>
                </div>
              </div>
              <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-4">
                <div className="mb-3 flex items-center justify-between"><div><div className="text-sm font-bold text-white">Explorar rápido</div><div className="text-xs text-slate-500">Géneros y estados de ánimo</div></div>{isSearching && <Loader2 size={16} className="animate-spin" style={{ color: accent }} />}</div>
                <div className="grid grid-cols-2 gap-2">
                  {[{ label: "Top Hits", q: "Top Hits 2026" }, { label: "Rock clásico", q: "Classic Rock Hits" }, { label: "Lo-Fi", q: "Lofi hip hop beats" }, { label: "Electrónica", q: "Electronic dance music" }, { label: "Jazz & Soul", q: "Smooth Jazz Relax" }, { label: "Pop", q: "Pop Music Hits" }].map((g) => <button key={g.label} type="button" onClick={() => { setQuery(g.q); executeSearch(g.q, "songs"); }} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-left text-xs font-semibold text-slate-200 transition hover:bg-white/10">{g.label}</button>)}
                </div>
              </div>
            </section>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="text-lg font-black text-white">{result?.name || "Stream Music"}</h3><p className="text-xs text-slate-500">{filteredTracks.length} resultados · doble clic para reproducir</p></div>
              <div className="flex items-center gap-2">
                {rawTracks.length > 0 && <input type="text" value={localFilter} onChange={(e) => setLocalFilter(e.target.value)} placeholder="Filtrar resultados..." className="w-44 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs text-white outline-none placeholder:text-slate-500" />}
                <button type="button" onClick={handleAddSelectedToQueue} disabled={selectedCount === 0} className="rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-40"><ListPlus size={13} className="mr-1 inline" /> Cola ({selectedCount})</button>
              </div>
            </div>

            {isSearching && filteredTracks.length === 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <div key={i} className="h-52 animate-pulse rounded-3xl border border-white/10 bg-white/[0.035]" />)}</div>
            ) : filteredTracks.length === 0 ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center rounded-[30px] border border-white/10 bg-white/[0.03] text-center text-slate-400"><Music size={34} style={{ color: accent }} /><p className="mt-3 text-sm font-bold text-white">Busca algo para empezar</p><p className="mt-1 max-w-md text-xs">Stream Music está pensado para escuchar primero. La descarga está disponible, pero ya no manda en la pantalla.</p></div>
            ) : (
              <>
                <div className="mb-6 flex gap-3 overflow-x-auto pb-2">
                  {shelfTracks.map((track) => {
                    const mxPath = streamFilepath(track.id);
                    const isCurrent = currentTrack?.filepath === mxPath && isStreamTrack(currentTrack);
                    const isCurrentPlaying = isCurrent && isPlaying;
                    const isCurrentLoading = pendingPlayId === track.id;
                    return <article key={track.id} className="group w-40 shrink-0"><button type="button" onClick={() => void handlePlayNow(track)} className="relative mb-2 block size-40 overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-xl">{track.coverUrl ? <img src={track.coverUrl} alt={track.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : <div className="flex h-full w-full items-center justify-center"><Music size={26} /></div>}<span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/35" /><span className="absolute bottom-3 right-3 flex size-10 items-center justify-center rounded-full text-black opacity-0 shadow-lg transition group-hover:opacity-100" style={{ backgroundColor: accent }}>{isCurrentLoading ? <Loader2 size={17} className="animate-spin" /> : isCurrentPlaying ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}</span></button><div className="truncate text-sm font-bold text-white" title={track.title}>{track.title}</div><div className="truncate text-xs text-slate-500" title={track.artist}>{track.artist}</div></article>;
                  })}
                </div>

                <div className="overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.025]">
                  {listTracks.map((track, index) => {
                    const isSelected = selectedIds.has(track.id);
                    const mxPath = streamFilepath(track.id);
                    const isCurrent = currentTrack?.filepath === mxPath && isStreamTrack(currentTrack);
                    const isCurrentPlaying = isCurrent && isPlaying;
                    const isCurrentLoading = pendingPlayId === track.id;
                    const prog = progress[track.id];
                    return (
                      <div key={track.id} onDoubleClick={() => void handlePlayNow(track)} className="group grid grid-cols-[34px_48px_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/[0.06] px-3 py-2.5 last:border-b-0 hover:bg-white/[0.045]" style={{ borderLeft: isCurrent ? `3px solid ${accent}` : "3px solid transparent" }}>
                        <button type="button" onClick={() => toggleSelect(track.id)} className="text-xs text-slate-500 hover:text-white" title="Seleccionar para guardar offline">{isSelected ? <CheckSquare size={14} style={{ color: accent }} /> : <span>{index + 1}</span>}</button>
                        <button type="button" onClick={() => void handlePlayNow(track)} className="relative size-11 overflow-hidden rounded-xl bg-slate-900">{track.coverUrl ? <img src={track.coverUrl} alt={track.title} className="h-full w-full object-cover" /> : <Music size={16} />}<span className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition group-hover:opacity-100">{isCurrentLoading ? <Loader2 size={15} className="animate-spin" /> : isCurrentPlaying ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}</span></button>
                        <div className="min-w-0"><div className="truncate text-sm font-semibold" style={{ color: isCurrent ? accent : "#f8fafc" }}>{track.title}</div><div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-slate-500"><button type="button" onClick={() => handleQuickArtistSearch(track.artist)} className="truncate hover:text-white">{track.artist || "Desconocido"}</button><span>·</span><button type="button" onClick={() => handleQuickAlbumSearch(track.album)} className="truncate hover:text-white">{track.album || "Stream"}</button></div></div>
                        <div className="flex items-center gap-1.5"><span className="hidden w-12 text-right font-mono text-xs text-slate-500 sm:block">{track.durationString || formatSeconds(track.duration)}</span><button type="button" onClick={() => handleAddToQueue(track)} className="rounded-xl border border-white/10 bg-white/[0.045] p-2 text-slate-300 opacity-0 transition hover:text-white group-hover:opacity-100" title="Añadir a cola"><ListPlus size={14} /></button><button type="button" onClick={() => handleDownloadSingleTrack(track)} disabled={isDownloading && prog?.phase === "downloading"} className="rounded-xl border border-white/10 bg-white/[0.035] p-2 text-slate-500 opacity-0 transition hover:text-white disabled:opacity-30 group-hover:opacity-100" title="Guardar offline" style={{ color: prog ? phaseColor(prog.phase) : undefined }}>{prog && prog.phase !== "done" && prog.phase !== "error" ? <Loader2 size={14} className="animate-spin" /> : prog?.phase === "done" ? <Check size={14} /> : <Download size={14} />}</button></div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {showOptions && filteredTracks.length > 0 && (
            <footer className="shrink-0 border-t border-white/10 bg-black/35 px-5 py-3">
              <div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-sm font-bold text-white">Guardar offline</div><div className="text-xs text-slate-500">Secundario: reproduce primero, descarga cuando quieras conservar.</div></div><div className="flex items-center gap-2"><button type="button" onClick={toggleAll} className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:text-white">{selectedIds.size === filteredTracks.length ? "Deseleccionar" : "Seleccionar todo"}</button><button type="button" onClick={handleDownloadSelected} disabled={isDownloading || selectedCount === 0} className="rounded-xl px-4 py-1.5 text-xs font-black text-black disabled:opacity-40" style={{ backgroundColor: accent }}>{isDownloading ? "Descargando..." : `Descargar ${selectedCount}`}</button></div></div>
              <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4"><label className="flex flex-col gap-1"><span className="text-slate-500">Formato</span><select value={format} onChange={(e) => setFormat(e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-2 py-2 text-white" style={{ colorScheme: "dark" }}>{FORMATS.map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}</select></label><label className="flex flex-col gap-1"><span className="text-slate-500">Calidad</span><select value={bitrate} onChange={(e) => setBitrate(e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-2 py-2 text-white" style={{ colorScheme: "dark" }}>{BITRATES.map((b) => <option key={b} value={b}>{b === "lossless" ? "Sin pérdida" : b}</option>)}</select></label><label className="flex flex-col gap-1"><span className="text-slate-500">Sample rate</span><select value={sampleRate} onChange={(e) => setSampleRate(Number(e.target.value))} className="rounded-xl border border-white/10 bg-slate-950 px-2 py-2 text-white" style={{ colorScheme: "dark" }}>{SAMPLE_RATES.map((r) => <option key={r} value={r}>{r / 1000} kHz</option>)}</select></label><label className="flex flex-col gap-1"><span className="text-slate-500">Nombre</span><select value={namingPattern} onChange={(e) => setNamingPattern(e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-2 py-2 text-white" style={{ colorScheme: "dark" }}>{NAMING_PATTERNS.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}</select></label></div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3 text-xs text-slate-300"><button type="button" onClick={handlePickFolder} className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 hover:text-white"><FolderOpen size={14} style={{ color: accent }} /> <span className="truncate">{outputFolder}</span></button><button type="button" onClick={() => setEmbedId3((v) => !v)} className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 hover:text-white">{embedId3 ? <CheckSquare size={15} style={{ color: accent }} /> : <Square size={15} />} ID3 y carátula</button></div>
            </footer>
          )}


          {downloadDialogTracks && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 p-4 backdrop-blur-md" onClick={() => !isDownloading && setDownloadDialogTracks(null)}>
              <div className="w-full max-w-xl rounded-[26px] border border-white/10 bg-[var(--app-surface,#0b1220)] p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-white">Guardar offline · Soundix compacto</div>
                    <div className="text-xs text-slate-500">Ruta, carátula e ID3 antes de descargar</div>
                  </div>
                  <button type="button" onClick={() => setDownloadDialogTracks(null)} disabled={isDownloading} className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40"><X size={16} /></button>
                </div>

                <div className="grid gap-4 sm:grid-cols-[128px_1fr]">
                  <div className="space-y-2">
                    <div className="aspect-square overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
                      {downloadDraft.coverUrl ? <img src={downloadDraft.coverUrl} alt="Carátula" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-slate-600"><Music size={28} /></div>}
                    </div>
                    <input value={downloadDraft.coverUrl} onChange={(e) => setDownloadDraft((d) => ({ ...d, coverUrl: e.target.value }))} placeholder="URL carátula" className="w-full rounded-xl border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-white outline-none" />
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="space-y-1"><span className="text-slate-500">Título</span><input value={downloadDraft.title} onChange={(e) => setDownloadDraft((d) => ({ ...d, title: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-white outline-none" /></label>
                      <label className="space-y-1"><span className="text-slate-500">Artista</span><input value={downloadDraft.artist} onChange={(e) => setDownloadDraft((d) => ({ ...d, artist: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-white outline-none" /></label>
                    </div>
                    <label className="block space-y-1"><span className="text-slate-500">Álbum</span><input value={downloadDraft.album} onChange={(e) => setDownloadDraft((d) => ({ ...d, album: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-white outline-none" /></label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1"><span className="text-slate-500">Formato</span><select value={format} onChange={(e) => setFormat(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-white" style={{ colorScheme: "dark" }}>{FORMATS.map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}</select></label>
                      <label className="space-y-1"><span className="text-slate-500">Calidad</span><select value={bitrate} onChange={(e) => setBitrate(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-white" style={{ colorScheme: "dark" }}>{BITRATES.map((b) => <option key={b} value={b}>{b === "lossless" ? "Sin pérdida" : b}</option>)}</select></label>
                    </div>
                    <button type="button" onClick={handlePickFolder} className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-left text-slate-300 hover:text-white"><FolderOpen size={14} style={{ color: accent }} /><span className="truncate">{outputFolder}</span></button>
                    <button type="button" onClick={() => setEmbedId3((v) => !v)} className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-slate-300 hover:text-white">{embedId3 ? <CheckSquare size={15} style={{ color: accent }} /> : <Square size={15} />} Incrustar ID3 y carátula</button>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                  <div className="text-xs text-slate-500">{downloadDialogTracks.length} pista(s) seleccionada(s)</div>
                  <button type="button" onClick={() => void performDownload(downloadDialogTracks)} disabled={isDownloading} className="rounded-xl px-5 py-2 text-sm font-black text-black disabled:opacity-50" style={{ backgroundColor: accent }}>
                    {isDownloading ? "Descargando..." : "Descargar"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default StreamMusicModal;
