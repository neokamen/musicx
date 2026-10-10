<script lang="ts">
  import {
    useMusicStore,
    AUDIO_ENGINES,
    queueStore,
    queueIndexStore,
    currentTrackStore,
    isPlayingStore,
    appearanceStore,
    playbackSettingsStore,
    listeningStatsStore,
    volumeStore,
    languageStore,
    audioSettingsStore,
  } from "../../store/index.ts";
  import { ListMusic, Play, Trash2, X, Radio as RadioIcon, Globe, Volume2, Download, SlidersHorizontal, Server, ArrowLeft } from "@lucide/svelte";
  import RadioHubModal from "../radio/RadioHubModal.svelte";
  import StreamMusicModal from "./StreamMusicModal.svelte";
  import SoundixDownloadDialog from "./SoundixDownloadDialog.svelte";
  import MpdExplorerWidget from "./MpdExplorerWidget.svelte";
  import MpdControlWidget from "./MpdControlWidget.svelte";
  import { trackToSoundixTrack, type NeoTrack } from "../../types/stream.ts";
  import ColumnResizeHandle from "./ColumnResizeHandle.svelte";
  import { isStreamTrack } from "../../lib/streamTracks.ts";
  import type { Track } from "../../types/index.ts";
  import { t } from "../../i18n/translations.ts";
  import QueueHudVisualizer from "./QueueHudVisualizer.svelte";
  import { FORMAT_COLORS } from "../../types/spectrum.ts";

  type QueueColumn = "index" | "title" | "format" | "bitrate" | "duration" | "download";

  function formatDuration(sec: number): string {
    if (!sec || isNaN(sec)) return "0:00";
    const mins = Math.floor(sec / 60);
    const remainingSecs = Math.floor(sec % 60);
    return `${mins}:${remainingSecs.toString().padStart(2, "0")}`;
  }

  function queueFormatLabel(track: Track): string {
    if (track.stream_source === "MPD") return "MPD";
    if (isStreamTrack(track)) return "STREAM";
    const fmt = (track.format || "").toUpperCase();
    return fmt || "AUDIO";
  }

  function queueQualityLabel(track: Track): string {
    const isStream = isStreamTrack(track);
    if (isStream) {
      if (track.bitrate_kbps > 0) {
        const sr = track.sample_rate > 0 ? Math.round(track.sample_rate / 1000) : 48;
        const brStr = String(track.bitrate_kbps).padStart(4, "\u00A0");
        return `${brStr}k / ${sr}z`;
      }
      return "  Stream   ";
    }

    const isCurrent = currentTrack && track.filepath === currentTrack.filepath;
    const bitrate = isCurrent && currentTrack.bitrate_kbps > 0 ? currentTrack.bitrate_kbps : track.bitrate_kbps;
    const sampleRate = isCurrent && currentTrack.sample_rate > 0 ? currentTrack.sample_rate : track.sample_rate;

    const hzNum = sampleRate > 0 ? Math.round(sampleRate / 1000) : 44;
    const brNum = bitrate > 0 ? bitrate : 0;

    if (brNum > 0) {
      const brStr = String(brNum).padStart(4, "\u00A0");
      return `${brStr}k / ${hzNum}z`;
    }
    return "   — / —   ";
  }

  let queue = $derived($queueStore);
  let queueIndex = $derived($queueIndexStore);
  let currentTrack = $derived($currentTrackStore);
  let isPlaying = $derived($isPlayingStore);
  let appearance = $derived($appearanceStore);
  let playbackSettings = $derived($playbackSettingsStore);
  let listeningStats = $derived($listeningStatsStore);
  let volume = $derived($volumeStore);
  let lang = $derived($languageStore);
  let audioSettings = $derived($audioSettingsStore);

  let showRadio = $state(false);
  let queueHudMode = $state(0);
  let showStream = $state(false);
  let showMpd = $state(false);
  let downloadTracks = $state<NeoTrack[] | null>(null);
  let isColMenuOpen = $state(false);
  let isFileDrag = $state(false);

  let columnWidths = $state<Record<QueueColumn, number>>({
    index: 8,
    title: 40,
    format: 12,
    bitrate: 19,
    duration: 11,
    download: 10,
  });

  let visibleCols = $state({
    format: true,
    bitrate: true,
    duration: true,
    album: true,
    download: true,
  });

  let totalDuration = $derived(queue.reduce((acc, t) => acc + (t.duration_seconds || 0), 0));
  let remaining = $derived(queue.slice(Math.max(queueIndex, 0)).reduce((acc, t) => acc + (t.duration_seconds || 0), 0));

  const handleDownload = (track: Track, event: MouseEvent) => {
    event.stopPropagation();
    if (!isStreamTrack(track)) return;
    downloadTracks = [trackToSoundixTrack(track)];
  };

  const handleQueueDrop = async (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    isFileDrag = false;
    const files = Array.from(event.dataTransfer?.files || []).filter((file) =>
      /\.(mp3|flac|wav|ogg|m4a|aac|opus|alac)$/i.test(file.name)
    );
    if (files.length === 0) return;
    const newTracks: Track[] = files.map((file, idx) => ({
      filepath: (file as { path?: string }).path || file.name,
      title: file.name.replace(/\.[^/.]+$/, ""),
      artist: "Archivo Arrastrado",
      album: "Cola Temporal",
      track_number: idx + 1,
      duration_seconds: 0,
      format: file.name.split(".").pop()?.toUpperCase() || "AUDIO",
      sample_rate: 44100,
      bit_depth: 16,
      bitrate_kbps: 1411,
      file_size: file.size,
      mtime: Date.now(),
    }));
    useMusicStore.getState().addToQueue(newTracks);
    if (playbackSettings.autoPlayOnDrop && newTracks[0]) {
      await useMusicStore.getState().play(newTracks[0]);
    }
  };

  const resizeColumns = (left: QueueColumn, right: QueueColumn, deltaPixels: number) => {
    const delta = deltaPixels * 0.18;
    const nextLeft = Math.max(6, Math.min(70, columnWidths[left] + delta));
    const applied = nextLeft - columnWidths[left];
    columnWidths = {
      ...columnWidths,
      [left]: nextLeft,
      [right]: Math.max(6, columnWidths[right] - applied),
    };
  };

  let gridTemplate = $derived([
    `${columnWidths.index}px`,
    "minmax(0,1fr)",
    visibleCols.format ? `${columnWidths.format * 4.2}px` : null,
    visibleCols.bitrate ? `${columnWidths.bitrate * 4.2}px` : null,
    visibleCols.duration ? `${columnWidths.duration * 3.4}px` : null,
    visibleCols.download ? "22px" : null,
    "18px",
  ]
    .filter(Boolean)
    .join(" "));

  let hudPanels = $derived.by(() => {
    const remainingSec = queue.slice(Math.max(0, queueIndex + 1)).reduce((sum, track) => sum + (track.duration_seconds || 0), 0);
    const listened = listeningStats.totalSecondsListened;
    const listenedLabel = listened >= 3600
      ? `${Math.floor(listened / 3600)}h ${Math.floor((listened % 3600) / 60)}m`
      : `${Math.floor(listened / 60)}m ${Math.floor(listened % 60)}s`;

    const labelSession = lang === "ca" ? "Sessió & Rendiment" : lang === "en" ? "Session & Stats" : "Sesión & Rendimiento";
    const labelHardware = lang === "ca" ? "Hardware & DSP" : lang === "en" ? "Hardware & DSP" : "Hardware & DSP";
    const labelQueue = lang === "ca" ? "Cua de Reproducció" : lang === "en" ? "Playback Queue" : "Cola de Reproducción";
    const labelWaveform = lang === "ca" ? "Ones de la Cançó (HD)" : lang === "en" ? "Song Waveform (HD)" : "Ondas de la Canción (HD)";
    const labelVuMeter = lang === "ca" ? "Vúmetre Estèreo Balístic dB" : lang === "en" ? "Stereo Ballistic VU Meter dB" : "Vúmetro Estéreo Balístico dB";
    const labelCavaFluid = lang === "ca" ? "CAVA: Ona Fluida" : lang === "en" ? "CAVA: Fluid Wave" : "CAVA: Onda Fluida";
    const labelCavaDots = lang === "ca" ? "CAVA: Punts" : lang === "en" ? "CAVA: Dots" : "CAVA: Puntos";
    const labelLiveMatrix = lang === "ca" ? "En Viu: Matriu LED" : lang === "en" ? "Live: LED Matrix" : "En Vivo: Matriz LED";
    const labelLivePeakFall = lang === "ca" ? "En Viu: Caiguda de Pics" : lang === "en" ? "Live: Peak Fall" : "En Vivo: Caída de Picos";

    const liveTelemetry = useMusicStore.getState().telemetry;
    const isCurrent = currentTrack && liveTelemetry.filepath && currentTrack.filepath === liveTelemetry.filepath;
    const curDur = isCurrent && liveTelemetry.duration > 0 ? liveTelemetry.duration : (currentTrack?.duration_seconds || 0);

    return [
      {
        id: "session",
        label: labelSession,
        type: "cells" as const,
        cells: [
          { k: lang === "ca" ? "Pistes" : "Pistas", v: String(listeningStats.totalTracksPlayed) },
          { k: lang === "ca" ? "Sessions" : "Sesiones", v: String(listeningStats.totalSessions) },
          { k: lang === "ca" ? "Temps Total" : "Tiempo Total", v: listenedLabel },
          { k: "Tempo", v: liveTelemetry.tempo_bpm ? `${Math.round(liveTelemetry.tempo_bpm)} BPM` : "—" },
        ],
      },
      {
        id: "buffer",
        label: labelHardware,
        type: "cells" as const,
        cells: [
          { k: "Driver", v: (liveTelemetry.output_device || "ALSA").split(" ")[0] },
          { k: "Stream", v: (AUDIO_ENGINES.find((e) => e.id === audioSettings.resamplingQuality) || AUDIO_ENGINES[0]).name.split(' (')[0] },
          { k: "Buffer", v: `${audioSettings.bufferLatency === "ultra_low" ? 64 : audioSettings.bufferLatency === "very_low" ? 128 : audioSettings.bufferLatency === "low" ? 256 : audioSettings.bufferLatency === "medium" ? 512 : 1024} spls` },
          { k: "Volumen", v: `${Math.round(volume * 100)}%` },
        ],
      },
      {
        id: "queue",
        label: labelQueue,
        type: "cells" as const,
        cells: [
          { k: "Posición", v: queue.length ? `${Math.min(queue.length, queueIndex + 1)} / ${queue.length}` : "0 / 0" },
          { k: "Resto Pista", v: curDur > 0 ? formatDuration(Math.max(0, curDur - (liveTelemetry.current_time || 0))) : "—" },
          { k: "Resto Cola", v: remainingSec ? formatDuration(remainingSec) : "—" },
          { k: "Total Cola", v: `${queue.length} pistas` },
        ],
      },
      {
        id: "fftw3_vector",
        label: lang === "ca" ? "FFTW3: Curba Vectorial" : lang === "en" ? "FFTW3: Vector Curve" : "FFTW3: Curva Vectorial",
        type: "visualizer" as const,
        mode: "fftw3_vector" as const,
        cells: [],
      },
      {
        id: "waveform",
        label: labelWaveform,
        type: "visualizer" as const,
        mode: "waveform" as const,
        cells: [],
      },
      {
        id: "blank",
        label: lang === "ca" ? "HUD Blanc (Buit)" : lang === "en" ? "Blank HUD (Empty)" : "HUD Blanco (Vacío)",
        type: "blank" as const,
        cells: [],
      },
      // Second column of 6 panels (starts with Vúmetro in 7th place):
      {
        id: "stereo_vu",
        label: labelVuMeter,
        type: "visualizer" as const,
        mode: "stereo_vu" as const,
        cells: [],
      },
      {
        id: "cava_fluid",
        label: labelCavaFluid,
        type: "visualizer" as const,
        mode: "cava_fluid" as const,
        cells: [],
      },
      {
        id: "cava_dots",
        label: labelCavaDots,
        type: "visualizer" as const,
        mode: "cava_dots" as const,
        cells: [],
      },
      {
        id: "fftw3_monitor",
        label: lang === "ca" ? "FFTW3: Monitor de Freqüència" : lang === "en" ? "FFTW3: Frequency Monitor" : "FFTW3: Monitor de Frecuencia",
        type: "visualizer" as const,
        mode: "fftw3_monitor" as const,
        cells: [],
      },
      {
        id: "live_led_matrix",
        label: labelLiveMatrix,
        type: "visualizer" as const,
        mode: "live_led_matrix" as const,
        cells: [],
      },
      {
        id: "live_peak_fall",
        label: labelLivePeakFall,
        type: "visualizer" as const,
        mode: "live_peak_fall" as const,
        cells: [],
      },
    ];
  });

  let currentHudPanel = $derived(hudPanels[queueHudMode] || hudPanels[0]);
</script>

{#if showRadio}
  <RadioHubModal isOpen={true} onClose={() => { showRadio = false; }} embedded={true} onBackToLibrary={() => { showRadio = false; }} />
{:else if showStream}
  <StreamMusicModal isOpen={true} onClose={() => { showStream = false; }} embedded={true} onBackToLibrary={() => { showStream = false; }} />
{:else if showMpd}
  <div class="relative flex flex-col h-full bg-audiophile-surface">
    <!-- Header with Back button -->
    <div
      class="flex items-center justify-between gap-3 px-3 py-2 border-b shrink-0 select-none"
      style="border-color: {appearance.accentColor}28; background: linear-gradient(180deg, {appearance.accentColor}12, transparent);"
    >
      <div class="flex items-center gap-2">
        <div
          class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style="background: {appearance.accentColor}22; color: {appearance.accentColor};"
        >
          <Server size={15} />
        </div>
        <div class="flex flex-col">
          <span class="text-xs font-bold text-white tracking-wide">MPD & Disco en Red</span>
          <span class="text-[10px] text-slate-400 font-mono">Explorador de archivos y control de reproducción</span>
        </div>
      </div>
      <button
        type="button"
        onclick={() => { showMpd = false; }}
        class="rounded-lg p-1.5 text-audiophile-muted hover:bg-audiophile-surface2 hover:text-white transition-colors cursor-pointer"
        aria-label={lang === 'ca' ? 'Tornar a la Cua' : lang === 'en' ? 'Back to Queue' : 'Volver a la Cola'}
        title={lang === 'ca' ? 'Tornar a la Cua' : lang === 'en' ? 'Back to Queue' : 'Volver a la Cola'}
      >
        <ArrowLeft size={16} />
      </button>
    </div>

    <!-- MPD Explorer in main area -->
    <div class="flex-1 min-h-0 overflow-hidden">
      <MpdExplorerWidget />
    </div>

    <!-- MPD Control HUD in bottom area -->
    <div class="h-32 border-t border-audiophile-border shrink-0 bg-audiophile-surface2">
      <MpdControlWidget />
    </div>
  </div>
{:else}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="relative flex flex-col h-full bg-audiophile-surface"
    ondragover={(event) => {
      event.preventDefault();
      event.stopPropagation();
      isFileDrag = true;
    }}
    ondragleave={(event) => {
      if ((event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) return;
      isFileDrag = false;
    }}
    ondrop={(event) => void handleQueueDrop(event)}
  >
    <div
      class="flex items-center justify-between gap-3 px-3 py-2.5 border-b shrink-0"
      style="border-color: {appearance.accentColor}28; background: linear-gradient(180deg, {appearance.accentColor}12, transparent);"
    >
      <div class="min-w-0 flex items-center gap-2.5">
        <div
          class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style="background: {appearance.accentColor}22; color: {appearance.accentColor};"
        >
          <ListMusic size={16} />
        </div>
        <div class="min-w-0">
          <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-audiophile-text">
            {t("queueTitle", lang)}
          </div>
          <div class="text-[10px] text-audiophile-muted font-mono truncate">
            {queue.length} {t("tracks", lang)}
            {#if queue.length > 0}
              {" · "}
              {formatDuration(totalDuration)}
              {remaining > 0 && remaining !== totalDuration ? ` · ${lang === 'ca' ? 'queden' : lang === 'en' ? 'remaining' : 'quedan'} ${formatDuration(remaining)}` : ""}
            {/if}
          </div>
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onclick={() => { showRadio = true; }}
          class="p-1.5 rounded-md text-audiophile-muted hover:text-audiophile-text hover:bg-white/5"
          title="Radio"
        >
          <RadioIcon size={14} />
        </button>
        <button
          type="button"
          onclick={() => { showStream = true; }}
          class="p-1.5 rounded-md text-audiophile-muted hover:text-audiophile-text hover:bg-white/5"
          title="Stream Music"
        >
          <Globe size={14} />
        </button>
        <button
          type="button"
          onclick={() => { showMpd = true; }}
          class="p-1.5 rounded-md text-audiophile-muted hover:text-audiophile-text hover:bg-white/5"
          title="MPD (Disco en Red)"
        >
          <Server size={14} />
        </button>
        <div class="relative">
          <button
            type="button"
            onclick={() => { isColMenuOpen = !isColMenuOpen; }}
            class="p-1.5 rounded-md text-audiophile-muted hover:text-audiophile-text hover:bg-white/5"
            title={lang === "ca" ? "Configurar columnes" : lang === "en" ? "Configure columns" : "Configurar columnas"}
          >
            <SlidersHorizontal size={14} />
          </button>
          {#if isColMenuOpen}
            <div class="absolute right-0 top-8 z-50 w-44 space-y-1.5 rounded-lg border border-slate-700 bg-slate-950 p-2 font-mono text-[10px] shadow-2xl">
              <div class="border-b border-slate-800 pb-1 font-bold text-slate-400">
                {lang === "ca" ? "Columnes de cua" : lang === "en" ? "Queue columns" : "Columnas de cola"}
              </div>
              {#each [
                ["album", lang === "ca" ? "Àlbum" : lang === "en" ? "Album" : "Álbum"],
                ["format", t("type", lang)],
                ["bitrate", lang === "ca" ? "Qualitat" : lang === "en" ? "Quality" : "Calidad"],
                ["duration", t("duration", lang)],
                ["download", lang === "ca" ? "Descàrrega" : lang === "en" ? "Download" : "Descarga"],
              ] as [key, label]}
                <label class="flex cursor-pointer items-center justify-between text-slate-200">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={visibleCols[key as keyof typeof visibleCols]}
                    onchange={(event) => {
                      visibleCols = { ...visibleCols, [key]: (event.target as HTMLInputElement).checked };
                    }}
                    class="accent-cyan-400"
                  />
                </label>
              {/each}
            </div>
          {/if}
        </div>
        {#if queue.length > 0}
          <button
            type="button"
            onclick={() => useMusicStore.getState().clearQueue()}
            class="p-1.5 rounded-md text-audiophile-muted hover:text-red-400 hover:bg-red-500/10"
            title={t("clearQueue", lang)}
          >
            <Trash2 size={14} />
          </button>
        {/if}
      </div>
    </div>

    {#if queue.length === 0}
      <div class="flex-1 flex flex-col items-center justify-center text-audiophile-muted p-6 gap-3">
        <ListMusic size={36} class="opacity-25" />
        <p class="text-sm">{t("queueEmpty", lang)}</p>
        <p class="text-[11px] text-center max-w-[220px] opacity-70">
          {t("queueEmptyDesc", lang)}
        </p>
      </div>
    {:else}
      <div class="flex-1 overflow-y-auto min-h-0">
        <div
          class="sticky top-0 z-20 grid items-center gap-2 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-audiophile-muted bg-audiophile-surface"
          style="grid-template-columns: {gridTemplate}; border-bottom: 1px solid color-mix(in srgb, var(--app-accent, #06b6d4) 12%, transparent); background-color: var(--app-surface, #0c1220);"
        >
          <span class="relative">
            #
            <ColumnResizeHandle onResize={(delta) => resizeColumns("index", "title", delta)} />
          </span>
          <span class="relative min-w-0">
            {lang === "ca" ? "Pista" : lang === "en" ? "Track" : "Pista"}
            {#if visibleCols.format}
              <ColumnResizeHandle onResize={(delta) => resizeColumns("title", "format", delta)} />
            {/if}
          </span>
          {#if visibleCols.format}
            <span class="relative">
              {t("type", lang)}
              {#if visibleCols.bitrate}
                <ColumnResizeHandle onResize={(delta) => resizeColumns("format", "bitrate", delta)} />
              {/if}
            </span>
          {/if}
          {#if visibleCols.bitrate}
            <span class="relative">
              {lang === "ca" ? "Qualitat" : lang === "en" ? "Quality" : "Calidad"}
              {#if visibleCols.duration}
                <ColumnResizeHandle onResize={(delta) => resizeColumns("bitrate", "duration", delta)} />
              {/if}
            </span>
          {/if}
          {#if visibleCols.duration}
            <span class="text-right">{t("duration", lang)}</span>
          {/if}
          {#if visibleCols.download}
            <span></span>
          {/if}
          <span></span>
        </div>

        {#each queue as track, i (track.filepath + '-' + i)}
          {@const isCurrent = i === queueIndex}
          {@const playingNow = isCurrent && isPlaying}
          {@const fmt = queueFormatLabel(track)}
          {@const stream = isStreamTrack(track)}

          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="grid items-center gap-2 px-3 py-2 cursor-pointer group transition-all duration-200"
            style="grid-template-columns: {gridTemplate}; border-bottom: 1px solid color-mix(in srgb, white 6%, transparent); background: {playingNow ? `linear-gradient(90deg, ${appearance.accentColor}18, transparent 70%)` : isCurrent ? `${appearance.accentColor}0d` : 'transparent'};"
            ondblclick={() => void useMusicStore.getState().playFromQueue(i)}
          >
            <button
              type="button"
              class="flex items-center justify-center text-[10px] text-audiophile-muted"
              onclick={(event) => {
                event.stopPropagation();
                void useMusicStore.getState().playFromQueue(i);
              }}
              title={playingNow ? t("playing", lang) : t("play", lang)}
            >
              {#if playingNow}
                <Volume2
                  size={13}
                  class="animate-pulse"
                  style="color: {appearance.accentColor}; filter: drop-shadow(0 0 6px {appearance.accentColor});"
                />
              {:else}
                <span class="group-hover:hidden">{i + 1}</span>
                <Play
                  size={12}
                  class="hidden group-hover:block fill-current"
                  style="color: {appearance.accentColor};"
                />
              {/if}
            </button>
            <div class="min-w-0">
              <div
                class="text-[12px] truncate {isCurrent ? 'font-semibold' : 'text-audiophile-text'}"
                style={isCurrent ? `color: ${appearance.accentColor};` : ''}
              >
                {track.title}
              </div>
              <div class="text-[10px] text-audiophile-muted truncate">
                {track.artist}
                {#if visibleCols.album && track.album}
                  {" · "}{track.album}
                {/if}
              </div>
            </div>
            {#if visibleCols.format}
              <span
                class="truncate text-[10px] font-bold tracking-wide transition-colors"
                style="color: {appearance.coloredFormats !== false ? (FORMAT_COLORS[fmt] || appearance.accentColor) : '#94a3b8'};"
              >
                {fmt}
              </span>
            {/if}
            {#if visibleCols.bitrate}
              <span class="truncate text-[10px] font-mono text-audiophile-muted tabular-nums whitespace-pre">
                {queueQualityLabel(track)}
              </span>
            {/if}
            {#if visibleCols.duration}
              <span class="text-right text-[10px] font-mono text-audiophile-muted tabular-nums">
                {formatDuration(currentTrack && track.filepath === currentTrack.filepath && currentTrack.duration_seconds > 0 ? currentTrack.duration_seconds : track.duration_seconds)}
              </span>
            {/if}
            {#if visibleCols.download}
              <button
                type="button"
                onclick={(event) => handleDownload(track, event)}
                disabled={!stream}
                class="p-0.5 text-audiophile-muted hover:text-audiophile-text disabled:opacity-25"
                title={stream ? "Descargar" : "Descarga disponible en pistas Stream"}
              >
                <Download size={12} />
              </button>
            {/if}
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                useMusicStore.getState().removeFromQueue(i);
              }}
              class="opacity-0 group-hover:opacity-100 p-0.5 text-audiophile-muted hover:text-red-400"
              title="Quitar"
            >
              <X size={12} />
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="border-t shrink-0 select-none transition-colors h-[50px] px-1.5 py-0.5 flex items-center bg-audiophile-surface cursor-pointer"
      style="border-color: {appearance.accentColor}25;"
      ondblclick={() => { queueHudMode = (queueHudMode + 1) % hudPanels.length; }}
    >
      <div class="flex items-center gap-1.5 w-full h-full">
        <!-- Two columns/rows of 6 pagination dots (squeezed, minimal margins) -->
        <div class="grid grid-flow-col grid-rows-6 gap-x-1 gap-y-[1px] items-center justify-center shrink-0 h-full py-0.5" role="tablist">
          {#each hudPanels as panel, index}
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                queueHudMode = index;
              }}
              class="group relative flex items-center justify-center w-2 h-1 p-0 cursor-pointer focus:outline-none"
              title={`${index + 1}/${hudPanels.length} · ${panel.label}`}
              aria-label={panel.label}
            >
              <span
                class="transition-all duration-200 rounded-full block shrink-0"
                style={index === queueHudMode
                  ? `width: 3.8px; height: 3.8px; background: #ffffff; box-shadow: 0 0 5px ${appearance.accentColor}, 0 0 2px ${appearance.accentColor}; outline: 1px solid ${appearance.accentColor};`
                  : `width: 2.2px; height: 2.2px; background: ${appearance.accentColor}35;`}
              ></span>
            </button>
          {/each}
        </div>

        <!-- Main HUD Panel Content -->
        {#if currentHudPanel.type === "visualizer"}
          <div class="flex-1 h-full overflow-hidden">
            <QueueHudVisualizer
              mode={currentHudPanel.mode}
              accentColor={appearance.accentColor}
            />
          </div>
        {:else if currentHudPanel.type === "blank"}
          <!-- Blank mode: strictly clean/empty space in HUD -->
          <div class="flex-1 h-full"></div>
        {:else}
          <div class="flex-1 grid grid-cols-4 gap-1.5 h-full items-center">
            {#each currentHudPanel.cells as cell}
              <div
                class="rounded px-2 py-0.5 flex flex-col justify-center h-full bg-black/20"
                style="border: 1px solid {appearance.accentColor}18;"
              >
                <span class="text-[7.5px] uppercase font-bold tracking-wider opacity-60 truncate flex items-center gap-1">
                  <span class="w-1 h-1 rounded-full shrink-0" style="background: {appearance.accentColor};"></span>
                  {cell.k}
                </span>
                <span class="text-[11px] font-mono font-bold tabular-nums truncate tracking-tight" style="color: {appearance.accentColor};">
                  {cell.v}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    {#if isFileDrag}
      <div
        class="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-md border-2 border-dashed bg-black/45 text-sm font-semibold"
        style="border-color: {appearance.accentColor}; color: {appearance.accentColor};"
      >
        {lang === "ca" ? "Deixa anar per afegir a la cua" : lang === "en" ? "Drop to add to queue" : "Soltar para añadir a la cola"}
      </div>
    {/if}

    {#if downloadTracks}
      <SoundixDownloadDialog
        tracks={downloadTracks}
        onClose={() => { downloadTracks = null; }}
      />
    {/if}
  </div>
{/if}
