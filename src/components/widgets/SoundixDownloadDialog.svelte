<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import {
    CheckSquare,
    ChevronDown,
    ChevronRight,
    FolderOpen,
    Loader2,
    Music,
    Search,
    Square,
    X,
  } from "@lucide/svelte";
  import { useMusicStore } from "../../store/index.ts";
  import type { NeoTrack } from "../../types/stream.ts";

  interface Props {
    tracks: NeoTrack[];
    onClose: () => void;
    onComplete?: (message: string) => void;
    onError?: (message: string) => void;
  }

  let { tracks, onClose, onComplete, onError }: Props = $props();

  const FORMATS = ["mp3", "flac", "wav", "m4a", "opus"] as const;
  const LOSSLESS_FORMATS = new Set(["flac", "wav"]);
  const LOSSY_BITRATES = ["320k", "256k", "192k", "128k"] as const;
  const SAMPLE_RATES = [44100, 48000, 88200, 96000, 192000] as const;
  const TOKEN_CHIPS = [
    { id: "{artist}", label: "Artista" },
    { id: "{album}", label: "Álbum" },
    { id: "{title}", label: "Título" },
    { id: "{year}", label: "Año" },
    { id: "{trackNumber}", label: "Nº" },
  ] as const;

  const NAMING_PRESETS = [
    { label: "Artista / Año – Álbum / Nº Título", value: "{artist}/{year} - {album}/{trackNumber} - {title}" },
    { label: "Artista / Álbum / Nº Título", value: "{artist}/{album}/{trackNumber} - {title}" },
    { label: "Artista – Título", value: "{artist} - {title}" },
    { label: "Sólo título", value: "{title}" },
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

  function isLosslessFormat(f: string): boolean {
    return LOSSLESS_FORMATS.has(f);
  }

  function qualityForFormat(f: string, lastLossy: string): string {
    return isLosslessFormat(f) ? "lossless" : lastLossy || "320k";
  }

  function buildStructurePreview(
    template: string,
    d: { title: string; artist: string; album: string; year: string; trackNumber: string },
    f: string
  ): { parts: string[]; rendered: string } {
    const n = String(Number(d.trackNumber) || 1).padStart(2, "0");
    let rendered = (template || "{artist}/{year} - {album}/{trackNumber} - {title}")
      .replaceAll("{artist}", d.artist || "Artista")
      .replaceAll("{album}", d.album || "Álbum")
      .replaceAll("{title}", d.title || "Título")
      .replaceAll("{year}", d.year || "0000")
      .replaceAll("{trackNumber}", n);
    const ext = `.${f.toLowerCase()}`;
    if (!rendered.toLowerCase().endsWith(ext)) rendered += ext;
    return { parts: rendered.split("/").filter(Boolean), rendered };
  }

  type CoverHit = { url: string; title: string; artist: string };

  function loadSavedOptions(fallbackFolder: string): SoundixSavedOptions {
    try {
      const raw = localStorage.getItem(SOUNDIX_OPTIONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SoundixSavedOptions>;
        const f = FORMATS.includes(parsed.format as (typeof FORMATS)[number]) ? (parsed.format as string) : "mp3";
        const lastLossy = LOSSY_BITRATES.includes(parsed.lastLossyBitrate as (typeof LOSSY_BITRATES)[number])
          ? (parsed.lastLossyBitrate as string)
          : LOSSY_BITRATES.includes(parsed.bitrate as (typeof LOSSY_BITRATES)[number])
            ? (parsed.bitrate as string)
            : "320k";
        return {
          format: f,
          bitrate: qualityForFormat(f, lastLossy),
          lastLossyBitrate: lastLossy,
          sampleRate: SAMPLE_RATES.includes(parsed.sampleRate as (typeof SAMPLE_RATES)[number]) ? (parsed.sampleRate as number) : 44100,
          namingPattern: parsed.namingPattern || "{artist}/{year} - {album}/{trackNumber} - {title}",
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
      namingPattern: "{artist}/{year} - {album}/{trackNumber} - {title}",
      embedId3: true,
      outputFolder: fallbackFolder,
    };
  }

  const musicStore = useMusicStore;
  let accent = $derived($musicStore.appearance.accentColor || "#06b6d4");

  let first = $derived(tracks[0]);
  const initialFallback = musicStore.getState().librarySettings.musicFolder || "/home/neokamen/Descargas";
  const saved = loadSavedOptions(initialFallback);

  let format = $state(saved.format);
  let bitrate = $state(saved.bitrate);
  let lastLossyBitrate = $state(saved.lastLossyBitrate);
  let sampleRate = $state(saved.sampleRate);
  let namingPattern = $state(saved.namingPattern);
  let embedId3 = $state(saved.embedId3);
  let outputFolder = $state(saved.outputFolder);
  let isDownloading = $state(false);
  let structureOpen = $state(false);
  let showCoverSearch = $state(false);
  let coverQuery = $state("");
  let coverHits = $state<CoverHit[]>([]);
  let coverLoading = $state(false);

  let draft = $state({
    title: "",
    artist: "",
    album: "",
    year: "",
    trackNumber: "1",
    coverUrl: "",
  });

  let lastTrackId: string | null = $state(null);
  $effect(() => {
    if (first && first.id !== lastTrackId) {
      lastTrackId = first.id;
      draft.title = first.title || "";
      draft.artist = first.artist || "";
      draft.album = first.album || "";
      draft.year = first.year || "";
      draft.trackNumber = String(first.trackNumber || 1);
      draft.coverUrl = first.coverUrl || "";
    }
  });

  let lossless = $derived(isLosslessFormat(format));
  let structure = $derived(buildStructurePreview(namingPattern, draft, format));
  let collapsedPath = $derived(structure.rendered);

  let qualityLabel = $derived(
    lossless
      ? format === "wav"
        ? "PCM sin pérdida"
        : "FLAC sin pérdida"
      : bitrate
  );

  $effect(() => {
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
  });

  function insertToken(token: string) {
    namingPattern = `${namingPattern}${token}`;
    structureOpen = true;
  }

  function handleFormatChange(nextFormat: string) {
    format = nextFormat;
    if (isLosslessFormat(nextFormat)) {
      bitrate = "lossless";
      return;
    }
    bitrate = lastLossyBitrate;
  }

  function handleBitrateChange(nextBitrate: string) {
    if (lossless) return;
    bitrate = nextBitrate;
    lastLossyBitrate = nextBitrate;
  }

  async function handlePickFolder() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false, title: "Carpeta de destino" });
      if (typeof dir === "string") outputFolder = dir;
    } catch {
      // ignore
    }
  }

  async function searchCovers(query?: string) {
    const q = ((query ?? coverQuery) || `${draft.artist} ${draft.album || draft.title}`).trim();
    if (!q) return;
    coverQuery = q;
    coverLoading = true;
    try {
      const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=album&limit=16`);
      const payload = (await response.json()) as {
        results?: { artworkUrl100?: string; collectionName?: string; artistName?: string }[];
      };
      coverHits = (payload.results || [])
        .map((item) => ({
          url: (item.artworkUrl100 || "").replace("100x100bb", "600x600bb").replace("100x100", "600x600"),
          title: item.collectionName || "",
          artist: item.artistName || "",
        }))
        .filter((item) => item.url);
    } catch {
      coverHits = [];
    } finally {
      coverLoading = false;
    }
  }

  async function performDownload() {
    if (tracks.length === 0 || isDownloading) return;
    isDownloading = true;
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
      isDownloading = false;
    }
  }
</script>

{#if first}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-black/70 p-3"
    onclick={() => !isDownloading && onClose()}
  >
    <div
      class="relative flex max-h-full w-full max-w-[440px] min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[var(--app-surface,#0b1220)] shadow-2xl"
      onclick={(event) => event.stopPropagation()}
    >
      <div class="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div class="min-w-0">
          <div class="truncate text-sm font-black text-white">{showCoverSearch ? "Buscar carátula" : "Guardar offline"}</div>
          <div class="truncate text-[11px] text-slate-500">
            {showCoverSearch ? "Elige una portada para el archivo" : "Formato, calidad, carpeta y estructura"}
          </div>
        </div>
        <button
          type="button"
          onclick={() => (showCoverSearch ? (showCoverSearch = false) : onClose())}
          disabled={isDownloading}
          class="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          <X size={16} />
        </button>
      </div>

      {#if showCoverSearch}
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
          <form
            class="mb-3 flex shrink-0 gap-2"
            onsubmit={(event) => {
              event.preventDefault();
              void searchCovers(coverQuery);
            }}
          >
            <div class="relative min-w-0 flex-1">
              <Search size={14} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                bind:value={coverQuery}
                placeholder={`${draft.artist} ${draft.album || draft.title}`}
                class="h-9 w-full rounded-xl border border-white/10 bg-black/30 pl-9 pr-3 text-sm text-white outline-none"
              />
            </div>
            <button
              type="submit"
              class="shrink-0 rounded-xl px-3 text-sm font-bold text-black"
              style:background-color={accent}
            >
              {#if coverLoading}
                <Loader2 size={14} class="animate-spin" />
              {:else}
                Buscar
              {/if}
            </button>
          </form>
          <div class="min-h-0 flex-1 overflow-y-auto">
            <div class="grid grid-cols-3 gap-2">
              {#each coverHits as hit (hit.url)}
                <button
                  type="button"
                  onclick={() => {
                    draft.coverUrl = hit.url;
                    showCoverSearch = false;
                  }}
                  class="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/30 text-left hover:border-white/30"
                >
                  <img src={hit.url} alt={hit.title} class="aspect-square w-full object-cover" />
                  <div class="truncate px-1.5 py-1 text-[9px] text-slate-400">{hit.title}</div>
                </button>
              {/each}
            </div>
            {#if !coverLoading && coverHits.length === 0}
              <div class="py-8 text-center text-xs text-slate-500">Sin resultados. Prueba artista + álbum.</div>
            {/if}
          </div>
        </div>
      {:else}
        <div class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
          <div class="flex min-w-0 gap-3">
            <button
              type="button"
              onclick={() => {
                showCoverSearch = true;
                if (coverHits.length === 0) void searchCovers();
              }}
              class="group relative h-[92px] w-[92px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-slate-950"
              title="Buscar carátula"
            >
              {#if draft.coverUrl}
                <img src={draft.coverUrl} alt="Carátula" class="h-full w-full object-cover" />
              {:else}
                <div class="flex h-full w-full items-center justify-center text-slate-600">
                  <Music size={24} />
                </div>
              {/if}
              <span class="absolute inset-0 flex items-center justify-center bg-black/55 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
                Buscar
              </span>
            </button>
            <div class="grid min-w-0 flex-1 grid-cols-2 gap-2 text-xs">
              <label class="col-span-2 space-y-1">
                <span class="text-slate-500">Título</span>
                <input bind:value={draft.title} class="w-full min-w-0 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-white outline-none" />
              </label>
              <label class="space-y-1">
                <span class="text-slate-500">Artista</span>
                <input bind:value={draft.artist} class="w-full min-w-0 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-white outline-none" />
              </label>
              <label class="space-y-1">
                <span class="text-slate-500">Álbum</span>
                <input bind:value={draft.album} class="w-full min-w-0 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-white outline-none" />
              </label>
            </div>
          </div>

          <div class="mt-3 grid min-w-0 grid-cols-3 gap-2 text-xs">
            <label class="space-y-1">
              <span class="text-slate-500">Año</span>
              <input bind:value={draft.year} class="w-full min-w-0 rounded-lg border border-white/10 bg-black/25 px-2 py-1.5 text-white outline-none" />
            </label>
            <label class="space-y-1">
              <span class="text-slate-500">Nº</span>
              <input bind:value={draft.trackNumber} class="w-full min-w-0 rounded-lg border border-white/10 bg-black/25 px-2 py-1.5 text-white outline-none" />
            </label>
            <label class="space-y-1">
              <span class="text-slate-500">Formato</span>
              <select
                value={format}
                onchange={(e) => handleFormatChange(e.currentTarget.value)}
                class="w-full min-w-0 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-white"
                style="color-scheme: dark"
              >
                {#each FORMATS as item}
                  <option value={item}>{item.toUpperCase()}</option>
                {/each}
              </select>
            </label>
            <label class="space-y-1">
              <span class="text-slate-500">Calidad</span>
              <select
                value={lossless ? "lossless" : bitrate}
                onchange={(e) => handleBitrateChange(e.currentTarget.value)}
                disabled={lossless}
                class="w-full min-w-0 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-white disabled:opacity-70"
                style="color-scheme: dark"
              >
                {#if lossless}
                  <option value="lossless">{qualityLabel}</option>
                {:else}
                  {#each LOSSY_BITRATES as item}
                    <option value={item}>{item}</option>
                  {/each}
                {/if}
              </select>
            </label>
            <label class="col-span-2 space-y-1">
              <span class="text-slate-500">Sample rate</span>
              <select
                value={sampleRate}
                onchange={(e) => (sampleRate = Number(e.currentTarget.value))}
                class="w-full min-w-0 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-white"
                style="color-scheme: dark"
              >
                {#each SAMPLE_RATES as rate}
                  <option value={rate}>{rate / 1000} kHz</option>
                {/each}
              </select>
            </label>
          </div>

          <div class="mt-3 min-w-0 rounded-xl border border-white/10 bg-black/20 p-2.5">
            <button
              type="button"
              onclick={() => (structureOpen = !structureOpen)}
              class="flex w-full min-w-0 items-center gap-2 text-left"
            >
              {#if structureOpen}
                <ChevronDown size={14} class="shrink-0 text-slate-400" />
              {:else}
                <ChevronRight size={14} class="shrink-0 text-slate-400" />
              {/if}
              <div class="min-w-0 flex-1">
                <div class="text-[10px] uppercase tracking-wider text-slate-500">Estructura de carpetas</div>
                <div class="truncate font-mono text-[11px] text-slate-400" title={collapsedPath}>{collapsedPath}</div>
              </div>
            </button>
            {#if structureOpen}
              <div class="mt-2 space-y-2 border-t border-white/10 pt-2">
                <div class="flex flex-wrap gap-1">
                  {#each TOKEN_CHIPS as chip}
                    <button
                      type="button"
                      onclick={() => insertToken(chip.id)}
                      class="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-slate-300 hover:text-white"
                    >
                      {chip.label}
                    </button>
                  {/each}
                  <span class="rounded-md px-1.5 py-0.5 text-[10px] text-slate-600">/</span>
                </div>
                <div class="flex flex-wrap gap-1">
                  {#each NAMING_PRESETS as preset}
                    <button
                      type="button"
                      onclick={() => (namingPattern = preset.value)}
                      class="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-white"
                    >
                      {preset.label}
                    </button>
                  {/each}
                </div>
                <textarea
                  bind:value={namingPattern}
                  rows={2}
                  class="w-full min-w-0 resize-none rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-[11px] text-white outline-none"
                ></textarea>
                <div class="font-mono text-[11px] leading-5 text-slate-300">
                  {#each structure.parts as part, index}
                    <div class="truncate" style:padding-left="{index * 10}px">
                      {index < structure.parts.length - 1 ? "📁 " : "🎵 "}
                      {part}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>

          <button
            type="button"
            onclick={() => void handlePickFolder()}
            class="mt-3 flex w-full min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-left text-xs text-slate-300 hover:text-white"
          >
            <FolderOpen size={14} class="shrink-0" color={accent} />
            <span class="truncate">{outputFolder}</span>
          </button>
          <button
            type="button"
            onclick={() => (embedId3 = !embedId3)}
            class="mt-2 flex items-center gap-2 text-xs text-slate-300 hover:text-white"
          >
            {#if embedId3}
              <CheckSquare size={15} color={accent} />
            {:else}
              <Square size={15} />
            {/if}
            Incrustar ID3 y carátula
          </button>
        </div>

        <div class="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
          <div class="min-w-0 truncate text-[11px] text-slate-500">
            {tracks.length} pista{tracks.length === 1 ? "" : "s"} · {format.toUpperCase()} · {qualityLabel}
          </div>
          <button
            type="button"
            onclick={() => void performDownload()}
            disabled={isDownloading}
            class="shrink-0 rounded-xl px-4 py-2 text-sm font-black text-black disabled:opacity-50"
            style:background-color={accent}
          >
            {#if isDownloading}
              <span class="inline-flex items-center gap-2">
                <Loader2 size={14} class="animate-spin" /> Descargando...
              </span>
            {:else}
              Descargar
            {/if}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
