import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckSquare, ChevronDown, ChevronRight, FolderOpen, Loader2, Music, Search, Square, X } from "lucide-react";
import { useMusicStore } from "../../store/index.ts";
import type { Track } from "../../types/index.ts";
import { streamTrackToNeo } from "../../lib/streamTracks.ts";

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

const FORMATS = ["mp3", "flac", "wav", "m4a", "opus"] as const;
const LOSSLESS_FORMATS = new Set(["flac", "wav"]);
const LOSSY_BITRATES = ["320k", "256k", "192k", "128k"] as const;
const SAMPLE_RATES = [44100, 48000, 88200, 96000, 192000] as const;
const NAMING_PATTERNS = [
  { label: "Artista / Año – Álbum / Nº Título", value: "artist_year_album_track_title" },
  { label: "Artista / Álbum / Nº Título", value: "artist_album_track_title" },
  { label: "Artista – Título", value: "artist_title" },
  { label: "Título", value: "title" },
] as const;

const SOUNDIX_OPTIONS_KEY = "musicx_soundix_download_v1";

type SoundixSavedOptions = {
  format: string;
  bitrate: string;
  lastLossyBitrate: string;
  sampleRate: number;
  namingPattern: string;
  embedId3: boolean;
  outputFolder: string;
};

function isLosslessFormat(format: string): boolean {
  return LOSSLESS_FORMATS.has(format);
}

function qualityForFormat(format: string, lastLossyBitrate: string): string {
  return isLosslessFormat(format) ? "lossless" : lastLossyBitrate || "320k";
}

function buildStructurePreview(
  pattern: string,
  draft: { title: string; artist: string; album: string; year: string; trackNumber: string },
  format: string
) {
  const n = String(Number(draft.trackNumber) || 1).padStart(2, "0");
  const ext = format.toLowerCase();
  const year = draft.year || "0000";
  const file = `${n} ${draft.title || "Título"}.${ext}`;
  if (pattern === "artist_album_track_title") {
    return { parts: [draft.artist || "Artista", draft.album || "Álbum", file] };
  }
  if (pattern === "artist_title") {
    return { parts: [`${draft.artist || "Artista"} - ${draft.title || "Título"}.${ext}`] };
  }
  if (pattern === "title") {
    return { parts: [`${draft.title || "Título"}.${ext}`] };
  }
  return { parts: [draft.artist || "Artista", `${year} – ${draft.album || "Álbum"}`, file] };
}

type CoverHit = { url: string; title: string; artist: string };

function loadSavedOptions(fallbackFolder: string): SoundixSavedOptions {
  try {
    const raw = localStorage.getItem(SOUNDIX_OPTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SoundixSavedOptions>;
      const format = FORMATS.includes(parsed.format as (typeof FORMATS)[number]) ? parsed.format as string : "mp3";
      const lastLossy = LOSSY_BITRATES.includes(parsed.lastLossyBitrate as (typeof LOSSY_BITRATES)[number])
        ? parsed.lastLossyBitrate as string
        : LOSSY_BITRATES.includes(parsed.bitrate as (typeof LOSSY_BITRATES)[number])
          ? parsed.bitrate as string
          : "320k";
      return {
        format,
        bitrate: qualityForFormat(format, lastLossy),
        lastLossyBitrate: lastLossy,
        sampleRate: SAMPLE_RATES.includes(parsed.sampleRate as (typeof SAMPLE_RATES)[number]) ? parsed.sampleRate as number : 44100,
        namingPattern: NAMING_PATTERNS.some((item) => item.value === parsed.namingPattern)
          ? parsed.namingPattern as string
          : "artist_year_album_track_title",
        embedId3: parsed.embedId3 !== false,
        outputFolder: parsed.outputFolder || fallbackFolder,
      };
    }
  } catch {
    // ignore
  }
  return {
    format: "mp3",
    bitrate: "320k",
    lastLossyBitrate: "320k",
    sampleRate: 44100,
    namingPattern: "artist_year_album_track_title",
    embedId3: true,
    outputFolder: fallbackFolder,
  };
}

function formatSeconds(sec: number): string {
  if (!sec || isNaN(sec)) return "0:00";
  const mins = Math.floor(sec / 60);
  const remaining = Math.floor(sec % 60);
  return `${mins}:${remaining.toString().padStart(2, "0")}`;
}

export function trackToSoundixTrack(track: Track): NeoTrack {
  const neo = streamTrackToNeo(track);
  return {
    id: neo.id,
    title: neo.title,
    artist: neo.artist,
    album: neo.album,
    year: "",
    trackNumber: neo.trackNumber || 1,
    totalTracks: 1,
    duration: Math.round(neo.duration || 0),
    durationString: formatSeconds(neo.duration || 0),
    coverUrl: neo.coverUrl || "",
    sourceUrl: neo.sourceUrl,
  };
}

interface SoundixDownloadDialogProps {
  tracks: NeoTrack[];
  onClose: () => void;
  onComplete?: (message: string) => void;
  onError?: (message: string) => void;
}

export const SoundixDownloadDialog: React.FC<SoundixDownloadDialogProps> = ({
  tracks,
  onClose,
  onComplete,
  onError,
}) => {
  const { appearance, librarySettings } = useMusicStore();
  const accent = appearance.accentColor || "#06b6d4";
  const first = tracks[0];
  const saved = useMemo(
    () => loadSavedOptions(librarySettings.musicFolder || "/home/neokamen/Descargas"),
    [librarySettings.musicFolder]
  );

  const [format, setFormat] = useState(saved.format);
  const [bitrate, setBitrate] = useState(saved.bitrate);
  const [lastLossyBitrate, setLastLossyBitrate] = useState(saved.lastLossyBitrate);
  const [sampleRate, setSampleRate] = useState(saved.sampleRate);
  const [namingPattern, setNamingPattern] = useState(saved.namingPattern);
  const [embedId3, setEmbedId3] = useState(saved.embedId3);
  const [outputFolder, setOutputFolder] = useState(saved.outputFolder);
  const [isDownloading, setIsDownloading] = useState(false);
  const [structureOpen, setStructureOpen] = useState(false);
  const [showCoverSearch, setShowCoverSearch] = useState(false);
  const [coverQuery, setCoverQuery] = useState("");
  const [coverHits, setCoverHits] = useState<CoverHit[]>([]);
  const [coverLoading, setCoverLoading] = useState(false);
  const [draft, setDraft] = useState({
    title: first?.title || "",
    artist: first?.artist || "",
    album: first?.album || "",
    year: first?.year || "",
    trackNumber: String(first?.trackNumber || 1),
    coverUrl: first?.coverUrl || "",
  });

  const lossless = isLosslessFormat(format);
  const structure = buildStructurePreview(namingPattern, draft, format);
  const collapsedPath = structure.parts.join(" / ");

  useEffect(() => {
    localStorage.setItem(
      SOUNDIX_OPTIONS_KEY,
      JSON.stringify({
        format,
        bitrate,
        lastLossyBitrate,
        sampleRate,
        namingPattern,
        embedId3,
        outputFolder,
      } satisfies SoundixSavedOptions)
    );
  }, [format, bitrate, lastLossyBitrate, sampleRate, namingPattern, embedId3, outputFolder]);

  const handleFormatChange = (nextFormat: string) => {
    setFormat(nextFormat);
    if (isLosslessFormat(nextFormat)) {
      setBitrate("lossless");
      return;
    }
    setBitrate(lastLossyBitrate);
  };

  const handleBitrateChange = (nextBitrate: string) => {
    if (lossless) return;
    setBitrate(nextBitrate);
    setLastLossyBitrate(nextBitrate);
  };

  const handlePickFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false, title: "Carpeta de destino" });
      if (typeof dir === "string") setOutputFolder(dir);
    } catch {
      // ignore
    }
  };

  const searchCovers = async (query?: string) => {
    const q = (query ?? coverQuery || `${draft.artist} ${draft.album || draft.title}`).trim();
    if (!q) return;
    setCoverQuery(q);
    setCoverLoading(true);
    try {
      const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=album&limit=16`);
      const payload = await response.json() as {
        results?: { artworkUrl100?: string; collectionName?: string; artistName?: string }[];
      };
      setCoverHits(
        (payload.results || [])
          .map((item) => ({
            url: (item.artworkUrl100 || "").replace("100x100bb", "600x600bb").replace("100x100", "600x600"),
            title: item.collectionName || "",
            artist: item.artistName || "",
          }))
          .filter((item) => item.url)
      );
    } catch {
      setCoverHits([]);
    } finally {
      setCoverLoading(false);
    }
  };

  const qualityLabel = lossless
    ? format === "wav"
      ? "PCM sin pérdida"
      : "FLAC sin pérdida"
    : bitrate;

  const performDownload = async () => {
    if (tracks.length === 0 || isDownloading) return;
    setIsDownloading(true);
    const finalTracks = tracks.map((track, index) =>
      index === 0
        ? {
            ...track,
            title: draft.title || track.title,
            artist: draft.artist || track.artist,
            album: draft.album || track.album,
            year: draft.year || track.year,
            trackNumber: Number(draft.trackNumber) || track.trackNumber,
            coverUrl: draft.coverUrl || track.coverUrl,
          }
        : track
    );
    const trackCovers: Record<string, string> = {};
    finalTracks.forEach((track) => {
      if (track.coverUrl) trackCovers[track.id] = track.coverUrl;
    });

    try {
      await invoke("download_track_batch", {
        tracks: finalTracks,
        options: {
          format,
          bitrate: lossless ? "lossless" : bitrate,
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
      onComplete?.(
        `✓ ${finalTracks.length === 1 ? `"${finalTracks[0].title}"` : `${finalTracks.length} pistas`} guardadas en ${outputFolder}`
      );
      onClose();
    } catch (error) {
      onError?.(`Error en descarga: ${String(error)}`);
    } finally {
      setIsDownloading(false);
    }
  };

  if (!first) return null;

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 p-4 backdrop-blur-md"
      onClick={() => !isDownloading && onClose()}
    >
      <div
        className="relative w-full max-w-2xl rounded-[26px] border border-white/10 bg-[var(--app-surface,#0b1220)] p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black text-white">Guardar offline · Soundix</div>
            <div className="text-xs text-slate-500">Formato, calidad, carpeta e ID3 antes de descargar</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDownloading}
            className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-[132px_1fr]">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                setShowCoverSearch(true);
                if (coverHits.length === 0) void searchCovers();
              }}
              className="group relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-slate-950"
              title="Buscar carátula"
            >
              {draft.coverUrl ? (
                <img src={draft.coverUrl} alt="Carátula" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-600">
                  <Music size={28} />
                </div>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[11px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
                Buscar carátula
              </span>
            </button>
            <input
              value={draft.coverUrl}
              onChange={(event) => setDraft((current) => ({ ...current, coverUrl: event.target.value }))}
              placeholder="URL carátula"
              className="w-full rounded-xl border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-white outline-none"
            />
          </div>

          <div className="space-y-2 text-xs">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-slate-500">Título</span>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-white outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-500">Artista</span>
                <input
                  value={draft.artist}
                  onChange={(event) => setDraft((current) => ({ ...current, artist: event.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-white outline-none"
                />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_88px_72px]">
              <label className="space-y-1">
                <span className="text-slate-500">Álbum</span>
                <input
                  value={draft.album}
                  onChange={(event) => setDraft((current) => ({ ...current, album: event.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-white outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-500">Año</span>
                <input
                  value={draft.year}
                  onChange={(event) => setDraft((current) => ({ ...current, year: event.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-white outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-500">Nº</span>
                <input
                  value={draft.trackNumber}
                  onChange={(event) => setDraft((current) => ({ ...current, trackNumber: event.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-white outline-none"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <label className="space-y-1">
                <span className="text-slate-500">Formato</span>
                <select
                  value={format}
                  onChange={(event) => handleFormatChange(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-white"
                  style={{ colorScheme: "dark" }}
                >
                  {FORMATS.map((item) => (
                    <option key={item} value={item}>
                      {item.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-slate-500">Calidad</span>
                <select
                  value={lossless ? "lossless" : bitrate}
                  onChange={(event) => handleBitrateChange(event.target.value)}
                  disabled={lossless}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-white disabled:opacity-70"
                  style={{ colorScheme: "dark" }}
                >
                  {lossless ? (
                    <option value="lossless">{qualityLabel}</option>
                  ) : (
                    LOSSY_BITRATES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-slate-500">Sample rate</span>
                <select
                  value={sampleRate}
                  onChange={(event) => setSampleRate(Number(event.target.value))}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-white"
                  style={{ colorScheme: "dark" }}
                >
                  {SAMPLE_RATES.map((rate) => (
                    <option key={rate} value={rate}>
                      {rate / 1000} kHz
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-slate-500">Nombre</span>
                <select
                  value={namingPattern}
                  onChange={(event) => setNamingPattern(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-white"
                  style={{ colorScheme: "dark" }}
                >
                  {NAMING_PATTERNS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={() => setStructureOpen((open) => !open)}
              className="flex w-full items-start gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left text-slate-300 hover:bg-white/[0.04]"
            >
              {structureOpen ? <ChevronDown size={14} className="mt-0.5 shrink-0" /> : <ChevronRight size={14} className="mt-0.5 shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Estructura Soundix</div>
                {structureOpen ? (
                  <div className="mt-1 font-mono text-[11px] leading-5 text-slate-300">
                    {structure.parts.map((part, index) => (
                      <div key={`${part}-${index}`} style={{ paddingLeft: `${index * 12}px` }}>
                        {index < structure.parts.length - 1 ? "📁 " : "🎵 "}
                        {part}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="truncate font-mono text-[11px] text-slate-400" title={collapsedPath}>
                    {collapsedPath}
                  </div>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() => void handlePickFolder()}
              className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-left text-slate-300 hover:text-white"
            >
              <FolderOpen size={14} style={{ color: accent }} />
              <span className="truncate">{outputFolder}</span>
            </button>
            <button
              type="button"
              onClick={() => setEmbedId3((value) => !value)}
              className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-slate-300 hover:text-white"
            >
              {embedId3 ? <CheckSquare size={15} style={{ color: accent }} /> : <Square size={15} />}
              Incrustar ID3 y carátula
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
          <div className="min-w-0 text-xs text-slate-500">
            {tracks.length} pista{tracks.length === 1 ? "" : "s"} · {format.toUpperCase()} · {qualityLabel}
            {lossless ? ` · ${sampleRate / 1000} kHz` : ""}
          </div>
          <button
            type="button"
            onClick={() => void performDownload()}
            disabled={isDownloading}
            className="rounded-xl px-5 py-2 text-sm font-black text-black disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            {isDownloading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Descargando...
              </span>
            ) : (
              "Descargar"
            )}
          </button>
        </div>
        {showCoverSearch && (
          <div className="absolute inset-3 z-20 overflow-hidden rounded-[22px] border border-white/10 bg-[#0b1220] p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-black text-white">Buscador de carátulas</div>
                <div className="text-[11px] text-slate-500">Elige una portada para incrustar con ID3</div>
              </div>
              <button type="button" onClick={() => setShowCoverSearch(false)} className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <form
              className="mb-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void searchCovers(coverQuery);
              }}
            >
              <div className="relative min-w-0 flex-1">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={coverQuery}
                  onChange={(event) => setCoverQuery(event.target.value)}
                  placeholder={`${draft.artist} ${draft.album || draft.title}`}
                  className="h-10 w-full rounded-xl border border-white/10 bg-black/30 pl-9 pr-3 text-sm text-white outline-none"
                />
              </div>
              <button type="submit" className="rounded-xl px-3 text-sm font-bold text-black" style={{ backgroundColor: accent }}>
                {coverLoading ? <Loader2 size={14} className="animate-spin" /> : "Buscar"}
              </button>
            </form>
            <div className="grid max-h-[280px] grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
              {coverHits.map((hit) => (
                <button
                  key={hit.url}
                  type="button"
                  onClick={() => {
                    setDraft((current) => ({ ...current, coverUrl: hit.url }));
                    setShowCoverSearch(false);
                  }}
                  className="group overflow-hidden rounded-xl border border-white/10 bg-black/30 text-left hover:border-white/30"
                >
                  <img src={hit.url} alt={hit.title} className="aspect-square w-full object-cover transition group-hover:scale-105" />
                  <div className="truncate px-1.5 py-1 text-[9px] text-slate-400">{hit.title}</div>
                </button>
              ))}
              {!coverLoading && coverHits.length === 0 && (
                <div className="col-span-full py-8 text-center text-xs text-slate-500">Sin resultados. Prueba artista + álbum.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
