<script lang="ts">
  import { useMusicStore } from "../../store/index.ts";
  import {
    Folder,
    ChevronLeft,
    ChevronRight,
    ArrowUp,
    RefreshCw,
    Music,
    HardDrive,
    Search,
    Plus,
    Play,
    Database,
    Radio,
    List,
    Table,
    LayoutGrid,
    House,
  } from "@lucide/svelte";
  import type { FileNode } from "../../types/index.ts";

  type ExplorerViewMode = "compact" | "details" | "grid";

  let explorer = $derived($useMusicStore.explorer);
  let appearance = $derived($useMusicStore.appearance);
  let scanStatus = $derived($useMusicStore.scanStatus);
  let librarySettings = $derived($useMusicStore.librarySettings);

  let filterQuery = $state("");
  let isEditingPath = $state(false);
  let customPath = $state("");
  let viewMode = $state<ExplorerViewMode>("compact");

  $effect(() => {
    customPath = explorer.currentPath;
  });

  let pathParts = $derived(explorer.currentPath.split("/").filter(Boolean));

  const handleBreadcrumbClick = (index: number) => {
    const target = "/" + pathParts.slice(0, index + 1).join("/");
    useMusicStore.getState().browseDirectory(target);
  };

  const handleCustomPathSubmit = (e: Event) => {
    e.preventDefault();
    isEditingPath = false;
    if (customPath.trim()) {
      useMusicStore.getState().browseDirectory(customPath.trim());
    }
  };

  const handleEntryClick = (entry: FileNode) => {
    if (entry.is_dir) {
      useMusicStore.getState().browseDirectory(entry.path);
    } else {
      void useMusicStore.getState().play({
        filepath: entry.path,
        title: entry.name.replace(/\.[^/.]+$/, ""),
        artist: "Desconocido",
        album: "Directorio Local",
        track_number: null,
        duration_seconds: 0,
        format: entry.extension ? entry.extension.toUpperCase() : "AUDIO",
        sample_rate: 0,
        bit_depth: 0,
        bitrate_kbps: 0,
        file_size: entry.size,
        mtime: 0,
      });
    }
  };

  let filteredEntries = $derived(
    explorer.entries.filter((entry: FileNode) =>
      entry.name.toLowerCase().includes(filterQuery.toLowerCase())
    )
  );
</script>

<div class="flex flex-col h-full w-full bg-audiophile-surface select-none font-sans overflow-hidden text-xs">
  <!-- Barra Superior de Herramientas y Navegación Dolphin -->
  <div class="p-2 border-b border-audiophile-border bg-audiophile-surface2 flex flex-col gap-2 shrink-0">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-1">
        <button
          onclick={() => useMusicStore.getState().navigateBack()}
          disabled={explorer.historyIndex <= 0}
          class="p-1.5 rounded hover:bg-audiophile-surface text-audiophile-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          title="Atrás"
        >
          <ChevronLeft size={14} />
        </button>

        <button
          onclick={() => useMusicStore.getState().navigateForward()}
          disabled={explorer.historyIndex >= explorer.history.length - 1}
          class="p-1.5 rounded hover:bg-audiophile-surface text-audiophile-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          title="Adelante"
        >
          <ChevronRight size={14} />
        </button>

        <button
          onclick={() => useMusicStore.getState().navigateUp()}
          disabled={explorer.currentPath === "/"}
          class="p-1.5 rounded hover:bg-audiophile-surface text-audiophile-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          title="Subir un nivel (Directorio Superior)"
        >
          <ArrowUp size={14} />
        </button>

        <button
          onclick={() => librarySettings.explorerHomeFolder && useMusicStore.getState().browseDirectory(librarySettings.explorerHomeFolder)}
          disabled={!librarySettings.explorerHomeFolder}
          class="p-1.5 rounded hover:bg-audiophile-surface text-audiophile-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          title="Ir a la carpeta de inicio del explorador"
        >
          <House size={14} />
        </button>

        <button
          onclick={() => useMusicStore.getState().browseDirectory(explorer.currentPath)}
          class="p-1.5 rounded hover:bg-audiophile-surface text-audiophile-muted transition-colors"
          title="Recargar carpeta actual"
        >
          <RefreshCw size={12} class={explorer.isLoading ? "animate-spin text-audiophile-cyan" : ""} />
        </button>

        <!-- Selector de Modos de Vista Estilo Dolphin -->
        <div class="flex items-center ml-2 border border-audiophile-border rounded overflow-hidden bg-audiophile-base p-0.5">
          <button
            onclick={() => { viewMode = "compact"; }}
            class="p-1 rounded transition-colors {viewMode === 'compact' ? 'bg-cyan-950/60 text-cyan-300 font-bold' : 'text-slate-400 hover:text-white'}"
            title="Lista Compacta"
          >
            <List size={13} />
          </button>
          <button
            onclick={() => { viewMode = "details"; }}
            class="p-1 rounded transition-colors {viewMode === 'details' ? 'bg-cyan-950/60 text-cyan-300 font-bold' : 'text-slate-400 hover:text-white'}"
            title="Lista de Detalles"
          >
            <Table size={13} />
          </button>
          <button
            onclick={() => { viewMode = "grid"; }}
            class="p-1 rounded transition-colors {viewMode === 'grid' ? 'bg-cyan-950/60 text-cyan-300 font-bold' : 'text-slate-400 hover:text-white'}"
            title="Cuadrícula de Íconos"
          >
            <LayoutGrid size={13} />
          </button>
        </div>
      </div>

      <!-- Botón de Sincronización e Indexación en SQLite -->
      <button
        onclick={() => useMusicStore.getState().startDirectoryScan(explorer.currentPath)}
        disabled={scanStatus.is_scanning}
        class="px-2.5 py-1 rounded text-[10px] font-mono flex items-center gap-1.5 transition-all shrink-0 active:scale-95 {scanStatus.is_scanning ? 'bg-amber-950/60 text-amber-300 border border-amber-600' : 'bg-slate-900 border border-slate-700 hover:border-cyan-400 text-cyan-300'}"
        title="Indexar carpeta recursivamente a la base de datos"
      >
        {#if scanStatus.is_scanning}
          <RefreshCw size={11} class="animate-spin text-amber-400" />
          <span>
            Sincronizando ({scanStatus.current}/{scanStatus.total})
          </span>
        {:else}
          <Database size={11} />
          <span>Sincronizar Biblioteca</span>
        {/if}
      </button>
    </div>

    <!-- Breadcrumbs interactivos y clicables -->
    <div class="flex items-center bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono overflow-x-auto whitespace-nowrap scrollbar-none">
      <HardDrive size={12} style="color: {appearance.accentColor};" class="mr-1.5 shrink-0" />

      {#if isEditingPath}
        <form onsubmit={handleCustomPathSubmit} class="flex-1">
          <!-- svelte-ignore a11y_autofocus -->
          <input
            type="text"
            autofocus
            bind:value={customPath}
            onblur={() => { isEditingPath = false; }}
            class="w-full bg-transparent text-slate-200 focus:outline-none"
          />
        </form>
      {:else}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="flex items-center gap-1 flex-1 cursor-text"
          ondblclick={() => {
            customPath = explorer.currentPath;
            isEditingPath = true;
          }}
        >
          <button
            onclick={() => useMusicStore.getState().browseDirectory("/")}
            class="hover:text-cyan-400 text-slate-400 font-bold transition-colors"
          >
            /
          </button>
          {#each pathParts as part, index (part + '-' + index)}
            <button
              onclick={() => handleBreadcrumbClick(index)}
              class="hover:text-cyan-400 text-slate-300 hover:underline truncate max-w-[120px] transition-colors"
              title={part}
            >
              {part}
            </button>
            {#if index < pathParts.length - 1}
              <span class="text-slate-600">/</span>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    <!-- Filtro rápido local -->
    <div class="flex items-center bg-slate-950/80 border border-slate-800 rounded px-2 py-0.5">
      <Search size={11} class="text-slate-500 mr-1.5 shrink-0" />
      <input
        type="text"
        bind:value={filterQuery}
        placeholder="Filtrar en esta carpeta..."
        class="w-full bg-transparent text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none"
      />
    </div>
  </div>

  <!-- Vista de Archivos y Carpetas -->
  <div class="flex-1 overflow-y-auto p-1 font-mono text-[11px]">
    {#if explorer.error}
      <div class="p-6 text-center text-red-400 font-sans text-xs">
        {explorer.error}
      </div>
    {:else if filteredEntries.length === 0 && explorer.currentPath === "/"}
      <div class="p-8 text-center text-slate-500 font-sans text-xs flex flex-col items-center gap-2">
        <Radio size={24} class="text-slate-700" />
        <span>
          {explorer.isLoading
            ? "Cargando directorio..."
            : "No se encontraron carpetas ni pistas de audio compatibles"}
        </span>
      </div>
    {:else}
      <!-- 1. MODO COMPACTO -->
      {#if viewMode === "compact"}
        <div class="flex flex-col gap-0.5">
          {#if explorer.currentPath !== "/"}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              ondblclick={() => useMusicStore.getState().navigateUp()}
              onclick={() => useMusicStore.getState().navigateUp()}
              class="flex items-center gap-2.5 px-2.5 py-1.5 rounded hover:bg-slate-800/70 cursor-pointer text-slate-400 hover:text-cyan-300 font-bold transition-colors"
            >
              <Folder size={14} class="text-amber-400 shrink-0" />
              <span>.. [Directorio Superior]</span>
            </div>
          {/if}

          {#each filteredEntries as entry (entry.path)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              ondblclick={() => handleEntryClick(entry)}
              class="flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-slate-800/60 cursor-pointer group transition-colors"
            >
              <div class="flex items-center gap-2.5 overflow-hidden flex-1">
                {#if entry.is_dir}
                  <Folder size={14} class="text-amber-400 shrink-0" />
                {:else}
                  <Music size={14} style="color: {appearance.accentColor};" class="shrink-0" />
                {/if}
                <span class="truncate text-slate-300 hover-marquee">
                  {entry.name}
                </span>
              </div>

              {#if !entry.is_dir}
                <div class="flex items-center gap-2 shrink-0 text-slate-400 text-[10px]">
                  {#if entry.extension}
                    <span
                      class="uppercase px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-[9px] font-semibold"
                      style="color: {appearance.accentColor};"
                    >
                      {entry.extension}
                    </span>
                  {/if}
                  <span>{(entry.size / (1024 * 1024)).toFixed(1)} MB</span>
                  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        handleEntryClick(entry);
                      }}
                      class="p-1 hover:text-cyan-300"
                      title="Reproducir ahora"
                    >
                      <Play size={11} fill="currentColor" />
                    </button>
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        useMusicStore.getState().addToQueue({
                          filepath: entry.path,
                          title: entry.name.replace(/\.[^/.]+$/, ""),
                          artist: "Desconocido",
                          album: "Directorio Local",
                          track_number: null,
                          duration_seconds: 0,
                          format: entry.extension ? entry.extension.toUpperCase() : "AUDIO",
                          sample_rate: 0,
                          bit_depth: 0,
                          bitrate_kbps: 0,
                          file_size: entry.size,
                          mtime: 0,
                        });
                      }}
                      class="p-1 hover:text-cyan-300"
                      title="Añadir a la cola"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {:else if viewMode === "details"}
        <!-- 2. MODO DETALLES -->
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-slate-800 text-[10px] text-slate-400 uppercase font-sans">
              <th class="p-2">Nombre</th>
              <th class="p-2 w-24">Tipo</th>
              <th class="p-2 w-28 text-right">Tamaño</th>
              <th class="p-2 w-16 text-center">Acción</th>
            </tr>
          </thead>
          <tbody>
            {#if explorer.currentPath !== "/"}
              <tr
                onclick={() => useMusicStore.getState().navigateUp()}
                class="hover:bg-slate-800/60 cursor-pointer text-slate-400 hover:text-cyan-300 font-bold transition-colors"
              >
                <td class="p-2 flex items-center gap-2">
                  <Folder size={14} class="text-amber-400 shrink-0" />
                  <span>.. [Directorio Superior]</span>
                </td>
                <td class="p-2 text-[10px]">Carpeta</td>
                <td class="p-2 text-right text-[10px]">---</td>
                <td class="p-2"></td>
              </tr>
            {/if}

            {#each filteredEntries as entry (entry.path)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <tr
                ondblclick={() => handleEntryClick(entry)}
                class="hover:bg-slate-800/60 cursor-pointer group transition-colors"
              >
                <td class="p-2 flex items-center gap-2 truncate">
                  {#if entry.is_dir}
                    <Folder size={14} class="text-amber-400 shrink-0" />
                  {:else}
                    <Music size={14} style="color: {appearance.accentColor};" class="shrink-0" />
                  {/if}
                  <span class="truncate text-slate-300 hover-marquee">
                    {entry.name}
                  </span>
                </td>
                <td class="p-2 text-slate-400 text-[10px] uppercase">
                  {entry.is_dir ? "Carpeta" : entry.extension || "Audio"}
                </td>
                <td class="p-2 text-right text-slate-400 text-[10px]">
                  {entry.is_dir ? "---" : `${(entry.size / (1024 * 1024)).toFixed(2)} MB`}
                </td>
                <td class="p-2 text-center">
                  {#if !entry.is_dir}
                    <button
                      onclick={() => handleEntryClick(entry)}
                      class="p-1 hover:text-cyan-300 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Reproducir"
                    >
                      <Play size={11} fill="currentColor" />
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else if viewMode === "grid"}
        <!-- 3. MODO CUADRÍCULA -->
        <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 p-2">
          {#if explorer.currentPath !== "/"}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              onclick={() => useMusicStore.getState().navigateUp()}
              class="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 hover:border-cyan-400 cursor-pointer flex flex-col items-center justify-center gap-2 text-center group transition"
            >
              <Folder size={28} class="text-amber-400 group-hover:scale-110 transition-transform" />
              <span class="text-[10px] font-bold text-slate-400 group-hover:text-cyan-300 truncate w-full">
                .. [Subir]
              </span>
            </div>
          {/if}

          {#each filteredEntries as entry (entry.path)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              ondblclick={() => handleEntryClick(entry)}
              class="p-3 rounded-lg bg-slate-900/40 border border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700 cursor-pointer flex flex-col items-center justify-center gap-2 text-center group transition"
            >
              {#if entry.is_dir}
                <Folder size={28} class="text-amber-400 group-hover:scale-110 transition-transform" />
              {:else}
                <Music size={28} style="color: {appearance.accentColor};" class="group-hover:scale-110 transition-transform" />
              {/if}
              <span class="text-[10px] text-slate-300 group-hover:text-white truncate w-full">
                {entry.name}
              </span>
              {#if !entry.is_dir}
                <span class="text-[9px] text-slate-500 uppercase font-mono">
                  {entry.extension || "audio"}
                </span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>
