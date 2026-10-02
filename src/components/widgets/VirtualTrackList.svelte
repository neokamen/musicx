<script lang="ts">
  import { useMusicStore } from "../../store/index.ts";
  import {
    Search,
    RefreshCw,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Play,
    Plus,
    SlidersHorizontal,
    Radio as RadioIcon,
    Globe,
  } from "@lucide/svelte";
  import type { Track } from "../../types/index.ts";
  import RadioHubModal from "../radio/RadioHubModal.svelte";
  import StreamMusicModal from "./StreamMusicModal.svelte";
  import ColumnResizeHandle from "./ColumnResizeHandle.svelte";
  import VirtualTrackRow from "./VirtualTrackRow.svelte";

  type TrackColumn = "track" | "title" | "artist" | "album" | "format" | "bitrate" | "duration";
  type TrackColumnWidths = Record<TrackColumn, number>;

  type SortField =
    | "track_number"
    | "title"
    | "artist"
    | "album"
    | "duration_seconds"
    | "format"
    | "bitrate_kbps";

  type SortDirection = "asc" | "desc";

  let libraryTracks = $derived($useMusicStore.libraryTracks);
  let currentTrack = $derived($useMusicStore.currentTrack);
  let currentCoverArt = $derived($useMusicStore.currentCoverArt);
  let playbackSettings = $derived($useMusicStore.playbackSettings);
  let isPlaying = $derived($useMusicStore.isPlaying);
  let scanStatus = $derived($useMusicStore.scanStatus);

  let search = $state("");
  let sortField = $state<SortField>("artist");
  let sortDirection = $state<SortDirection>("asc");
  let columnWidths = $state<TrackColumnWidths>({
    track: 6,
    title: 33,
    artist: 18,
    album: 18,
    format: 10,
    bitrate: 8,
    duration: 7,
  });

  let visibleCols = $state({
    artist: true,
    album: true,
    format: true,
    bitrate: true,
    duration: true,
  });

  let isColMenuOpen = $state(false);
  let showRadio = $state(false);
  let showStreamMusic = $state(false);
  let contextMenu = $state<{
    x: number;
    y: number;
    track: Track;
  } | null>(null);

  let tableWidthRef = $state<HTMLDivElement | null>(null);
  let scrollTop = $state(0);
  let viewportHeight = $state(600);

  const resizeColumns = (left: TrackColumn, right: TrackColumn, deltaPixels: number) => {
    const totalWidth = tableWidthRef?.clientWidth || 1;
    const delta = (deltaPixels / totalWidth) * 100;
    const adjusted = Math.max(5, Math.min(70, columnWidths[left] + delta));
    const appliedDelta = adjusted - columnWidths[left];
    columnWidths = {
      ...columnWidths,
      [left]: adjusted,
      [right]: Math.max(5, columnWidths[right] - appliedDelta),
    };
  };

  const handleSearchChange = (e: Event) => {
    const q = (e.target as HTMLInputElement).value;
    search = q;
    useMusicStore.getState().fetchLibraryTracks(q);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      sortField = field;
      sortDirection = "asc";
    }
  };

  let sortedTracks = $derived.by(() => {
    return [...libraryTracks].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (valA === null || valA === undefined) valA = "" as never;
      if (valB === null || valB === undefined) valB = "" as never;
      let comp = 0;
      if (typeof valA === "string" && typeof valB === "string") {
        comp = valA.localeCompare(valB, undefined, { sensitivity: "base" });
      } else {
        comp = (valA as number) > (valB as number) ? 1 : (valA as number) < (valB as number) ? -1 : 0;
      }
      return sortDirection === "asc" ? comp : -comp;
    });
  });

  let visibleDurationSeconds = $derived(
    sortedTracks.reduce((sum, track) => sum + Math.max(0, track.duration_seconds || 0), 0)
  );

  const ROW_HEIGHT = 32;
  const OVERSCAN = 20;

  let totalVirtualHeight = $derived(sortedTracks.length * ROW_HEIGHT);
  let startIndex = $derived(Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN));
  let endIndex = $derived(Math.min(sortedTracks.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN));

  let visibleItems = $derived(
    sortedTracks.slice(startIndex, endIndex).map((track, i) => ({
      track,
      index: startIndex + i,
      top: (startIndex + i) * ROW_HEIGHT,
    }))
  );

  const handleScroll = (e: Event) => {
    const target = e.currentTarget as HTMLElement;
    scrollTop = target.scrollTop;
    viewportHeight = target.clientHeight;
  };

  const handleRowDoubleClick = (_track: Track, index: number) => {
    useMusicStore.getState().setQueue(sortedTracks, index);
  };

  const handleContextMenu = (e: MouseEvent, track: Track) => {
    e.preventDefault();
    contextMenu = { x: e.clientX, y: e.clientY, track };
  };

  const closeContextMenu = () => {
    contextMenu = null;
  };
</script>

{#snippet renderSortIndicator(field: SortField)}
  {#if sortField !== field}
    <ArrowUpDown size={10} class="opacity-0 group-hover/col:opacity-40" />
  {:else if sortDirection === 'asc'}
    <ArrowUp size={11} class="text-audiophile-cyan" />
  {:else}
    <ArrowDown size={11} class="text-audiophile-cyan" />
  {/if}
{/snippet}

{#if showRadio}
  <RadioHubModal isOpen={true} onClose={() => { showRadio = false; }} embedded={true} onBackToLibrary={() => { showRadio = false; }} />
{:else if showStreamMusic}
  <StreamMusicModal embedded={true} onBackToLibrary={() => { showStreamMusic = false; }} />
{:else}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={tableWidthRef}
    class="flex flex-col h-full w-full bg-audiophile-surface select-none font-sans text-xs overflow-hidden"
    onclick={closeContextMenu}
  >
    <!-- Barra superior: Búsqueda y Estado de Escaneo -->
    <div class="p-2 border-b border-audiophile-border bg-audiophile-surface2 flex items-center justify-between gap-3 shrink-0">
      <div class="flex-1 flex items-center bg-audiophile-base border border-audiophile-border rounded px-2.5 py-1">
        <Search size={13} class="text-audiophile-muted mr-2 shrink-0" />
        <input
          type="text"
          value={search}
          oninput={handleSearchChange}
          placeholder="Buscar entre miles de pistas por título, artista, álbum..."
          class="w-full bg-transparent font-mono text-[11px] text-audiophile-text placeholder-audiophile-muted/50 focus:outline-none"
        />
      </div>

      <div class="flex items-center gap-2">
        {#if scanStatus.is_scanning}
          <div class="flex items-center gap-1.5 text-audiophile-amber text-[10px] font-mono animate-pulse">
            <RefreshCw size={11} class="animate-spin" />
            <span>
              Indexando {scanStatus.current}/{scanStatus.total}
            </span>
          </div>
        {/if}

        <div class="relative">
          <button
            onclick={() => { isColMenuOpen = !isColMenuOpen; }}
            class="p-1.5 rounded bg-slate-900 border border-slate-700 text-slate-300 hover:text-white transition"
            title="Personalizar columnas visibles"
          >
            <SlidersHorizontal size={13} />
          </button>

          {#if isColMenuOpen}
            <div class="absolute top-8 right-0 w-44 p-2 bg-slate-950 border border-slate-700 shadow-2xl rounded-lg z-50 font-mono text-[10px] space-y-1.5">
              <div class="text-slate-400 font-bold border-b border-slate-800 pb-1">Columnas de Biblioteca</div>
              <label class="flex items-center justify-between cursor-pointer text-slate-200">
                <span>Artista</span>
                <input
                  type="checkbox"
                  checked={visibleCols.artist}
                  onchange={(e) => { visibleCols = { ...visibleCols, artist: (e.target as HTMLInputElement).checked }; }}
                  class="accent-cyan-400"
                />
              </label>
              <label class="flex items-center justify-between cursor-pointer text-slate-200">
                <span>Álbum</span>
                <input
                  type="checkbox"
                  checked={visibleCols.album}
                  onchange={(e) => { visibleCols = { ...visibleCols, album: (e.target as HTMLInputElement).checked }; }}
                  class="accent-cyan-400"
                />
              </label>
              <label class="flex items-center justify-between cursor-pointer text-slate-200">
                <span>Formato</span>
                <input
                  type="checkbox"
                  checked={visibleCols.format}
                  onchange={(e) => { visibleCols = { ...visibleCols, format: (e.target as HTMLInputElement).checked }; }}
                  class="accent-cyan-400"
                />
              </label>
              <label class="flex items-center justify-between cursor-pointer text-slate-200">
                <span>Bitrate</span>
                <input
                  type="checkbox"
                  checked={visibleCols.bitrate}
                  onchange={(e) => { visibleCols = { ...visibleCols, bitrate: (e.target as HTMLInputElement).checked }; }}
                  class="accent-cyan-400"
                />
              </label>
              <label class="flex items-center justify-between cursor-pointer text-slate-200">
                <span>Duración</span>
                <input
                  type="checkbox"
                  checked={visibleCols.duration}
                  onchange={(e) => { visibleCols = { ...visibleCols, duration: (e.target as HTMLInputElement).checked }; }}
                  class="accent-cyan-400"
                />
              </label>
            </div>
          {/if}
        </div>

        <button
          type="button"
          onclick={() => { showRadio = true; }}
          class="grid size-7 place-items-center rounded border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-cyan-500/60 hover:text-cyan-300"
          title="Cambiar a radio dentro de este panel"
          aria-label="Mostrar radio"
        >
          <RadioIcon size={13} />
        </button>

        <button
          type="button"
          onclick={() => { showStreamMusic = true; }}
          class="grid size-7 place-items-center rounded border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-cyan-500/60 hover:text-cyan-300"
          title="Mostrar Stream Music dentro de este panel"
          aria-label="Abrir Stream Music"
        >
          <Globe size={13} />
        </button>

        <button
          onclick={() => useMusicStore.getState().fetchLibraryTracks(search)}
          class="p-1.5 rounded hover:bg-audiophile-border text-audiophile-text transition-colors"
          title="Recargar canciones desde SQLite"
        >
          <RefreshCw size={13} />
        </button>
      </div>
    </div>

    <!-- Encabezado de columnas -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="h-8 bg-audiophile-base border-b border-audiophile-border text-[10px] font-mono text-audiophile-muted uppercase tracking-wider flex items-center px-3 shrink-0">
      <div
        onclick={() => handleSort("track_number")}
        class="w-10 text-center cursor-pointer flex items-center justify-center gap-1 group/col hover:text-white shrink-0"
        style="flex: 0 0 {columnWidths.track}%;"
      >
        <span>#</span>
        {@render renderSortIndicator("track_number")}
      </div>

      <div
        onclick={() => handleSort("title")}
        class="relative min-w-0 cursor-pointer flex items-center gap-1 group/col hover:text-white pr-2 truncate"
        style="flex: 0 0 {columnWidths.title}%;"
      >
        <span>Título</span>
        {@render renderSortIndicator("title")}
        {#if visibleCols.artist}
          <ColumnResizeHandle onResize={(delta) => resizeColumns("title", "artist", delta)} />
        {/if}
      </div>

      {#if visibleCols.artist}
        <div
          onclick={() => handleSort("artist")}
          class="relative cursor-pointer flex items-center gap-1 group/col hover:text-white shrink-0 pr-2 truncate"
          style="flex: 0 0 {columnWidths.artist}%;"
        >
          <span>Artista</span>
          {@render renderSortIndicator("artist")}
          {#if visibleCols.album}
            <ColumnResizeHandle onResize={(delta) => resizeColumns("artist", "album", delta)} />
          {/if}
        </div>
      {/if}

      {#if visibleCols.album}
        <div
          onclick={() => handleSort("album")}
          class="relative cursor-pointer flex items-center gap-1 group/col hover:text-white shrink-0 pr-2 truncate"
          style="flex: 0 0 {columnWidths.album}%;"
        >
          <span>Álbum</span>
          {@render renderSortIndicator("album")}
          {#if visibleCols.format}
            <ColumnResizeHandle onResize={(delta) => resizeColumns("album", "format", delta)} />
          {/if}
        </div>
      {/if}

      {#if visibleCols.format}
        <div
          onclick={() => handleSort("format")}
          class="relative w-20 text-center cursor-pointer flex items-center justify-center gap-1 group/col hover:text-white shrink-0"
          style="flex: 0 0 {columnWidths.format}%;"
        >
          <span>Formato</span>
          {@render renderSortIndicator("format")}
          {#if visibleCols.bitrate}
            <ColumnResizeHandle onResize={(delta) => resizeColumns("format", "bitrate", delta)} />
          {/if}
        </div>
      {/if}

      {#if visibleCols.bitrate}
        <div
          onclick={() => handleSort("bitrate_kbps")}
          class="relative w-20 text-right cursor-pointer flex items-center justify-end gap-1 group/col hover:text-white shrink-0 pr-2"
          style="flex: 0 0 {columnWidths.bitrate}%;"
        >
          <span>Bitrate</span>
          {@render renderSortIndicator("bitrate_kbps")}
          {#if visibleCols.duration}
            <ColumnResizeHandle onResize={(delta) => resizeColumns("bitrate", "duration", delta)} />
          {/if}
        </div>
      {/if}

      {#if visibleCols.duration}
        <div
          onclick={() => handleSort("duration_seconds")}
          class="w-16 text-right cursor-pointer flex items-center justify-end gap-1 group/col hover:text-white shrink-0"
          style="flex: 0 0 {columnWidths.duration}%;"
        >
          <span>Duración</span>
          {@render renderSortIndicator("duration_seconds")}
        </div>
      {/if}
    </div>

    <!-- Contenedor Virtualizado -->
    <div
      onscroll={handleScroll}
      class="flex-1 overflow-y-auto w-full relative"
    >
      {#if playbackSettings?.diffuseAlbumArt && currentCoverArt}
        <div
          class="pointer-events-none absolute inset-0 z-0 bg-cover bg-center filter blur-3xl transition-opacity duration-700"
          style="background-image: url({currentCoverArt}); opacity: {(playbackSettings.diffuseAlbumArtOpacity ?? 25) / 100};"
        ></div>
      {/if}

      {#if sortedTracks.length === 0}
        <div class="relative z-10 py-20 text-center text-audiophile-muted font-sans text-xs">
          {scanStatus.is_scanning
            ? "Indexando archivos de audio en segundo plano..."
            : "No se encontraron temas en la base de datos."}
        </div>
      {:else}
        <div
          class="relative z-10"
          style="height: {totalVirtualHeight}px; width: 100%; position: relative;"
        >
          {#each visibleItems as item (item.track.filepath)}
            <VirtualTrackRow
              track={item.track}
              index={item.index}
              top={item.top}
              height={ROW_HEIGHT}
              isCurrent={currentTrack?.filepath === item.track.filepath}
              {isPlaying}
              {columnWidths}
              {visibleCols}
              onDoubleClick={() => handleRowDoubleClick(item.track, item.index)}
              onContextMenu={(e) => handleContextMenu(e, item.track)}
            />
          {/each}
        </div>
      {/if}
    </div>

    <!-- Menú contextual -->
    {#if contextMenu}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        style="top: {contextMenu.y}px; left: {contextMenu.x}px;"
        class="fixed z-50 bg-audiophile-surface2 border border-audiophile-border shadow-2xl rounded p-1 font-mono text-[11px] text-audiophile-text flex flex-col min-w-[160px]"
        onclick={(e) => e.stopPropagation()}
      >
        <button
          onclick={() => {
            if (contextMenu) {
              useMusicStore.getState().setQueue([contextMenu.track], 0);
              closeContextMenu();
            }
          }}
          class="flex items-center gap-2 px-2.5 py-1.5 hover:bg-audiophile-cyan/20 hover:text-audiophile-cyan rounded text-left transition-colors"
        >
          <Play size={12} fill="currentColor" />
          <span>Reproducir ahora</span>
        </button>
        <button
          onclick={() => {
            if (contextMenu) {
              useMusicStore.getState().addToQueue(contextMenu.track);
              closeContextMenu();
            }
          }}
          class="flex items-center gap-2 px-2.5 py-1.5 hover:bg-audiophile-cyan/20 hover:text-audiophile-cyan rounded text-left transition-colors"
        >
          <Plus size={12} />
          <span>Añadir a la cola</span>
        </button>
      </div>
    {/if}

    <!-- Pie de estado -->
    <div class="h-6 px-3 border-t border-audiophile-border bg-audiophile-surface2 flex items-center justify-between text-[10px] font-mono text-audiophile-muted shrink-0">
      <span>{sortedTracks.length} canciones · {Math.floor(visibleDurationSeconds / 60)} min visibles</span>
      <span class="text-audiophile-green">VIRTUAL RENDERER: 60+ FPS</span>
    </div>
  </div>
{/if}
