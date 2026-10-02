<script lang="ts">
  import { useMusicStore } from "../../store/index.ts";
  import { ListMusic, Play, Trash2, X, Radio as RadioIcon, Globe, Volume2, Download, SlidersHorizontal } from "@lucide/svelte";
  import RadioHubModal from "../radio/RadioHubModal.svelte";
  import StreamMusicModal from "./StreamMusicModal.svelte";
  import SoundixDownloadDialog from "./SoundixDownloadDialog.svelte";
  import { trackToSoundixTrack, type NeoTrack } from "../../types/stream.ts";
  import ColumnResizeHandle from "./ColumnResizeHandle.svelte";
  import { isStreamTrack } from "../../lib/streamTracks.ts";
  import type { Track } from "../../types/index.ts";
  import { t } from "../../i18n/translations.ts";
  import QueueHudVisualizer from "./QueueHudVisualizer.svelte";

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

  function queueQualityLabel(track: Track): string {
    const isStream = isStreamTrack(track);
    if (isStream) {
      if (track.bitrate_kbps > 0) {
        const sr = track.sample_rate > 0 ? Math.round(track.sample_rate / 1000) : 48;
        return `${track.bitrate_kbps}k / ${sr}z`;
      }
      return "Live";
    }

    const br = track.bitrate_kbps > 0 ? `${track.bitrate_kbps}k` : "";
    const sr = track.sample_rate > 0 ? Math.round(track.sample_rate / 1000) : 0;
    const hz = sr > 0 ? `${sr}z` : "";

    if (br && hz) return `${br} / ${hz}`;
    if (br) return br;
    if (hz) return hz;
    return "—";
  }

  let queue = $derived($useMusicStore.queue);
  let queueIndex = $derived($useMusicStore.queueIndex);
  let currentTrack = $derived($useMusicStore.currentTrack);
  let isPlaying = $derived($useMusicStore.isPlaying);
  let appearance = $derived($useMusicStore.appearance);
  let playbackSettings = $derived($useMusicStore.playbackSettings);
  let listeningStats = $derived($useMusicStore.listeningStats);
  let telemetry = $derived($useMusicStore.telemetry);
  let volume = $derived($useMusicStore.volume);
  let lang = $derived($useMusicStore.language);

  let showRadio = $state(false);
  let queueHudMode = $state(0);
  let showStream = $state(false);
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

    const labelSession = lang === "ca" ? "Sessió" : lang === "en" ? "Session" : "Sesión";
    const labelTracks = lang === "ca" ? "Pistes" : lang === "en" ? "Tracks" : "Pistas";
    const labelSessions = lang === "ca" ? "Sessions" : lang === "en" ? "Sessions" : "Sesiones";
    const labelTime = lang === "ca" ? "Temps" : lang === "en" ? "Time" : "Tiempo";
    const labelState = lang === "ca" ? "Estat" : lang === "en" ? "State" : "Estado";
    const labelQueue = lang === "ca" ? "Cua" : lang === "en" ? "Queue" : "Cola";
    const labelLeft = lang === "ca" ? "Restant" : lang === "en" ? "Left" : "Resto";
    const labelSignal = lang === "ca" ? "Senyal Hi-Fi" : lang === "en" ? "Hi-Fi Signal" : "Señal Hi-Fi";
    const labelQuality = lang === "ca" ? "Qualitat" : lang === "en" ? "Quality" : "Calidad";
    const labelSource = lang === "ca" ? "Font" : lang === "en" ? "Source" : "Fuente";
    const labelSpectrum = lang === "ca" ? "Espectre Hi-Fi" : lang === "en" ? "Hi-Fi Spectrum" : "Espectro Hi-Fi";
    const labelWave = lang === "ca" ? "Ona Contínua Fluida" : lang === "en" ? "Fluid Continuous Wave" : "Onda Continua Fluida";

    return [
      {
        id: "session",
        label: labelSession,
        type: "cells" as const,
        cells: [
          { k: labelTracks, v: String(listeningStats.totalTracksPlayed) },
          { k: labelSessions, v: String(listeningStats.totalSessions) },
          { k: labelTime, v: listenedLabel },
        ],
      },
      {
        id: "buffer",
        label: "Buffer & DSP",
        type: "cells" as const,
        cells: [
          { k: labelState, v: telemetry.state || (isPlaying ? "Playing" : "Paused") },
          { k: "Pos", v: formatDuration(telemetry.current_time || 0) },
          { k: "Dur", v: telemetry.duration ? formatDuration(telemetry.duration) : "—" },
        ],
      },
      {
        id: "queue",
        label: labelQueue,
        type: "cells" as const,
        cells: [
          { k: "#", v: queue.length ? `${Math.min(queue.length, queueIndex + 1)}/${queue.length}` : "0/0" },
          { k: labelLeft, v: remainingSec ? formatDuration(remainingSec) : "—" },
          { k: "Vol", v: `${Math.round(volume * 100)}%` },
        ],
      },
      {
        id: "signal",
        label: labelSignal,
        type: "cells" as const,
        cells: [
          { k: t("type", lang), v: currentTrack ? queueFormatLabel(currentTrack) : "—" },
          { k: labelQuality, v: currentTrack ? queueQualityLabel(currentTrack) : "—" },
          { k: labelSource, v: currentTrack && isStreamTrack(currentTrack) ? "Stream" : currentTrack ? "Local" : "Idle" },
        ],
      },
      {
        id: "spectrum",
        label: labelSpectrum,
        type: "spectrum" as const,
        cells: [],
      },
      {
        id: "wave",
        label: labelWave,
        type: "wave" as const,
        cells: [],
      },
    ];
  });

  let currentHudPanel = $derived(hudPanels[queueHudMode] || hudPanels[0]);
  let progressPercent = $derived(telemetry.duration > 0 ? Math.min(100, (telemetry.current_time / telemetry.duration) * 100) : (isPlaying ? 55 : 8));
</script>

{#if showRadio}
  <RadioHubModal isOpen={true} onClose={() => { showRadio = false; }} embedded={true} onBackToLibrary={() => { showRadio = false; }} />
{:else if showStream}
  <StreamMusicModal isOpen={true} onClose={() => { showStream = false; }} embedded={true} onBackToLibrary={() => { showStream = false; }} />
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
          class="sticky top-0 z-[1] grid items-center gap-2 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-audiophile-muted bg-audiophile-surface/95"
          style="grid-template-columns: {gridTemplate}; border-bottom: 1px solid color-mix(in srgb, var(--app-accent, #06b6d4) 12%, transparent);"
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
            onclick={() => void useMusicStore.getState().playFromQueue(i)}
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
                class="truncate text-[10px] font-bold tracking-wide"
                style="color: {FORMAT_COLORS[fmt] || appearance.accentColor};"
              >
                {fmt}
              </span>
            {/if}
            {#if visibleCols.bitrate}
              <span class="truncate text-[10px] font-mono text-audiophile-muted tabular-nums">
                {queueQualityLabel(track)}
              </span>
            {/if}
            {#if visibleCols.duration}
              <span class="text-right text-[10px] font-mono text-audiophile-muted tabular-nums">
                {formatDuration(track.duration_seconds)}
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

    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="px-2.5 py-2 border-t shrink-0 cursor-pointer select-none bg-slate-950/40 backdrop-blur-sm"
      style="border-color: {appearance.accentColor}22;"
      title={lang === "ca" ? "Doble clic per canviar vista" : lang === "en" ? "Double click to cycle view" : "Doble clic para cambiar vista"}
      ondblclick={() => { queueHudMode = (queueHudMode + 1) % hudPanels.length; }}
    >
      <div class="flex items-center gap-2.5">
        <!-- Vertical Pagination Dots at the extreme left -->
        <div class="flex flex-col items-center justify-center gap-1 shrink-0 py-0.5" role="tablist">
          {#each hudPanels as panel, index}
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                queueHudMode = index;
              }}
              class="group relative flex items-center justify-center p-0.5 cursor-pointer focus:outline-none"
              title={`${index + 1}/6 · ${panel.label}`}
              aria-label={panel.label}
            >
              <span
                class="transition-all duration-300 rounded-full block"
                style={index === queueHudMode
                  ? `width: 3.5px; height: 13px; background: ${appearance.accentColor}; box-shadow: 0 0 10px ${appearance.accentColor}, 0 0 3px ${appearance.accentColor};`
                  : `width: 3px; height: 4px; background: ${appearance.accentColor}35;`}
              ></span>
            </button>
          {/each}
        </div>

        <!-- Main HUD Panel Content -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between mb-1">
            <div class="text-[9px] uppercase tracking-[0.16em] text-audiophile-muted flex items-center gap-1.5 font-bold">
              <span>{currentHudPanel.label}</span>
              <span class="text-[8px] font-mono opacity-50">[{queueHudMode + 1}/6]</span>
            </div>
            {#if currentHudPanel.type === "spectrum"}
              <span class="text-[8px] font-mono uppercase tracking-wider text-audiophile-muted opacity-80" style="color: {appearance.accentColor};">
                48 BANDS · HI-RES
              </span>
            {:else if currentHudPanel.type === "wave"}
              <span class="text-[8px] font-mono uppercase tracking-wider text-audiophile-muted opacity-80" style="color: {appearance.accentColor};">
                ANALOG OSCILLOSCOPE
              </span>
            {/if}
          </div>

          {#if currentHudPanel.type === "spectrum"}
            <QueueHudVisualizer
              mode="spectrum"
              accentColor={appearance.accentColor}
              {isPlaying}
              {telemetry}
            />
          {:else if currentHudPanel.type === "wave"}
            <QueueHudVisualizer
              mode="wave"
              accentColor={appearance.accentColor}
              {isPlaying}
              {telemetry}
            />
          {:else}
            <div class="grid grid-cols-3 gap-2">
              {#each currentHudPanel.cells as cell}
                <div class="min-w-0">
                  <div class="text-[8px] uppercase tracking-wider text-audiophile-muted truncate">{cell.k}</div>
                  <div class="text-[11px] font-mono tabular-nums truncate font-medium" style="color: {appearance.accentColor};">{cell.v}</div>
                </div>
              {/each}
            </div>
          {/if}

          <div class="mt-1.5 h-[3px] rounded-full overflow-hidden" style="background: {appearance.accentColor}22;">
            <div class="h-full rounded-full transition-all duration-300" style="width: {progressPercent}%; background: {appearance.accentColor}; box-shadow: 0 0 6px {appearance.accentColor}66;"></div>
          </div>
        </div>
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
