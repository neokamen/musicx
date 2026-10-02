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

  function queueBitrateLabel(track: Track): string {
    if (isStreamTrack(track)) {
      return track.bitrate_kbps > 0 ? `${track.bitrate_kbps} kbps` : "Live";
    }
    return track.bitrate_kbps > 0 ? `${track.bitrate_kbps} kbps` : "—";
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

  let showRadio = $state(false);
  let queueHudMode = $state(0);
  let showStream = $state(false);
  let downloadTracks = $state<NeoTrack[] | null>(null);
  let isColMenuOpen = $state(false);
  let isFileDrag = $state(false);

  let columnWidths = $state<Record<QueueColumn, number>>({
    index: 8,
    title: 42,
    format: 12,
    bitrate: 16,
    duration: 12,
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

    return [
      {
        label: "Sesión",
        cells: [
          { k: "Pistas", v: String(listeningStats.totalTracksPlayed) },
          { k: "Sesiones", v: String(listeningStats.totalSessions) },
          { k: "Tiempo", v: listenedLabel },
        ],
      },
      {
        label: "Buffer",
        cells: [
          { k: "Estado", v: telemetry.state || (isPlaying ? "Playing" : "Paused") },
          { k: "Pos", v: formatDuration(telemetry.current_time || 0) },
          { k: "Dur", v: telemetry.duration ? formatDuration(telemetry.duration) : "—" },
        ],
      },
      {
        label: "Cola",
        cells: [
          { k: "Ítem", v: queue.length ? `${Math.min(queue.length, queueIndex + 1)}/${queue.length}` : "0/0" },
          { k: "Resto", v: remainingSec ? formatDuration(remainingSec) : "—" },
          { k: "Vol", v: `${Math.round(volume * 100)}%` },
        ],
      },
      {
        label: "Señal",
        cells: [
          { k: "Formato", v: currentTrack ? queueFormatLabel(currentTrack) : "—" },
          { k: "Bitrate", v: currentTrack ? queueBitrateLabel(currentTrack) : "—" },
          { k: "Fuente", v: currentTrack && isStreamTrack(currentTrack) ? "Stream" : currentTrack ? "Local" : "Idle" },
        ],
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
            Cola de reproducción
          </div>
          <div class="text-[10px] text-audiophile-muted font-mono truncate">
            {queue.length} {queue.length === 1 ? "pista" : "pistas"}
            {#if queue.length > 0}
              {" · "}
              {formatDuration(totalDuration)}
              {remaining > 0 && remaining !== totalDuration ? ` · quedan ${formatDuration(remaining)}` : ""}
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
            title="Configurar columnas"
          >
            <SlidersHorizontal size={14} />
          </button>
          {#if isColMenuOpen}
            <div class="absolute right-0 top-8 z-50 w-44 space-y-1.5 rounded-lg border border-slate-700 bg-slate-950 p-2 font-mono text-[10px] shadow-2xl">
              <div class="border-b border-slate-800 pb-1 font-bold text-slate-400">Columnas de cola</div>
              {#each [
                ["album", "Álbum"],
                ["format", "Tipo"],
                ["bitrate", "Bitrate"],
                ["duration", "Duración"],
                ["download", "Descarga"],
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
            title="Vaciar cola"
          >
            <Trash2 size={14} />
          </button>
        {/if}
      </div>
    </div>

    {#if queue.length === 0}
      <div class="flex-1 flex flex-col items-center justify-center text-audiophile-muted p-6 gap-3">
        <ListMusic size={36} class="opacity-25" />
        <p class="text-sm">La cola está vacía</p>
        <p class="text-[11px] text-center max-w-[220px] opacity-70">
          Añade pistas locales o abre Radio / Stream Music desde la cabecera.
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
            Pista
            {#if visibleCols.format}
              <ColumnResizeHandle onResize={(delta) => resizeColumns("title", "format", delta)} />
            {/if}
          </span>
          {#if visibleCols.format}
            <span class="relative">
              Tipo
              {#if visibleCols.bitrate}
                <ColumnResizeHandle onResize={(delta) => resizeColumns("format", "bitrate", delta)} />
              {/if}
            </span>
          {/if}
          {#if visibleCols.bitrate}
            <span class="relative">
              Bitrate
              {#if visibleCols.duration}
                <ColumnResizeHandle onResize={(delta) => resizeColumns("bitrate", "duration", delta)} />
              {/if}
            </span>
          {/if}
          {#if visibleCols.duration}
            <span class="text-right">Dur.</span>
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
              title={playingNow ? "Reproduciendo" : "Reproducir"}
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
                {queueBitrateLabel(track)}
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
      class="px-3 py-2 border-t shrink-0 cursor-pointer select-none"
      style="border-color: {appearance.accentColor}22;"
      title="Doble clic para cambiar telemetría"
      ondblclick={() => { queueHudMode = (queueHudMode + 1) % 4; }}
    >
      <div class="flex items-center justify-between mb-1.5">
        <div class="text-[9px] uppercase tracking-[0.18em] text-audiophile-muted">{currentHudPanel.label}</div>
        <div class="flex gap-1">
          {#each hudPanels as _, index}
            <span
              class="h-1 w-3 rounded-full"
              style="background: {index === queueHudMode ? appearance.accentColor : `${appearance.accentColor}33`};"
            ></span>
          {/each}
        </div>
      </div>
      <div class="grid grid-cols-3 gap-2">
        {#each currentHudPanel.cells as cell}
          <div class="min-w-0">
            <div class="text-[8px] uppercase tracking-wider text-audiophile-muted">{cell.k}</div>
            <div class="text-[11px] font-mono tabular-nums truncate" style="color: {appearance.accentColor};">{cell.v}</div>
          </div>
        {/each}
      </div>
      <div class="mt-1.5 h-[3px] rounded-full overflow-hidden" style="background: {appearance.accentColor}22;">
        <div class="h-full rounded-full" style="width: {progressPercent}%; background: {appearance.accentColor};"></div>
      </div>
    </div>

    {#if isFileDrag}
      <div
        class="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-md border-2 border-dashed bg-black/45 text-sm font-semibold"
        style="border-color: {appearance.accentColor}; color: {appearance.accentColor};"
      >
        Soltar para añadir a la cola
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
