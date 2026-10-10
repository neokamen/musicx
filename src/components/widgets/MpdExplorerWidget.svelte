<script lang="ts">
  import { onMount } from "svelte";
  import {
    Folder,
    FileAudio,
    CornerLeftUp,
    Play,
    Plus,
    Download,
    RefreshCw,
    Search,
    Server,
    ExternalLink,
  } from "@lucide/svelte";
  import { useMusicStore, appearanceStore } from "../../store/index.ts";
  import type { MpdDirectoryItem, MpdConfig } from "../../types/mpd";
  import {
    getSavedMpdConfig,
    mpdListDirectory,
    resolveMpdTrackPath,
    mpdTransferFiles,
  } from "../../services/mpdService";

  const appearance = $derived($appearanceStore);

  let config = $state<MpdConfig>(getSavedMpdConfig());
  let currentDirectory = $state("");
  let directoryItems = $state<MpdDirectoryItem[]>([]);
  let isLoading = $state(false);
  let searchQuery = $state("");
  let errorMessage = $state<string | null>(null);

  async function loadDirectory(path: string) {
    isLoading = true;
    errorMessage = null;
    try {
      config = getSavedMpdConfig();
      const items = await mpdListDirectory(config.host, config.port, config.password, path);
      directoryItems = items;
      currentDirectory = path;
    } catch (e: any) {
      errorMessage = e?.message || String(e);
    } finally {
      isLoading = false;
    }
  }

  function navigateToParent() {
    if (!currentDirectory) return;
    const parts = currentDirectory.split("/").filter(Boolean);
    parts.pop();
    void loadDirectory(parts.join("/"));
  }

  function navigateToSubfolder(folderPath: string) {
    void loadDirectory(folderPath);
  }

  function navigateBreadcrumb(index: number, parts: string[]) {
    if (index < 0) {
      void loadDirectory("");
    } else {
      const target = parts.slice(0, index + 1).join("/");
      void loadDirectory(target);
    }
  }

  function addToQueue(item: MpdDirectoryItem, playNow = false) {
    const store = useMusicStore.getState();
    const resolved = resolveMpdTrackPath(item.path, config);

    const track = {
      filepath: resolved,
      title: item.title || item.name.replace(/\.[^/.]+$/, ""),
      artist: item.artist || "MPD Network",
      album: item.album || "Red MPD",
      duration_seconds: item.duration || 0,
      format: item.format || "MPD",
      bitrate_kbps: 0,
      sample_rate: 44100,
      bit_depth: 16,
      file_size: item.size,
      mtime: item.last_modified_timestamp,
      stream_source: "MPD",
    };

    if (playNow) {
      void store.play(track as any);
    } else {
      store.addToQueue(track as any);
    }
  }

  function addAllFolderToQueue() {
    const audioItems = directoryItems.filter((i) => !i.is_directory);
    if (audioItems.length === 0) return;

    const tracks = audioItems.map((item) => ({
      filepath: resolveMpdTrackPath(item.path, config),
      title: item.title || item.name.replace(/\.[^/.]+$/, ""),
      artist: item.artist || "MPD Network",
      album: item.album || "Red MPD",
      duration_seconds: item.duration || 0,
      format: item.format || "MPD",
      bitrate_kbps: 0,
      sample_rate: 44100,
      bit_depth: 16,
      file_size: item.size,
      mtime: item.last_modified_timestamp,
      stream_source: "MPD",
    }));

    useMusicStore.getState().addToQueue(tracks as any);
  }

  async function downloadItem(item: MpdDirectoryItem) {
    const localDir = useMusicStore.getState().librarySettings?.musicFolder;
    if (!localDir || !config.remote_mount_path) {
      useMusicStore.getState().setMpdHubOpen(true);
      return;
    }
    try {
      await mpdTransferFiles(
        "download_from_mpd",
        [item.path],
        localDir,
        config.remote_mount_path,
        config
      );
    } catch (e) {
      console.error("Error al descargar archivo de MPD:", e);
    }
  }

  const breadcrumbParts = $derived(
    currentDirectory ? currentDirectory.split("/").filter(Boolean) : []
  );

  const filteredItems = $derived(
    directoryItems.filter((i) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        i.name.toLowerCase().includes(q) ||
        (i.title && i.title.toLowerCase().includes(q)) ||
        (i.artist && i.artist.toLowerCase().includes(q)) ||
        (i.album && i.album.toLowerCase().includes(q))
      );
    })
  );

  onMount(() => {
    void loadDirectory("");
  });
</script>

<div class="flex flex-col h-full w-full bg-audiophile-surface border border-audiophile-border rounded-lg overflow-hidden text-slate-100 font-sans">
  <!-- Header Bar -->
  <div class="flex items-center justify-between px-3 py-2 border-b border-audiophile-border bg-audiophile-surface2 shrink-0 select-none">
    <div class="flex items-center gap-2">
      <Server size={14} style="color: {appearance.accentColor || '#06b6d4'};" />
      <span class="text-xs font-bold text-white font-mono">MPD Explorador de Red</span>
    </div>

    <div class="flex items-center gap-1.5">
      <button
        type="button"
        onclick={addAllFolderToQueue}
        class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-audiophile-surface border border-audiophile-border hover:border-audiophile-cyan text-slate-200 transition cursor-pointer"
        title="Añadir toda la carpeta actual a la cola"
      >
        <Plus size={11} class="text-audiophile-cyan" />
        <span>+ Carpeta</span>
      </button>

      <button
        type="button"
        onclick={() => void loadDirectory(currentDirectory)}
        class="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer"
        title="Recargar directorio"
      >
        <RefreshCw size={12} class={isLoading ? "animate-spin text-audiophile-cyan" : ""} />
      </button>

      <button
        type="button"
        onclick={() => useMusicStore.getState().setMpdHubOpen(true)}
        class="p-1 rounded text-slate-400 hover:text-audiophile-cyan transition cursor-pointer"
        title="Abrir Centro MPD completo"
      >
        <ExternalLink size={12} />
      </button>
    </div>
  </div>

  <!-- Breadcrumbs & Search -->
  <div class="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-slate-800/80 bg-slate-900/60 shrink-0 text-xs">
    <div class="flex items-center gap-1 font-mono text-[11px] overflow-x-auto truncate max-w-[65%]">
      <button
        type="button"
        onclick={() => navigateBreadcrumb(-1, [])}
        class="text-slate-400 hover:text-white font-semibold transition cursor-pointer shrink-0"
      >
        Raíz
      </button>
      {#each breadcrumbParts as part, idx}
        <span class="text-slate-600">/</span>
        <button
          type="button"
          onclick={() => navigateBreadcrumb(idx, breadcrumbParts)}
          class="text-slate-300 hover:text-audiophile-cyan transition cursor-pointer truncate max-w-[120px]"
        >
          {part}
        </button>
      {/each}
    </div>

    <div class="relative w-36 sm:w-44 shrink-0">
      <Search size={11} class="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Filtrar..."
        class="w-full pl-6 pr-2 py-0.5 rounded border border-audiophile-border bg-slate-950 text-[11px] text-white placeholder-slate-600 focus:outline-none focus:border-audiophile-cyan font-mono"
      />
    </div>
  </div>

  <!-- Content List -->
  <div class="flex-1 overflow-y-auto min-h-0">
    {#if isLoading}
      <div class="flex items-center justify-center py-12 gap-2 text-xs text-slate-400">
        <RefreshCw size={14} class="animate-spin text-audiophile-cyan" />
        <span>Cargando disco en red...</span>
      </div>
    {:else if errorMessage}
      <div class="p-4 text-center text-xs text-rose-400 space-y-2">
        <p>No se pudo conectar a MPD: {errorMessage}</p>
        <button
          type="button"
          onclick={() => useMusicStore.getState().setMpdHubOpen(true)}
          class="px-2.5 py-1 rounded bg-slate-800 text-xs text-white hover:bg-slate-700 cursor-pointer"
        >
          Configurar Conexión MPD
        </button>
      </div>
    {:else}
      <table class="w-full text-left text-xs border-collapse">
        <tbody class="divide-y divide-slate-900/80 font-sans">
          <!-- Parent Directory Row (..) -->
          {#if currentDirectory}
            <tr
              class="hover:bg-slate-900/60 transition group cursor-pointer bg-slate-950/40"
              onclick={navigateToParent}
            >
              <td class="py-1.5 px-3 flex items-center gap-2 text-audiophile-cyan font-semibold">
                <CornerLeftUp size={14} class="shrink-0" />
                <span>.. (Carpeta anterior)</span>
              </td>
              <td class="py-1.5 px-3 text-right text-slate-500 text-[10px] font-mono">Subir</td>
            </tr>
          {/if}

          {#each filteredItems as item}
            <tr class="hover:bg-slate-900/50 transition group">
              <!-- Name / Folder -->
              <td class="py-1.5 px-3 min-w-0">
                {#if item.is_directory}
                  <button
                    type="button"
                    onclick={() => navigateToSubfolder(item.path)}
                    class="flex items-center gap-2 font-medium text-slate-200 hover:text-audiophile-cyan transition cursor-pointer text-left truncate w-full"
                  >
                    <Folder size={14} class="text-amber-400 shrink-0" />
                    <span class="truncate">{item.name}</span>
                  </button>
                {:else}
                  <div class="flex items-center gap-2 text-slate-200 truncate">
                    <FileAudio size={14} class="text-audiophile-cyan shrink-0" />
                    <span class="truncate font-medium">{item.title || item.name}</span>
                    {#if item.artist}
                      <span class="text-[10px] text-slate-500 truncate hidden sm:inline">
                        • {item.artist}
                      </span>
                    {/if}
                  </div>
                {/if}
              </td>

              <!-- Actions -->
              <td class="py-1.5 px-3 text-right shrink-0 whitespace-nowrap">
                {#if !item.is_directory}
                  <div class="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100">
                    <button
                      type="button"
                      onclick={() => addToQueue(item, true)}
                      class="p-1 rounded bg-slate-800 text-slate-200 hover:bg-audiophile-cyan hover:text-black transition cursor-pointer"
                      title="Reproducir ahora en MusicX"
                    >
                      <Play size={11} />
                    </button>
                    <button
                      type="button"
                      onclick={() => addToQueue(item, false)}
                      class="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-semibold text-slate-300 hover:text-white transition cursor-pointer"
                      title="Añadir a la cola"
                    >
                      + Cola
                    </button>
                    <button
                      type="button"
                      onclick={() => void downloadItem(item)}
                      class="p-1 rounded bg-slate-800 text-emerald-400 hover:bg-emerald-500 hover:text-black transition cursor-pointer"
                      title="Descargar a local"
                    >
                      <Download size={11} />
                    </button>
                  </div>
                {:else}
                  <button
                    type="button"
                    onclick={() => navigateToSubfolder(item.path)}
                    class="text-[10px] font-mono font-semibold text-slate-400 hover:text-audiophile-cyan transition cursor-pointer"
                  >
                    Abrir
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
