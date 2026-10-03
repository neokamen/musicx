<script lang="ts">
  import {
    useMusicStore,
    explorerStore,
    librarySettingsStore,
    libraryTracksStore,
    appearanceStore,
  } from "../../store/index.ts";
import * as api from "../../services/api.ts";
  import {
    ChevronLeft,
    ChevronRight,
    ArrowUp,
    RefreshCw,
    HardDrive,
    Search,
    ArrowUpDown,
    ArrowUp as SortUp,
    ArrowDown as SortDown,
    SlidersHorizontal,
    House,
  } from "@lucide/svelte";
  import type { FileNode, Track } from "../../types/index.ts";
  import ColumnResizeHandle from "./ColumnResizeHandle.svelte";
  import FolderExplorerRow from "./FolderExplorerRow.svelte";

  type ExplorerColumn = "name" | "type" | "size" | "duration" | "bitrate" | "action";
  type ExplorerColumnWidths = Record<ExplorerColumn, number>;
  type FolderSortField = "name" | "extension" | "size" | "duration" | "bitrate";
  type FolderSortDir = "asc" | "desc";

  let explorer = $derived($explorerStore);
  let librarySettings = $derived($librarySettingsStore);
  let libraryTracks = $derived($libraryTracksStore);
  let appearance = $derived($appearanceStore);

  let inputPath = $state("");
  $effect(() => {
    if (inputPath !== explorer.currentPath) {
      inputPath = explorer.currentPath;
    }
  });

  let folderQuery = $state("");
  let libraryQuery = $state("");
  let sortField = $state<FolderSortField>("name");
  let sortDir = $state<FolderSortDir>("asc");
  let tableRef = $state<HTMLDivElement | null>(null);

  let columnWidths = $state<ExplorerColumnWidths>({
    name: 38,
    type: 9,
    size: 12,
    duration: 10,
    bitrate: 12,
    action: 19,
  });

  let visibleColumns = $state({
    type: true,
    size: true,
    duration: true,
    bitrate: true,
    action: true,
  });
  let isColMenuOpen = $state(false);

  const handleNavigate = (path: string) => {
    inputPath = path;
    useMusicStore.getState().browseDirectory(path);
  };

  const handleEntryPlay = async (entry: FileNode) => {
    let track: Track = {
      filepath: entry.path,
      title: entry.name.replace(/\.[^/.]+$/, ""),
      artist: "Explorador de Archivos",
      album: "Carpeta Local",
      track_number: null,
      duration_seconds: 0,
      format: entry.extension ? entry.extension.toUpperCase() : "AUDIO",
      sample_rate: 0,
      bit_depth: 0,
      bitrate_kbps: 0,
      file_size: entry.size,
      mtime: 0,
    };
    try {
      const meta = await api.getTrackMetadata(entry.path);
      if (meta && meta.duration_seconds > 0) {
        track = {
          ...track,
          title: meta.title || track.title,
          artist: meta.artist && meta.artist !== "Desconocido" ? meta.artist : track.artist,
          album: meta.album && meta.album !== "Desconocido" ? meta.album : track.album,
          duration_seconds: meta.duration_seconds,
          sample_rate: meta.sample_rate || 0,
          bit_depth: meta.bit_depth || 0,
          bitrate_kbps: meta.bitrate_kbps || 0,
          format: meta.format || track.format,
        };
      }
    } catch {}
    void useMusicStore.getState().play(track);
  };

  const handleEntryAddToQueue = async (entry: FileNode) => {
    let track: Track = {
      filepath: entry.path,
      title: entry.name.replace(/\.[^/.]+$/, ""),
      artist: "Explorador Local",
      album: "Cola",
      track_number: null,
      duration_seconds: 0,
      format: entry.extension ? entry.extension.toUpperCase() : "AUDIO",
      sample_rate: 0,
      bit_depth: 0,
      bitrate_kbps: 0,
      file_size: entry.size,
      mtime: 0,
    };
    try {
      const meta = await api.getTrackMetadata(entry.path);
      if (meta && meta.duration_seconds > 0) {
        track = {
          ...track,
          title: meta.title || track.title,
          artist: meta.artist && meta.artist !== "Desconocido" ? meta.artist : track.artist,
          album: meta.album && meta.album !== "Desconocido" ? meta.album : track.album,
          duration_seconds: meta.duration_seconds,
          sample_rate: meta.sample_rate || 0,
          bit_depth: meta.bit_depth || 0,
          bitrate_kbps: meta.bitrate_kbps || 0,
          format: meta.format || track.format,
        };
      }
    } catch {}
    useMusicStore.getState().addToQueue(track);
  };

  const handleAddFolderToQueue = async (entry: FileNode) => {
    try {
      const tracks = await api.scanFolderTracksRecursive(entry.path);
      if (tracks && tracks.length > 0) {
        useMusicStore.getState().addToQueue(tracks);
      }
    } catch (e) {
      console.error("Error al escanear carpeta recursivamente:", e);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      useMusicStore.getState().browseDirectory(inputPath);
    }
  };

  const handleColumnClick = (field: FolderSortField) => {
    if (sortField === field) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortField = field;
      sortDir = "asc";
    }
  };

  const handleColumnDoubleClick = (field: keyof typeof visibleColumns) => {
    visibleColumns = { ...visibleColumns, [field]: !visibleColumns[field] };
  };

  const resizeColumns = (left: ExplorerColumn, right: ExplorerColumn, deltaPixels: number) => {
    const totalWidth = tableRef?.clientWidth || 1;
    const delta = (deltaPixels / totalWidth) * 100;
    const adjusted = Math.max(5, Math.min(75, columnWidths[left] + delta));
    const appliedDelta = adjusted - columnWidths[left];
    columnWidths = {
      ...columnWidths,
      [left]: adjusted,
      [right]: Math.max(5, columnWidths[right] - appliedDelta),
    };
  };

  let sortedAndFilteredEntries = $derived.by(() => {
    return explorer.entries
      .filter((entry: FileNode) =>
        entry.name.toLowerCase().includes(folderQuery.toLowerCase())
      )
      .sort((a, b) => {
        if (a.is_dir && !b.is_dir) return -1;
        if (!a.is_dir && b.is_dir) return 1;

        let comp = 0;
        if (sortField === "name") {
          comp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
        } else if (sortField === "extension") {
          comp = (a.extension || "").localeCompare(b.extension || "");
        } else if (sortField === "size") {
          comp = a.size - b.size;
        } else if (sortField === "duration") {
          const durA = tracksByPath.get(a.path)?.duration_seconds || 0;
          const durB = tracksByPath.get(b.path)?.duration_seconds || 0;
          comp = durA - durB;
        } else if (sortField === "bitrate") {
          const bitA = tracksByPath.get(a.path)?.bitrate_kbps || 0;
          const bitB = tracksByPath.get(b.path)?.bitrate_kbps || 0;
          comp = bitA - bitB;
        }

        return sortDir === "asc" ? comp : -comp;
      });
  });

  let tracksByPath = $derived(new Map(libraryTracks.map((track) => [track.filepath, track])));
  let visibleKnownSeconds = $derived(
    sortedAndFilteredEntries.reduce((sum, entry) => {
      if (entry.is_dir) return sum;
      return sum + (tracksByPath.get(entry.path)?.duration_seconds || 0);
    }, 0)
  );
  let visibleUnindexedCount = $derived(
    sortedAndFilteredEntries.filter((entry) => !entry.is_dir && !tracksByPath.has(entry.path)).length
  );
</script>

{#snippet renderSortIcon(field: FolderSortField)}
  {#if sortField !== field}
    <ArrowUpDown size={10} class="opacity-0 group-hover:opacity-40" />
  {:else if sortDir === 'asc'}
    <SortUp size={10} style="color: {appearance.accentColor};" />
  {:else}
    <SortDown size={10} style="color: {appearance.accentColor};" />
  {/if}
{/snippet}

<div bind:this={tableRef} class="flex flex-col h-full w-full bg-audiophile-surface select-none font-sans overflow-hidden text-xs">
  <div class="p-2 border-b border-audiophile-border bg-audiophile-surface2 flex flex-col gap-2 shrink-0">
    <div class="flex items-center gap-1.5">
      <button
        onclick={() => useMusicStore.getState().navigateBack()}
        disabled={explorer.historyIndex <= 0}
        class="p-1 rounded hover:bg-audiophile-border text-audiophile-text disabled:opacity-30 transition-colors cursor-pointer"
        title="Atrás"
      >
        <ChevronLeft size={14} />
      </button>
      <button
        onclick={() => useMusicStore.getState().navigateForward()}
        disabled={explorer.historyIndex >= explorer.history.length - 1}
        class="p-1 rounded hover:bg-audiophile-border text-audiophile-text disabled:opacity-30 transition-colors cursor-pointer"
        title="Adelante"
      >
        <ChevronRight size={14} />
      </button>
      <button
        onclick={() => useMusicStore.getState().navigateUp()}
        class="p-1 rounded hover:bg-audiophile-border text-audiophile-text transition-colors cursor-pointer"
        title="Subir de nivel"
      >
        <ArrowUp size={14} />
      </button>
      <button
        onclick={() => librarySettings.explorerHomeFolder && handleNavigate(librarySettings.explorerHomeFolder)}
        disabled={!librarySettings.explorerHomeFolder}
        class="p-1 rounded hover:bg-audiophile-border text-audiophile-text transition-colors cursor-pointer disabled:opacity-40"
        title="Ir a la carpeta de inicio del explorador"
        aria-label="Ir a la carpeta de inicio del explorador"
      >
        <House size={14} />
      </button>
      <button
        onclick={() => useMusicStore.getState().browseDirectory(explorer.currentPath)}
        class="p-1 rounded hover:bg-audiophile-border text-audiophile-text transition-colors cursor-pointer"
        title="Refrescar carpeta"
      >
        <RefreshCw size={13} class={explorer.isLoading ? "animate-spin" : ""} />
      </button>
      <div class="flex-1 flex items-center bg-slate-950 border border-slate-800 rounded px-2 py-0.5 ml-1">
        <HardDrive size={12} class="text-cyan-400 mr-1.5 shrink-0" />
        <input
          type="text"
          bind:value={inputPath}
          onkeydown={handleKeyDown}
          placeholder="/home/usuario/Música"
          class="w-full bg-transparent font-mono text-[11px] text-slate-100 focus:outline-none"
        />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2 items-center">
      <div class="flex items-center bg-slate-950 border border-slate-800 rounded px-2 py-0.5">
        <Search size={11} class="text-slate-400 mr-1.5 shrink-0" />
        <input
          type="text"
          bind:value={folderQuery}
          placeholder="Filtrar en carpeta..."
          class="w-full bg-transparent text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none"
        />
      </div>

      <div class="flex items-center bg-slate-950 border border-slate-800 rounded px-2 py-0.5">
        <Search size={11} class="text-cyan-400 mr-1.5 shrink-0" />
        <input
          type="text"
          bind:value={libraryQuery}
          oninput={(e) => {
            const val = (e.target as HTMLInputElement).value;
            useMusicStore.getState().fetchLibraryTracks(val);
          }}
          placeholder="Filtrar en biblioteca..."
          class="w-full bg-transparent text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none"
        />
        {#if librarySettings.musicFolder}
          <button
            onclick={() => handleNavigate(librarySettings.musicFolder)}
            class="text-[9px] text-cyan-400 hover:text-cyan-300 ml-1 px-1 rounded bg-slate-900 border border-slate-800 font-mono shrink-0 cursor-pointer"
            title="Ir a carpeta raíz de biblioteca"
          >
            Raíz
          </button>
        {/if}
      </div>
    </div>
  </div>

  <!-- Header de Columnas -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="h-7 w-full min-w-0 overflow-hidden bg-slate-950 border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center shrink-0 select-none">
    <div
      onclick={() => handleColumnClick("name")}
      ondblclick={() => handleColumnDoubleClick("type")}
      class="relative min-w-0 cursor-pointer flex items-center gap-1 group hover:text-white truncate h-full"
      style="flex: 0 0 {columnWidths.name}%;"
      title="1 clic: ordenar / Doble clic: ocultar columna"
    >
      <span>Nombre</span>
      {@render renderSortIcon("name")}
      {#if visibleColumns.type}
        <ColumnResizeHandle onResize={(delta) => resizeColumns("name", "type", delta)} />
      {/if}
    </div>

    {#if visibleColumns.type}
      <div
        onclick={() => handleColumnClick("extension")}
        ondblclick={() => handleColumnDoubleClick("type")}
        class="relative min-w-0 overflow-hidden text-center cursor-pointer flex items-center justify-center gap-1 group hover:text-white shrink-0 h-full"
        style="flex: 0 0 {columnWidths.type}%;"
        title="1 clic: ordenar / Doble clic: ocultar columna"
      >
        <span>Tipo</span>
        {@render renderSortIcon("extension")}
        {#if visibleColumns.size}
          <ColumnResizeHandle onResize={(delta) => resizeColumns("type", "size", delta)} />
        {/if}
      </div>
    {/if}

    {#if visibleColumns.size}
      <div
        onclick={() => handleColumnClick("size")}
        ondblclick={() => handleColumnDoubleClick("size")}
        class="relative min-w-0 overflow-hidden text-right cursor-pointer flex items-center justify-end gap-1 group hover:text-white shrink-0 pr-2 h-full"
        style="flex: 0 0 {columnWidths.size}%;"
        title="1 clic: ordenar / Doble clic: ocultar columna"
      >
        <span>Tamaño</span>
        {@render renderSortIcon("size")}
        {#if visibleColumns.duration}
          <ColumnResizeHandle onResize={(delta) => resizeColumns("size", "duration", delta)} />
        {/if}
      </div>
    {/if}

    {#if visibleColumns.duration}
      <div
        onclick={() => handleColumnClick("duration")}
        ondblclick={() => handleColumnDoubleClick("duration")}
        class="relative min-w-0 overflow-hidden text-right cursor-pointer flex items-center justify-end gap-1 group hover:text-white shrink-0 pr-2 h-full"
        style="flex: 0 0 {columnWidths.duration}%;"
        title="1 clic: ordenar / Doble clic: ocultar columna"
      >
        <span>Duración</span>
        {@render renderSortIcon("duration")}
        {#if visibleColumns.bitrate}
          <ColumnResizeHandle onResize={(delta) => resizeColumns("duration", "bitrate", delta)} />
        {/if}
      </div>
    {/if}

    {#if visibleColumns.bitrate}
      <div
        onclick={() => handleColumnClick("bitrate")}
        ondblclick={() => handleColumnDoubleClick("bitrate")}
        class="relative min-w-0 overflow-hidden text-right cursor-pointer flex items-center justify-end gap-1 group hover:text-white shrink-0 pr-2 h-full"
        style="flex: 0 0 {columnWidths.bitrate}%;"
        title="1 clic: ordenar / Doble clic: ocultar columna"
      >
        <span>bit</span>
        {@render renderSortIcon("bitrate")}
        {#if visibleColumns.action}
          <ColumnResizeHandle onResize={(delta) => resizeColumns("bitrate", "action", delta)} />
        {/if}
      </div>
    {/if}

    {#if visibleColumns.action}
      <div class="relative min-w-0 overflow-hidden text-right pr-2 shrink-0 flex items-center justify-end gap-1 h-full" style="flex: 0 0 {columnWidths.action}%;">
        <span>Acción</span>
        <button
          onclick={() => { isColMenuOpen = !isColMenuOpen; }}
          class="p-0.5 rounded hover:text-white text-slate-500 cursor-pointer"
          title="Configurar columnas visibles"
        >
          <SlidersHorizontal size={10} />
        </button>
      </div>
    {/if}
  </div>

  {#if isColMenuOpen}
    <div class="bg-slate-900 border-b border-slate-800 p-2 flex items-center justify-between text-[10px] font-mono text-slate-300 gap-3">
      <span class="text-slate-400 font-bold">Columnas:</span>
      {#each (["type", "size", "duration", "bitrate", "action"] as const) as col}
        <label class="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={visibleColumns[col]}
            onchange={(e) => {
              visibleColumns = { ...visibleColumns, [col]: (e.target as HTMLInputElement).checked };
            }}
            class="accent-cyan-400"
          />
          <span class="capitalize">{col === "bitrate" ? "bit" : col}</span>
        </label>
      {/each}
      <button
        onclick={() => { isColMenuOpen = false; }}
        class="text-xs text-slate-400 hover:text-white px-1 cursor-pointer"
      >
        ✕
      </button>
    </div>
  {/if}

  <div class="flex-1 overflow-y-auto p-1 font-mono text-[11px]">
    {#if explorer.currentPath && explorer.currentPath !== "/"}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        ondblclick={() => useMusicStore.getState().navigateUp()}
        class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800/80 cursor-default text-cyan-400 font-bold mb-1 transition-colors"
        title="Subir de nivel en el directorio"
      >
        <ArrowUp size={13} class="text-cyan-400" />
        <span>..</span>
      </div>
    {/if}

    {#if explorer.error}
      <div class="p-4 text-center text-red-400 font-sans text-xs">
        {explorer.error}
      </div>
    {:else if sortedAndFilteredEntries.length === 0}
      <div class="p-4 text-center text-slate-500 font-sans text-xs">
        {explorer.isLoading
          ? "Cargando directorio..."
          : "Carpeta vacía o sin archivos coincidentes"}
      </div>
    {:else}
      {#each sortedAndFilteredEntries as entry (entry.path)}
        {@const track = tracksByPath.get(entry.path)}
        {@const dur = track?.duration_seconds ?? null}
        {@const bitrate = track?.bitrate_kbps ?? (dur && dur > 0 && entry.size > 0 ? Math.round((entry.size * 8) / (dur * 1000)) : null)}
        <FolderExplorerRow
          {entry}
          {visibleColumns}
          {columnWidths}
          durationSeconds={dur}
          bitrateKbps={bitrate}
          onPlay={handleEntryPlay}
          onAddToQueue={handleEntryAddToQueue}
          onAddFolderToQueue={handleAddFolderToQueue}
          onNavigate={handleNavigate}
        />
      {/each}
    {/if}
  </div>

  <div class="h-7 px-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between gap-3 text-[10px] font-mono text-slate-400">
    <span class="shrink-0">{sortedAndFilteredEntries.length} elementos · {Math.floor(visibleKnownSeconds / 60)} min{visibleUnindexedCount > 0 ? ` · ${visibleUnindexedCount} sin indexar` : ""}</span>
    <span class="text-cyan-400 truncate max-w-[220px]" title={explorer.currentPath}>
      {explorer.currentPath}
    </span>
  </div>
</div>
