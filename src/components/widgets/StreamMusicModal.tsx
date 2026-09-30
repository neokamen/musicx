import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Globe, Search, Download, Play, Pause, Loader2, Music,
  CheckSquare, Square, FolderOpen, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle, X, SlidersHorizontal, Volume2,
  VolumeX, User, Disc, Filter, Check,
} from "lucide-react";
import { useMusicStore } from "../../store/index.ts";

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
  isOpen: boolean;
  onClose: () => void;
}

export const StreamMusicModal: React.FC<StreamMusicModalProps> = ({ isOpen, onClose }) => {
  const { appearance, isStreamMusicOpen, setStreamMusicOpen } = useMusicStore();
  const accent = appearance.accentColor || "#06b6d4";

  // Visual modal open state (synced with props and store)
  const isVisible = isOpen || isStreamMusicOpen;

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

  // Download tracking
  const [progress, setProgress] = useState<Record<string, TrackProgress>>({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccessMsg, setDownloadSuccessMsg] = useState<string | null>(null);

  // ── Streaming / Temporal Preview Audio Player ──
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [streamingTrack, setStreamingTrack] = useState<NeoTrack | null>(null);
  const [isStreamPlaying, setIsStreamPlaying] = useState(false);
  const [isLoadingStream, setIsLoadingStream] = useState(false);
  const [streamCurrentTime, setStreamCurrentTime] = useState(0);
  const [streamDuration, setStreamDuration] = useState(0);
  const [streamVolume, setStreamVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);

  // Initialize Audio Element for temporal stream preview
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audio.volume = streamVolume;
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setStreamCurrentTime(audio.currentTime);
      if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
        setStreamDuration(audio.duration);
      }
    };

    const handleDurationChange = () => {
      if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
        setStreamDuration(audio.duration);
      }
    };

    const handlePlay = () => setIsStreamPlaying(true);
    const handlePause = () => setIsStreamPlaying(false);
    const handleEnded = () => {
      setIsStreamPlaying(false);
      setStreamCurrentTime(0);
    };
    const handleError = () => {
      setIsStreamPlaying(false);
      setIsLoadingStream(false);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.pause();
      audio.src = "";
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  // Sync volume with audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : streamVolume;
    }
  }, [streamVolume, isMuted]);

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
        setSelectedIds(new Set(res.tracks.map((t) => t.id)));
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
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsStreamPlaying(false);
    onClose();
    setStreamMusicOpen(false);
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

  // ── Streaming / Temporal Preview Playback ──────────────────────────────────

  const handleStreamToggle = async (track: NeoTrack) => {
    if (!audioRef.current) return;

    // If clicking on the currently loaded track: toggle pause/play
    if (streamingTrack?.id === track.id) {
      if (isStreamPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(() => {});
      }
      return;
    }

    // New track: resolve direct streaming URL and play instantly
    setIsLoadingStream(true);
    setStreamingTrack(track);
    setStreamCurrentTime(0);
    setStreamDuration(track.duration || 0);

    try {
      const streamUrl = await invoke<string>("get_stream_audio_url", {
        urlOrId: track.sourceUrl || track.id,
      });

      audioRef.current.src = streamUrl;
      await audioRef.current.play();
      setIsStreamPlaying(true);
    } catch (err: any) {
      setSearchError(`Error al iniciar stream: ${String(err)}`);
      setIsStreamPlaying(false);
      setStreamingTrack(null);
    } finally {
      setIsLoadingStream(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setStreamCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
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

  // Single track direct download
  const handleDownloadSingleTrack = async (track: NeoTrack) => {
    setIsDownloading(true);
    setDownloadSuccessMsg(null);
    setProgress((prev) => ({
      ...prev,
      [track.id]: { trackId: track.id, phase: "queued", percent: 0, message: "En cola..." },
    }));

    try {
      await invoke("download_track_batch", {
        tracks: [track],
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
          trackCovers: track.coverUrl ? { [track.id]: track.coverUrl } : {},
        },
      });
      setDownloadSuccessMsg(`✓ "${track.title}" descargada con éxito en ${outputFolder}`);
    } catch (err: any) {
      setSearchError(`Error en descarga: ${String(err)}`);
    } finally {
      setIsDownloading(false);
    }
  };

  // Batch download of all selected tracks
  const handleDownloadSelected = async () => {
    const toDownload = filteredTracks.filter((t) => selectedIds.has(t.id));
    if (toDownload.length === 0) return;

    setIsDownloading(true);
    setDownloadSuccessMsg(null);

    const initProg: Record<string, TrackProgress> = {};
    const trackCovers: Record<string, string> = {};
    toDownload.forEach((t) => {
      initProg[t.id] = { trackId: t.id, phase: "queued", percent: 0, message: "En cola..." };
      if (t.coverUrl) trackCovers[t.id] = t.coverUrl;
    });
    setProgress((prev) => ({ ...prev, ...initProg }));

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
          trackCovers,
        },
      });
      setDownloadSuccessMsg(`✓ ${toDownload.length} canciones descargadas con éxito en ${outputFolder}`);
    } catch (err: any) {
      setSearchError(`Error en descarga en lote: ${String(err)}`);
    } finally {
      setIsDownloading(false);
    }
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={handleModalClose}
    >
      <div
        className="relative flex flex-col w-[92vw] max-w-4xl h-[86vh] rounded-2xl overflow-hidden shadow-2xl border"
        style={{
          backgroundColor: "var(--app-surface, #090d16)",
          borderColor: `${accent}35`,
          boxShadow: `0 20px 50px rgba(0,0,0,0.8), 0 0 30px ${accent}15`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Top Header ─────────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-3 px-5 py-3 border-b shrink-0 bg-slate-900/60"
          style={{ borderColor: `${accent}25` }}
        >
          <div
            className="flex items-center justify-center size-8 rounded-lg shadow-sm"
            style={{ backgroundColor: `${accent}20`, color: accent }}
          >
            <Globe size={18} />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-white tracking-wide">Stream Music</span>
              <span
                className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border font-semibold"
                style={{
                  color: accent,
                  borderColor: `${accent}40`,
                  backgroundColor: `${accent}10`,
                }}
              >
                Hi-Fi Stream & Downloader
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Escucha en stream temporal directo o descarga con metadatos ID3 y carátulas integradas
            </p>
          </div>

          <div className="flex-1" />

          <button
            onClick={handleModalClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
            title="Cerrar Stream Music"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Search Bar & Filter Chips ────────────────────────────────────── */}
        <div className="px-5 pt-3.5 pb-2.5 shrink-0 bg-slate-950/40 border-b border-slate-800/60">
          <form onSubmit={handleSearchSubmit} className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar canciones, artistas, álbumes o pegar enlace de YouTube / Spotify..."
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-sm text-white placeholder:text-slate-500 focus:outline-none transition shadow-inner font-sans"
                  style={{ borderColor: query ? `${accent}70` : undefined }}
                  autoFocus
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={isSearching || !query.trim()}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 cursor-pointer disabled:opacity-40 transition shrink-0 shadow-md"
                style={{
                  backgroundColor: accent,
                  boxShadow: `0 0 15px ${accent}30`,
                }}
              >
                {isSearching ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> Buscando...
                  </>
                ) : (
                  <>
                    <Search size={15} /> Buscar
                  </>
                )}
              </button>
            </div>

            {/* Filter Category Chips (Filosofía cliente de streaming Sonora / YT Music) */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-400 flex items-center gap-1 mr-1">
                  <Filter size={12} /> Filtrar por:
                </span>

                {(
                  [
                    { id: "all", label: "Todo" },
                    { id: "songs", label: "Canciones" },
                    { id: "artists", label: "Artistas" },
                    { id: "albums", label: "Álbumes" },
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleFilterCategoryChange(cat.id)}
                    className="px-3 py-1 rounded-lg border text-[11px] font-medium transition cursor-pointer"
                    style={{
                      backgroundColor: searchFilter === cat.id ? `${accent}25` : "rgba(30, 41, 59, 0.4)",
                      borderColor: searchFilter === cat.id ? accent : "rgba(51, 65, 85, 0.6)",
                      color: searchFilter === cat.id ? "#ffffff" : "#94a3b8",
                    }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* In-memory quick filter when tracks exist */}
              {rawTracks.length > 0 && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={localFilter}
                    onChange={(e) => setLocalFilter(e.target.value)}
                    placeholder="Filtrar lista..."
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-[11px] text-white placeholder:text-slate-500 focus:outline-none w-36"
                  />
                  {localFilter && (
                    <button
                      onClick={() => setLocalFilter("")}
                      className="text-slate-400 hover:text-white text-[10px]"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              )}
            </div>
          </form>
        </div>

        {/* ── Status Banners ──────────────────────────────────────────────── */}
        {searchError && (
          <div className="mx-5 my-2 flex items-center gap-2.5 p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 shrink-0">
            <AlertCircle size={15} className="shrink-0" />
            <span className="flex-1">{searchError}</span>
            <button onClick={() => setSearchError(null)} className="text-rose-400 hover:text-white">
              <X size={13} />
            </button>
          </div>
        )}

        {downloadSuccessMsg && (
          <div className="mx-5 my-2 flex items-center gap-2.5 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-200 shrink-0 animate-fade-in">
            <CheckCircle size={15} className="shrink-0 text-emerald-400" />
            <span className="flex-1">{downloadSuccessMsg}</span>
            <button onClick={() => setDownloadSuccessMsg(null)} className="text-emerald-400 hover:text-white">
              <X size={13} />
            </button>
          </div>
        )}

        {/* ── Main Library / Virtual Track List View ──────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Table Header */}
          <div className="h-8 bg-slate-950/80 border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center px-4 shrink-0">
            <div className="w-8 flex items-center justify-center">
              <button
                type="button"
                onClick={toggleAll}
                className="cursor-pointer text-slate-400 hover:text-white"
                title="Seleccionar todas"
              >
                {selectedIds.size > 0 && selectedIds.size === filteredTracks.length ? (
                  <CheckSquare size={13} style={{ color: accent }} />
                ) : (
                  <Square size={13} />
                )}
              </button>
            </div>
            <div className="w-12 text-center">Portada</div>
            <div className="flex-1 px-3">Título</div>
            <div className="w-48 px-2">Artista</div>
            <div className="w-44 px-2">Álbum</div>
            <div className="w-16 text-right pr-2">Duración</div>
            <div className="w-24 text-center">Acciones</div>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-800/40">
            {/* Animated Skeleton Loader while searching if no tracks yet */}
            {isSearching && filteredTracks.length === 0 && (
              <div className="flex flex-col gap-2 p-4">
                <div className="flex items-center gap-2 mb-2 text-xs font-mono" style={{ color: accent }}>
                  <Loader2 size={16} className="animate-spin" />
                  <span className="font-semibold tracking-wide">Cargando catálogo de música en streaming...</span>
                </div>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-slate-900/40 border border-slate-800/40 animate-pulse"
                  >
                    <div className="w-8 h-4 bg-slate-800/80 rounded" />
                    <div className="size-10 bg-slate-800 rounded-md shrink-0" />
                    <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                      <div className="h-3 w-1/3 bg-slate-800 rounded" />
                      <div className="h-2.5 w-1/4 bg-slate-800/60 rounded" />
                    </div>
                    <div className="w-28 h-3 bg-slate-800/50 rounded hidden sm:block" />
                    <div className="w-12 h-3 bg-slate-800/50 rounded" />
                    <div className="w-16 h-7 bg-slate-800/60 rounded-lg shrink-0" />
                  </div>
                ))}
              </div>
            )}

            {/* Subtle banner if refreshing tracks in background */}
            {isSearching && filteredTracks.length > 0 && (
              <div
                className="flex items-center gap-2 px-4 py-1.5 text-[11px] font-mono border-b shrink-0"
                style={{
                  backgroundColor: `${accent}12`,
                  borderColor: `${accent}25`,
                  color: accent,
                }}
              >
                <Loader2 size={13} className="animate-spin" />
                <span>Actualizando catálogo en streaming...</span>
              </div>
            )}

            {/* Quick Explore Genres & Discovery when empty */}
            {filteredTracks.length === 0 && !isSearching && (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400 py-12 px-6">
                <div
                  className="size-12 rounded-2xl flex items-center justify-center shadow-lg"
                  style={{ backgroundColor: `${accent}15`, color: accent }}
                >
                  <Globe size={26} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-white tracking-wide">Explora música en streaming</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-md">
                    Selecciona un estilo musical para empezar a escuchar inmediatamente o busca cualquier artista.
                  </p>
                </div>

                {/* Genre chips */}
                <div className="flex flex-wrap items-center justify-center gap-2 max-w-lg mt-2">
                  {[
                    { label: "🔥 Top Hits Globales", q: "Top Hits 2026" },
                    { label: "🎸 Rock Clásico", q: "Classic Rock Hits" },
                    { label: "🎧 Lo-Fi Chill Beats", q: "Lofi hip hop beats" },
                    { label: "⚡ Electrónica / Dance", q: "Electronic dance music" },
                    { label: "🎷 Smooth Jazz & Soul", q: "Smooth Jazz Relax" },
                    { label: "🎹 Pop Éxitos", q: "Pop Music Hits" },
                    { label: "🎤 Hip-Hop / Urban", q: "Hip Hop Hits" },
                    { label: "🎻 Acústica & Relax", q: "Acoustic chill songs" },
                  ].map((g) => (
                    <button
                      key={g.label}
                      type="button"
                      onClick={() => {
                        setQuery(g.q);
                        executeSearch(g.q, "songs");
                      }}
                      className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900/70 hover:bg-slate-800 text-xs text-slate-300 hover:text-white transition cursor-pointer shadow-sm hover:border-slate-700"
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filteredTracks.map((track) => {
              const isSelected = selectedIds.has(track.id);
              const isCurrentPlaying = streamingTrack?.id === track.id && isStreamPlaying;
              const isCurrentLoading = streamingTrack?.id === track.id && isLoadingStream;
              const prog = progress[track.id];

              return (
                <div
                  key={track.id}
                  className={`flex items-center px-4 py-2 hover:bg-white/[0.03] transition-colors group ${
                    isCurrentPlaying ? "bg-white/[0.05]" : ""
                  }`}
                  style={{
                    borderLeft: isCurrentPlaying ? `3px solid ${accent}` : "3px solid transparent",
                  }}
                >
                  {/* Selection Checkbox */}
                  <div className="w-8 flex items-center justify-center shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleSelect(track.id)}
                      className="cursor-pointer"
                      style={{ color: isSelected ? accent : "#475569" }}
                    >
                      {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                    </button>
                  </div>

                  {/* Artwork / Thumbnail */}
                  <div className="w-12 flex justify-center shrink-0">
                    <div className="relative size-10 rounded-md overflow-hidden bg-slate-900 border border-slate-800 shadow-sm shrink-0">
                      {track.coverUrl ? (
                        <img
                          src={track.coverUrl}
                          alt={track.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="flex items-center justify-center w-full h-full text-slate-600">
                          <Music size={14} />
                        </div>
                      )}

                      {/* Play overlay button on artwork */}
                      <button
                        type="button"
                        onClick={() => handleStreamToggle(track)}
                        className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white"
                        title={isCurrentPlaying ? "Pausar stream" : "Escuchar stream"}
                      >
                        {isCurrentLoading ? (
                          <Loader2 size={16} className="animate-spin text-cyan-400" />
                        ) : isCurrentPlaying ? (
                          <Pause size={16} />
                        ) : (
                          <Play size={16} fill="currentColor" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Track Title */}
                  <div className="flex-1 px-3 min-w-0">
                    <div
                      className="text-xs font-semibold truncate"
                      style={{ color: isCurrentPlaying ? accent : "#f8fafc" }}
                      title={track.title}
                    >
                      {track.title}
                    </div>
                    {track.year && (
                      <span className="text-[10px] text-slate-500 font-mono">
                        Año: {track.year}
                      </span>
                    )}
                  </div>

                  {/* Artist with quick filter action */}
                  <div className="w-48 px-2 min-w-0 flex items-center justify-between group/artist">
                    <span className="text-xs text-slate-300 truncate" title={track.artist}>
                      {track.artist || "Desconocido"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQuickArtistSearch(track.artist)}
                      className="opacity-0 group-hover/artist:opacity-100 p-1 hover:text-cyan-400 text-slate-500 rounded transition cursor-pointer"
                      title={`Buscar más de ${track.artist}`}
                    >
                      <User size={12} />
                    </button>
                  </div>

                  {/* Album with quick filter action */}
                  <div className="w-44 px-2 min-w-0 flex items-center justify-between group/album">
                    <span className="text-xs text-slate-400 truncate" title={track.album}>
                      {track.album || "—"}
                    </span>
                    {track.album && track.album !== track.title && (
                      <button
                        type="button"
                        onClick={() => handleQuickAlbumSearch(track.album)}
                        className="opacity-0 group-hover/album:opacity-100 p-1 hover:text-cyan-400 text-slate-500 rounded transition cursor-pointer"
                        title={`Buscar álbum ${track.album}`}
                      >
                        <Disc size={12} />
                      </button>
                    )}
                  </div>

                  {/* Duration */}
                  <div className="w-16 text-right pr-2 text-xs font-mono text-slate-400 shrink-0">
                    {track.durationString || formatSeconds(track.duration)}
                  </div>

                  {/* Action buttons (Listen Stream & Download) */}
                  <div className="w-24 flex items-center justify-center gap-1.5 shrink-0">
                    {/* Play/Pause Stream Button */}
                    <button
                      type="button"
                      onClick={() => handleStreamToggle(track)}
                      disabled={isCurrentLoading}
                      className="p-1.5 rounded-lg border transition cursor-pointer text-white"
                      style={{
                        backgroundColor: isCurrentPlaying ? accent : `${accent}15`,
                        borderColor: isCurrentPlaying ? accent : `${accent}40`,
                      }}
                      title={isCurrentPlaying ? "Pausar escucha" : "Escuchar en streaming temporal"}
                    >
                      {isCurrentLoading ? (
                        <Loader2 size={13} className="animate-spin text-cyan-400" />
                      ) : isCurrentPlaying ? (
                        <Pause size={13} />
                      ) : (
                        <Play size={13} fill="currentColor" />
                      )}
                    </button>

                    {/* Direct Single Download Button */}
                    <button
                      type="button"
                      onClick={() => handleDownloadSingleTrack(track)}
                      disabled={isDownloading && prog?.phase === "downloading"}
                      className="p-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-500 transition cursor-pointer disabled:opacity-40"
                      style={{
                        borderColor: prog ? `${phaseColor(prog.phase)}60` : undefined,
                        color: prog ? phaseColor(prog.phase) : undefined,
                      }}
                      title="Descargar esta canción con carátula e ID3"
                    >
                      {prog && prog.phase !== "done" && prog.phase !== "error" ? (
                        <Loader2 size={13} className="animate-spin text-cyan-400" />
                      ) : prog?.phase === "done" ? (
                        <Check size={13} className="text-emerald-400" />
                      ) : (
                        <Download size={13} />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Persistent Streaming Dock (Escucha tipo temporal) ────────────── */}
        {streamingTrack && (
          <div
            className="shrink-0 border-t px-5 py-2.5 flex items-center gap-4 bg-slate-950/95 shadow-2xl relative z-10"
            style={{
              borderColor: `${accent}30`,
              boxShadow: `0 -5px 25px rgba(0,0,0,0.6)`,
            }}
          >
            {/* Stream Track Artwork */}
            <div className="relative size-11 rounded-lg overflow-hidden border border-slate-700 shrink-0 bg-slate-900">
              {streamingTrack.coverUrl ? (
                <img
                  src={streamingTrack.coverUrl}
                  alt={streamingTrack.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center w-full h-full text-slate-600">
                  <Music size={16} />
                </div>
              )}
            </div>

            {/* Stream Info */}
            <div className="w-52 min-w-0">
              <div className="text-xs font-bold text-white truncate leading-tight">
                {streamingTrack.title}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {streamingTrack.artist} {streamingTrack.album ? `• ${streamingTrack.album}` : ""}
              </div>
            </div>

            {/* Play / Pause button */}
            <button
              type="button"
              onClick={() => handleStreamToggle(streamingTrack)}
              disabled={isLoadingStream}
              className="size-9 rounded-full flex items-center justify-center text-white shrink-0 shadow-lg cursor-pointer transition"
              style={{ backgroundColor: accent }}
            >
              {isLoadingStream ? (
                <Loader2 size={16} className="animate-spin" />
              ) : isStreamPlaying ? (
                <Pause size={16} />
              ) : (
                <Play size={16} fill="currentColor" />
              )}
            </button>

            {/* Progress / Seek bar */}
            <div className="flex-1 flex items-center gap-2.5 min-w-0">
              <span className="text-[10px] font-mono text-slate-400 w-9 text-right shrink-0">
                {formatSeconds(streamCurrentTime)}
              </span>

              <input
                type="range"
                min={0}
                max={streamDuration || 100}
                step={0.5}
                value={streamCurrentTime}
                onChange={handleSeek}
                className="flex-1 h-1.5 rounded-lg appearance-none bg-slate-800 accent-cyan-400 cursor-pointer"
                style={{ accentColor: accent }}
              />

              <span className="text-[10px] font-mono text-slate-400 w-9 shrink-0">
                {formatSeconds(streamDuration)}
              </span>
            </div>

            {/* Volume Control */}
            <div className="flex items-center gap-1.5 shrink-0 pl-2">
              <button
                type="button"
                onClick={() => setIsMuted((m) => !m)}
                className="text-slate-400 hover:text-white p-1"
                title={isMuted ? "Desmutear" : "Mutear"}
              >
                {isMuted || streamVolume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : streamVolume}
                onChange={(e) => {
                  setStreamVolume(parseFloat(e.target.value));
                  if (isMuted) setIsMuted(false);
                }}
                className="w-16 h-1 rounded-lg appearance-none bg-slate-800 accent-cyan-400 cursor-pointer"
                style={{ accentColor: accent }}
              />
            </div>

            {/* Quick Download this stream track button */}
            <button
              type="button"
              onClick={() => handleDownloadSingleTrack(streamingTrack)}
              className="px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer transition shadow-sm"
              style={{
                borderColor: `${accent}60`,
                backgroundColor: `${accent}15`,
                color: "#ffffff",
              }}
              title="Descargar esta canción que estás escuchando"
            >
              <Download size={13} style={{ color: accent }} />
              <span>Descargar</span>
            </button>
          </div>
        )}

        {/* ── Bottom Download Bar & Options Drawer ─────────────────────────── */}
        {filteredTracks.length > 0 && (
          <div
            className="shrink-0 border-t px-5 py-2.5 bg-slate-900/80"
            style={{ borderColor: `${accent}20` }}
          >
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowOptions((v) => !v)}
                className="flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-white cursor-pointer transition"
              >
                <SlidersHorizontal size={14} style={{ color: accent }} />
                <span>Opciones de descarga ({format.toUpperCase()} · {bitrate})</span>
                {showOptions ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded bg-slate-800 border border-slate-700 cursor-pointer"
                >
                  {selectedIds.size === filteredTracks.length ? "Deseleccionar" : "Seleccionar todo"}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadSelected}
                  disabled={isDownloading || selectedIds.size === 0}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-2 cursor-pointer disabled:opacity-40 transition shadow-md"
                  style={{ backgroundColor: accent }}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> Descargando...
                    </>
                  ) : (
                    <>
                      <Download size={13} /> Descargar seleccionadas ({selectedIds.size})
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Expandable Options Drawer */}
            {showOptions && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 pb-1 text-xs border-t border-slate-800/80 mt-2.5 animate-fade-in">
                <label className="flex flex-col gap-1">
                  <span className="text-slate-400 font-mono uppercase text-[10px]">Formato</span>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-white focus:outline-none"
                    style={{ colorScheme: "dark" }}
                  >
                    {FORMATS.map((f) => (
                      <option key={f} value={f}>
                        {f.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-slate-400 font-mono uppercase text-[10px]">Bitrate / Calidad</span>
                  <select
                    value={bitrate}
                    onChange={(e) => setBitrate(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-white focus:outline-none"
                    style={{ colorScheme: "dark" }}
                  >
                    {BITRATES.map((b) => (
                      <option key={b} value={b}>
                        {b === "lossless" ? "Sin pérdida (Lossless)" : b}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-slate-400 font-mono uppercase text-[10px]">Sample Rate</span>
                  <select
                    value={sampleRate}
                    onChange={(e) => setSampleRate(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-white focus:outline-none"
                    style={{ colorScheme: "dark" }}
                  >
                    {SAMPLE_RATES.map((r) => (
                      <option key={r} value={r}>
                        {r >= 1000 ? `${r / 1000} kHz` : r}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-slate-400 font-mono uppercase text-[10px]">Estructura de nombre</span>
                  <select
                    value={namingPattern}
                    onChange={(e) => setNamingPattern(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-white focus:outline-none"
                    style={{ colorScheme: "dark" }}
                  >
                    {NAMING_PATTERNS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Destination Directory & ID3 Toggle */}
                <div className="col-span-full flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800/60 mt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-[11px]">Guardar en:</span>
                    <button
                      type="button"
                      onClick={handlePickFolder}
                      className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 cursor-pointer transition"
                    >
                      <FolderOpen size={13} style={{ color: accent }} />
                      <span className="truncate max-w-[280px] font-mono">{outputFolder}</span>
                    </button>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300">
                    <button
                      type="button"
                      onClick={() => setEmbedId3((v) => !v)}
                      style={{ color: embedId3 ? accent : "#64748b" }}
                      className="cursor-pointer"
                    >
                      {embedId3 ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                    <span>Incrustar carátula y etiquetas ID3 completas</span>
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

export default StreamMusicModal;
