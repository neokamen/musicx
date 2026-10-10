<script lang="ts">
  import { onMount } from "svelte";
  import {
    X,
    Server,
    HardDrive,
    RefreshCw,
    FolderTree,
    Download,
    Upload,
    Play,
    Pause,
    Square,
    SkipForward,
    SkipBack,
    CornerLeftUp,
    Volume2,
    VolumeX,
    Sparkles,
    Network,
    Plus,
    Search,
    FolderOpen,
    FileAudio,
    Clock,
    Wifi,
    CheckCircle2,
    AlertCircle,
    Sliders,
    Folder,
    ArrowUpDown,
    Radio,
    Repeat,
    Shuffle,
    Trash2,
    Columns,
    List,
    Speaker,
    SlidersHorizontal,
    Music,
    ArrowRight,
    ArrowLeft,
    Check,
  } from "@lucide/svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import { listen } from "@tauri-apps/api/event";
  import {
    useMusicStore,
    appearanceStore,
    librarySettingsStore,
    isMpdHubOpenStore,
  } from "../../store/index.ts";
  import type {
    MpdConfig,
    MpdServerStatus,
    MpdDiscoveredServer,
    MpdDirectoryItem,
    MpdSongItem,
    MpdOutputDevice,
    LibraryDiffResult,
    MpdTransferProgress,
  } from "../../types/mpd";
  import {
    getSavedMpdConfig,
    saveMpdConfig,
    mpdGetStatus,
    mpdDiscoverServers,
    mpdListDirectory,
    mpdSendCommand,
    mpdCompareLibraries,
    mpdTransferFiles,
    resolveMpdTrackPath,
    mpdGetPlaylistInfo,
    mpdGetOutputs,
    mpdResolveBasePath,
    mpdDeleteItem,
    extractMpdRelativeBase,
  } from "../../services/mpdService";

  const appearance = $derived($appearanceStore);
  const librarySettings = $derived($librarySettingsStore);
  const isOpen = $derived($isMpdHubOpenStore);

  // Tabs
  type Tab = "server" | "control" | "explorer" | "sync";
  let activeTab = $state<Tab>("server");

  // Configuration state
  let config = $state<MpdConfig>(getSavedMpdConfig());
  let serverStatus = $state<MpdServerStatus | null>(null);
  let isConnecting = $state(false);
  let isDiscovering = $state(false);
  let discoveredServers = $state<MpdDiscoveredServer[]>([]);
  let autoRefreshTimer: number | null = null;

  // Control tab state
  let mpdPlaylist = $state<MpdSongItem[]>([]);
  let mpdOutputs = $state<MpdOutputDevice[]>([]);
  let isLoadingPlaylist = $state(false);
  let isLoadingOutputs = $state(false);
  let crossfadeSecs = $state(0);
  let isUpdatingDb = $state(false);

  // Explorer state
  let currentDirectory = $state("");
  let directoryItems = $state<MpdDirectoryItem[]>([]);
  let isLoadingDirectory = $state(false);
  let explorerSearch = $state("");

  // Sync / Match state
  let isComparing = $state(false);
  let diffResult = $state<LibraryDiffResult | null>(null);
  let diffFilter = $state<"all" | "only_mpd" | "only_local" | "modified" | "in_sync">("all");
  let diffSearch = $state("");
  let selectedDiffPaths = $state<Set<string>>(new Set());
  let syncViewMode = $state<"list" | "filezilla">("filezilla");
  let syncLocalSearch = $state("");
  let syncRemoteSearch = $state("");

  // Deletion modal state
  let deleteConfirmModal = $state<{
    target: "local" | "remote";
    path: string;
    name: string;
    isDirectory: boolean;
  } | null>(null);

  // Transfer state
  let isTransferring = $state(false);
  let transferProgress = $state<MpdTransferProgress | null>(null);

  // Volume state
  let remoteVolume = $state(50);
  let isMuted = $state(false);
  let prevVolume = 50;

  $effect(() => {
    if (serverStatus?.connected && serverStatus.volume >= 0 && !isMuted) {
      remoteVolume = serverStatus.volume;
    }
  });

  // Status message banner
  let toastMessage = $state<{ text: string; type: "success" | "error" | "info" } | null>(null);
  let toastTimeout: number | null = null;

  function showToast(text: string, type: "success" | "error" | "info" = "info") {
    if (toastTimeout) window.clearTimeout(toastTimeout);
    toastMessage = { text, type };
    toastTimeout = window.setTimeout(() => {
      toastMessage = null;
    }, 4000);
  }

  function closeModal() {
    useMusicStore.getState().setMpdHubOpen(false);
  }

  // Save config on changes
  function handleSaveConfig() {
    saveMpdConfig(config);
    showToast("Ajustes de MPD guardados correctamente", "success");
  }

  // Connect & Ping MPD
  async function checkConnection(silent = false) {
    if (!silent) isConnecting = true;
    try {
      const status = await mpdGetStatus(config.host, config.port, config.password);
      serverStatus = status;
      if (status.connected) {
        saveMpdConfig(config);
        if (!silent) showToast(`Conectado a MPD ${status.version} (${status.ping_ms}ms)`, "success");
      } else if (!silent) {
        showToast(status.error || "No se pudo conectar al servidor MPD", "error");
      }
    } catch (e: any) {
      if (!silent) showToast(`Error de conexión: ${e?.message || e}`, "error");
    } finally {
      if (!silent) isConnecting = false;
    }
  }

  // Auto-discover servers on local network
  async function runAutoDiscovery() {
    isDiscovering = true;
    try {
      const servers = await mpdDiscoverServers();
      discoveredServers = servers;
      if (servers.length > 0) {
        showToast(`Se han detectado ${servers.length} servidor(es) MPD en tu red`, "success");
      } else {
        showToast("No se encontraron servidores MPD en la red local (escaneo de puerto 6600)", "info");
      }
    } catch (e: any) {
      showToast(`Error al escanear la red: ${e?.message || e}`, "error");
    } finally {
      isDiscovering = false;
    }
  }

  function selectDiscoveredServer(server: MpdDiscoveredServer) {
    config.host = server.host;
    config.port = server.port;
    handleSaveConfig();
    void checkConnection();
  }

  // Browse local mounted folder
  async function chooseRemoteMountPath() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Seleccionar carpeta montada del disco duro en red (MPD)",
      });
      if (selected && typeof selected === "string") {
        config.remote_mount_path = selected;
        handleSaveConfig();
      }
    } catch (e) {
      console.error("Error abriendo selector de carpeta:", e);
    }
  }

  // Explorer operations
  async function loadDirectory(path: string) {
    isLoadingDirectory = true;
    try {
      const items = await mpdListDirectory(config.host, config.port, config.password, path);
      directoryItems = items;
      currentDirectory = path;
    } catch (e: any) {
      showToast(`Error explorando carpeta de red: ${e?.message || e}`, "error");
    } finally {
      isLoadingDirectory = false;
    }
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

  function navigateToParent() {
    if (!currentDirectory) return;
    const parts = currentDirectory.split("/").filter(Boolean);
    parts.pop();
    void loadDirectory(parts.join("/"));
  }

  // Remote MPD playback commands
  async function handleMpdCommand(cmd: string, arg?: string) {
    try {
      await mpdSendCommand(config.host, config.port, config.password, cmd, arg);
      await checkConnection(true);
    } catch (e: any) {
      showToast(`Error comando MPD (${cmd}): ${e?.message || e}`, "error");
    }
  }

  async function handleVolumeChange(e: Event) {
    const val = Number((e.currentTarget as HTMLInputElement).value);
    remoteVolume = val;
    isMuted = false;
    await handleMpdCommand("setvol", String(val));
  }

  async function toggleMute() {
    if (isMuted) {
      remoteVolume = prevVolume;
      isMuted = false;
      await handleMpdCommand("setvol", String(prevVolume));
    } else {
      prevVolume = remoteVolume;
      remoteVolume = 0;
      isMuted = true;
      await handleMpdCommand("setvol", "0");
    }
  }

  async function loadControlData() {
    if (!serverStatus?.connected) return;
    isLoadingPlaylist = true;
    isLoadingOutputs = true;
    try {
      const [playlist, outputs] = await Promise.all([
        mpdGetPlaylistInfo(config.host, config.port, config.password),
        mpdGetOutputs(config.host, config.port, config.password),
      ]);
      mpdPlaylist = playlist;
      mpdOutputs = outputs;
    } catch (e) {
      console.error("Error loading MPD control data:", e);
    } finally {
      isLoadingPlaylist = false;
      isLoadingOutputs = false;
    }
  }

  async function toggleOutput(out: MpdOutputDevice) {
    const cmd = out.enabled ? "disableoutput" : "enableoutput";
    await handleMpdCommand(cmd, String(out.id));
    await loadControlData();
  }

  async function setCrossfade(seconds: number) {
    crossfadeSecs = seconds;
    await handleMpdCommand("crossfade", String(seconds));
  }

  async function setVolumePreset(pct: number) {
    remoteVolume = pct;
    isMuted = false;
    await handleMpdCommand("setvol", String(pct));
  }

  function handleTimelineSeek(e: MouseEvent) {
    if (!serverStatus?.current_song || !serverStatus.duration) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetSec = Math.floor(ratio * serverStatus.duration);
    void handleMpdCommand("seek", String(targetSec));
  }

  async function initializeExplorerBase(force = false) {
    if (force || !currentDirectory) {
      isLoadingDirectory = true;
      try {
        const base = await mpdResolveBasePath(config);
        const initial = base || extractMpdRelativeBase(config.path_strip_prefix || config.remote_mount_path);
        await loadDirectory(initial);
      } catch {
        await loadDirectory("");
      } finally {
        isLoadingDirectory = false;
      }
    }
  }

  function handleExplorerItemDblClick(item: MpdDirectoryItem) {
    if (item.is_directory) {
      navigateToSubfolder(item.path);
    } else {
      addToMusicXQueue(item, false);
      showToast(`Añadida a la cola: ${item.title || item.name}`, "success");
    }
  }

  function promptDeleteItem(target: "local" | "remote", path: string, name: string, isDirectory: boolean) {
    deleteConfirmModal = { target, path, name, isDirectory };
  }

  async function executeDeletion() {
    if (!deleteConfirmModal) return;
    const { target, path, isDirectory, name } = deleteConfirmModal;
    deleteConfirmModal = null;
    try {
      await mpdDeleteItem(
        target,
        path,
        isDirectory,
        config,
        librarySettings.musicFolder
      );
      showToast(`Eliminado correctamente: ${name}`, "success");
      if (activeTab === "explorer") {
        void loadDirectory(currentDirectory);
      } else if (activeTab === "sync") {
        void runLibraryMatch();
      }
    } catch (e: any) {
      showToast(`Error al eliminar: ${e?.message || e}`, "error");
    }
  }

  // Add MPD file or folder to local MusicX queue
  function addToMusicXQueue(item: MpdDirectoryItem, playImmediately = false) {
    const store = useMusicStore.getState();
    const resolvedPath = resolveMpdTrackPath(item.path, config);

    const newTrack = {
      filepath: resolvedPath,
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

    if (playImmediately) {
      void store.play(newTrack as any);
      showToast(`Reproduciendo en MusicX: ${newTrack.title}`, "success");
    } else {
      store.addToQueue(newTrack as any);
      showToast(`Añadido a la cola de MusicX: ${newTrack.title}`, "success");
    }
  }

  // Add all audio items in current directory to MusicX queue
  function addAllDirectoryToMusicXQueue() {
    const audioItems = directoryItems.filter((i) => !i.is_directory);
    if (audioItems.length === 0) {
      showToast("No hay archivos de audio en esta carpeta", "info");
      return;
    }

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
    showToast(`Se añadieron ${tracks.length} canciones a la cola de MusicX`, "success");
  }

  // Match / Sync Engine
  async function runLibraryMatch() {
    const localDir = librarySettings.musicFolder || "";
    if (!localDir) {
      showToast("Configura primero una carpeta de música local en Ajustes", "error");
      return;
    }

    isComparing = true;
    selectedDiffPaths = new Set();
    try {
      const result = await mpdCompareLibraries(config, localDir);
      diffResult = result;
      showToast(
        `Comparación completada: ${result.total_mpd} en MPD vs ${result.total_local} en Local`,
        "success"
      );
    } catch (e: any) {
      showToast(`Error al comparar bibliotecas: ${e?.message || e}`, "error");
    } finally {
      isComparing = false;
    }
  }

  // Toggle selection for diff items
  function toggleSelectDiff(path: string) {
    const next = new Set(selectedDiffPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    selectedDiffPaths = next;
  }

  function selectAllFilteredDiff() {
    const next = new Set<string>();
    for (const item of filteredDiffItems) {
      next.add(item.relative_path);
    }
    selectedDiffPaths = next;
  }

  function clearDiffSelection() {
    selectedDiffPaths = new Set();
  }

  // Perform transfer (download from MPD or upload to MPD)
  async function executeTransfer(direction: "download_from_mpd" | "upload_to_mpd", specificPaths?: string[]) {
    if (!config.remote_mount_path) {
      showToast(
        "Debes configurar la ruta montada del disco en red para realizar transferencias",
        "error"
      );
      activeTab = "server";
      return;
    }

    const localDir = librarySettings.musicFolder;
    if (!localDir) {
      showToast("No hay carpeta de música local configurada", "error");
      return;
    }

    let pathsToTransfer: string[] = [];
    if (specificPaths && specificPaths.length > 0) {
      pathsToTransfer = specificPaths;
    } else if (selectedDiffPaths.size > 0) {
      pathsToTransfer = Array.from(selectedDiffPaths);
    } else if (diffResult) {
      if (direction === "download_from_mpd") {
        pathsToTransfer = diffResult.items
          .filter((i) => i.status === "only_mpd" || (i.status === "modified" && i.newer_side === "mpd"))
          .map((i) => i.relative_path);
      } else {
        pathsToTransfer = diffResult.items
          .filter((i) => i.status === "only_local" || (i.status === "modified" && i.newer_side === "local"))
          .map((i) => i.relative_path);
      }
    }

    if (pathsToTransfer.length === 0) {
      showToast("No hay archivos seleccionados para transferir", "info");
      return;
    }

    isTransferring = true;
    try {
      const count = await mpdTransferFiles(
        direction,
        pathsToTransfer,
        localDir,
        config.remote_mount_path,
        config
      );
      showToast(
        direction === "download_from_mpd"
          ? `Descarga completada con éxito: ${count} archivo(s)`
          : `Subida completada con éxito: ${count} archivo(s)`,
        "success"
      );
      // Re-run match to update diff view
      void runLibraryMatch();
    } catch (e: any) {
      showToast(`Error en la transferencia: ${e?.message || e}`, "error");
    } finally {
      isTransferring = false;
      transferProgress = null;
    }
  }

  // 1-Click Smart Sync
  async function runSmartSync() {
    if (!diffResult) {
      showToast("Ejecuta primero el match de biblioteca", "info");
      return;
    }
    const downloadCount = diffResult.count_only_mpd;
    const uploadCount = diffResult.count_only_local;
    if (downloadCount === 0 && uploadCount === 0) {
      showToast("¡Las bibliotecas ya están sincronizadas al 100%!", "success");
      return;
    }
    if (downloadCount > 0) {
      await executeTransfer("download_from_mpd");
    }
    if (uploadCount > 0) {
      await executeTransfer("upload_to_mpd");
    }
  }

  // Filtered explorer items
  const filteredDirectoryItems = $derived(
    directoryItems.filter((i) => {
      if (!explorerSearch.trim()) return true;
      const q = explorerSearch.toLowerCase();
      return (
        i.name.toLowerCase().includes(q) ||
        (i.title && i.title.toLowerCase().includes(q)) ||
        (i.artist && i.artist.toLowerCase().includes(q)) ||
        (i.album && i.album.toLowerCase().includes(q))
      );
    })
  );

  // Filtered diff items
  const filteredDiffItems = $derived.by(() => {
    if (!diffResult) return [];
    return diffResult.items.filter((item) => {
      // Filter status
      if (diffFilter === "only_mpd" && item.status !== "only_mpd") return false;
      if (diffFilter === "only_local" && item.status !== "only_local") return false;
      if (diffFilter === "modified" && item.status !== "modified") return false;
      if (diffFilter === "in_sync" && item.status !== "in_sync") return false;

      // Filter query
      if (diffSearch.trim()) {
        const q = diffSearch.toLowerCase();
        return (
          item.relative_path.toLowerCase().includes(q) ||
          item.title.toLowerCase().includes(q) ||
          item.artist.toLowerCase().includes(q) ||
          item.album.toLowerCase().includes(q)
        );
      }
      return true;
    });
  });

  // Filtered local items for FileZilla split view
  const filteredLocalItems = $derived.by(() => {
    if (!diffResult) return [];
    return diffResult.items.filter((item) => {
      if (item.status === "only_mpd") return false;
      if (!syncLocalSearch.trim()) return true;
      const q = syncLocalSearch.toLowerCase();
      return (
        item.relative_path.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.artist.toLowerCase().includes(q) ||
        item.album.toLowerCase().includes(q)
      );
    });
  });

  // Filtered remote items for FileZilla split view
  const filteredRemoteItems = $derived.by(() => {
    if (!diffResult) return [];
    return diffResult.items.filter((item) => {
      if (item.status === "only_local") return false;
      if (!syncRemoteSearch.trim()) return true;
      const q = syncRemoteSearch.toLowerCase();
      return (
        item.relative_path.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.artist.toLowerCase().includes(q) ||
        item.album.toLowerCase().includes(q)
      );
    });
  });

  // Breadcrumbs
  const breadcrumbParts = $derived(
    currentDirectory ? currentDirectory.split("/").filter(Boolean) : []
  );

  onMount(() => {
    void checkConnection(true);

    // Listen to transfer progress events from Tauri
    const unlistenPromise = listen<MpdTransferProgress>("mpd-transfer-progress", (event) => {
      transferProgress = event.payload;
    });

    // Auto-refresh status if connected every 5s while modal is open
    autoRefreshTimer = window.setInterval(() => {
      if (serverStatus?.connected && activeTab === "server") {
        void checkConnection(true);
      }
    }, 5000);

    return () => {
      if (autoRefreshTimer) window.clearInterval(autoRefreshTimer);
      unlistenPromise.then((unlisten) => unlisten());
    };
  });
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 transition-all"
    onclick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
    onkeydown={(e) => { if (e.key === "Escape") closeModal(); }}
    tabindex="-1"
    role="dialog"
    aria-modal="true"
  >
    <!-- Modal Container -->
    <div
      class="flex flex-col w-full max-w-5xl h-[88vh] rounded-2xl border border-audiophile-border bg-audiophile-surface shadow-2xl overflow-hidden font-sans text-slate-100"
    >
      <!-- Modal Header -->
      <div
        class="flex items-center justify-between px-6 py-4 border-b border-audiophile-border bg-audiophile-surface2 shrink-0 select-none"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex items-center justify-center w-9 h-9 rounded-xl shadow-inner border border-audiophile-border"
            style="background: {appearance.accentColor || '#06b6d4'}20; color: {appearance.accentColor || '#06b6d4'};"
          >
            <Server size={18} />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-base font-bold tracking-wide text-white">MPD & Disco Duro en Red</h2>
              {#if serverStatus?.connected}
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Conectado ({serverStatus.ping_ms}ms)
                </span>
              {:else}
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                  <span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                  Desconectado
                </span>
              {/if}
            </div>
            <p class="text-xs text-slate-400 font-mono">
              Integración de Music Player Daemon, explorador de red y sincronizador de biblioteca
            </p>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onclick={() => (activeTab = "server")}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer {activeTab === 'server' ? 'bg-audiophile-surface text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
            style={activeTab === 'server' ? `color: ${appearance.accentColor || '#06b6d4'}; border: 1px solid ${appearance.accentColor || '#06b6d4'}40;` : ''}
          >
            <Server size={14} />
            <span>Servidor</span>
          </button>

          <button
            type="button"
            onclick={() => { activeTab = "control"; void loadControlData(); }}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer {activeTab === 'control' ? 'bg-audiophile-surface text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
            style={activeTab === 'control' ? `color: ${appearance.accentColor || '#06b6d4'}; border: 1px solid ${appearance.accentColor || '#06b6d4'}40;` : ''}
          >
            <Play size={14} />
            <span>Control Remoto</span>
          </button>

          <button
            type="button"
            onclick={() => { activeTab = "explorer"; void initializeExplorerBase(); }}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer {activeTab === 'explorer' ? 'bg-audiophile-surface text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
            style={activeTab === 'explorer' ? `color: ${appearance.accentColor || '#06b6d4'}; border: 1px solid ${appearance.accentColor || '#06b6d4'}40;` : ''}
          >
            <FolderTree size={14} />
            <span>Explorador en Red</span>
          </button>

          <button
            type="button"
            onclick={() => (activeTab = "sync")}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer {activeTab === 'sync' ? 'bg-audiophile-surface text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
            style={activeTab === 'sync' ? `color: ${appearance.accentColor || '#06b6d4'}; border: 1px solid ${appearance.accentColor || '#06b6d4'}40;` : ''}
          >
            <RefreshCw size={14} />
            <span>Match & Sincronización</span>
            {#if diffResult && (diffResult.count_only_mpd > 0 || diffResult.count_only_local > 0 || diffResult.count_modified > 0)}
              <span class="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                {diffResult.count_only_mpd + diffResult.count_only_local + diffResult.count_modified}
              </span>
            {/if}
          </button>
        </div>

        <button
          type="button"
          onclick={closeModal}
          class="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          title="Cerrar ventana"
        >
          <X size={18} />
        </button>
      </div>

      <!-- Toast Feedback -->
      {#if toastMessage}
        <div
          class="px-6 py-2 text-xs font-medium flex items-center justify-between border-b {toastMessage.type === 'success' ? 'bg-emerald-950/80 text-emerald-200 border-emerald-800/60' : toastMessage.type === 'error' ? 'bg-rose-950/80 text-rose-200 border-rose-800/60' : 'bg-cyan-950/80 text-cyan-200 border-cyan-800/60'}"
        >
          <div class="flex items-center gap-2">
            {#if toastMessage.type === 'success'}
              <CheckCircle2 size={14} class="text-emerald-400" />
            {:else if toastMessage.type === 'error'}
              <AlertCircle size={14} class="text-rose-400" />
            {:else}
              <Radio size={14} class="text-cyan-400" />
            {/if}
            <span>{toastMessage.text}</span>
          </div>
          <button type="button" onclick={() => (toastMessage = null)} class="opacity-70 hover:opacity-100">
            <X size={12} />
          </button>
        </div>
      {/if}

      <!-- Transfer Progress Bar (Persistent across tabs) -->
      {#if isTransferring && transferProgress}
        <div class="px-6 py-3 bg-slate-900 border-b border-audiophile-border shrink-0">
          <div class="flex items-center justify-between text-xs mb-1.5 font-mono">
            <span class="text-slate-300 font-semibold truncate max-w-[65%]">
              Transfiriendo ({transferProgress.current_index}/{transferProgress.total_files}): {transferProgress.current_file}
            </span>
            <span class="text-audiophile-cyan font-bold">{transferProgress.percentage.toFixed(1)}%</span>
          </div>
          <div class="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              class="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-200"
              style="width: {transferProgress.percentage}%"
            ></div>
          </div>
        </div>
      {/if}

      <!-- Modal Body Content -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6">
        <!-- ================================================================= -->
        <!-- TAB 1: SERVER & CONTROLS -->
        <!-- ================================================================= -->
        {#if activeTab === "server"}
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <!-- Left Column: Connection Settings & Auto-discovery -->
            <div class="lg:col-span-6 space-y-5">
              <!-- Auto-Detection Card -->
              <div class="p-4 rounded-xl border border-audiophile-border bg-slate-900/60 space-y-3">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Wifi size={16} class="text-audiophile-cyan" />
                    <h3 class="text-sm font-bold text-white">Detección Automática de Servidores MPD</h3>
                  </div>
                  <button
                    type="button"
                    onclick={runAutoDiscovery}
                    disabled={isDiscovering}
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-audiophile-surface2 border border-audiophile-border text-white hover:border-audiophile-cyan transition cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={12} class={isDiscovering ? "animate-spin text-audiophile-cyan" : ""} />
                    <span>{isDiscovering ? "Escaneando LAN..." : "Escanear Red LAN"}</span>
                  </button>
                </div>
                <p class="text-xs text-slate-400 leading-relaxed">
                  Sondea automáticamente la subred local en el puerto 6600 para localizar servidores MPD activos (NAS, Raspberry Pi, etc.).
                </p>

                {#if discoveredServers.length > 0}
                  <div class="mt-2 space-y-1.5 max-h-36 overflow-y-auto">
                    {#each discoveredServers as s}
                      <div class="flex items-center justify-between p-2 rounded-lg bg-slate-850 border border-slate-800 text-xs">
                        <div class="flex items-center gap-2">
                          <CheckCircle2 size={14} class="text-emerald-400" />
                          <span class="font-mono font-bold text-white">{s.host}:{s.port}</span>
                          <span class="text-slate-400 text-[11px]">(MPD {s.version})</span>
                        </div>
                        <button
                          type="button"
                          onclick={() => selectDiscoveredServer(s)}
                          class="px-2.5 py-1 rounded text-xs font-semibold bg-audiophile-cyan/20 text-audiophile-cyan border border-audiophile-cyan/40 hover:bg-audiophile-cyan hover:text-black transition cursor-pointer"
                        >
                          Usar este
                        </button>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>

              <!-- Manual Configuration Card -->
              <div class="p-4 rounded-xl border border-audiophile-border bg-slate-900/60 space-y-4">
                <h3 class="text-sm font-bold text-white flex items-center gap-2">
                  <Sliders size={16} class="text-audiophile-cyan" />
                  <span>Configuración de Conexión</span>
                </h3>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div class="sm:col-span-2 space-y-1">
                    <label for="mpd-host-input" class="text-xs font-medium text-slate-300">Host / IP del Servidor</label>
                    <input
                      id="mpd-host-input"
                      type="text"
                      bind:value={config.host}
                      placeholder="192.168.1.50 o localhost"
                      class="w-full px-3 py-1.5 rounded-lg border border-audiophile-border bg-slate-950 font-mono text-xs text-white focus:outline-none focus:border-audiophile-cyan"
                    />
                  </div>

                  <div class="space-y-1">
                    <label for="mpd-port-input" class="text-xs font-medium text-slate-300">Puerto</label>
                    <input
                      id="mpd-port-input"
                      type="number"
                      bind:value={config.port}
                      placeholder="6600"
                      class="w-full px-3 py-1.5 rounded-lg border border-audiophile-border bg-slate-950 font-mono text-xs text-white focus:outline-none focus:border-audiophile-cyan"
                    />
                  </div>
                </div>

                <div class="space-y-1">
                  <label for="mpd-password-input" class="text-xs font-medium text-slate-300">Contraseña (opcional)</label>
                  <input
                    id="mpd-password-input"
                    type="password"
                    bind:value={config.password}
                    placeholder="Dejar vacío si no requiere contraseña"
                    class="w-full px-3 py-1.5 rounded-lg border border-audiophile-border bg-slate-950 font-mono text-xs text-white focus:outline-none focus:border-audiophile-cyan"
                  />
                </div>

                <!-- Network Mount Path -->
                <div class="space-y-1">
                  <label for="mpd-mount-input" class="text-xs font-medium text-slate-300 flex items-center justify-between">
                    <span>Ruta Montada o URL SMB (smb:// o Mount Local)</span>
                    <span class="text-[10px] text-audiophile-cyan">Soporta smb:// y montajes directos</span>
                  </label>
                  <div class="flex gap-2">
                    <input
                      id="mpd-mount-input"
                      type="text"
                      bind:value={config.remote_mount_path}
                      placeholder="/mnt/nas/music o smb://servidor/recurso/ruta/"
                      class="flex-1 px-3 py-1.5 rounded-lg border border-audiophile-border bg-slate-950 font-mono text-xs text-white focus:outline-none focus:border-audiophile-cyan"
                    />
                    <button
                      type="button"
                      onclick={chooseRemoteMountPath}
                      class="px-3 py-1.5 rounded-lg border border-audiophile-border bg-audiophile-surface2 text-xs font-semibold text-slate-200 hover:text-white hover:border-audiophile-cyan transition cursor-pointer"
                    >
                      Examinar
                    </button>
                  </div>
                  <p class="text-[11px] text-slate-500">
                    Punto de montaje del disco en red (NFS, SMB local) o dirección SMB directa (ej: <code class="text-audiophile-cyan font-mono text-[10px]">smb://servidor/recurso/</code>). Permite reproducción nativa, caché ultra-rápida y sincronización.
                  </p>
                </div>

                <!-- Strip Prefix -->
                <div class="space-y-1">
                  <label for="mpd-prefix-input" class="text-xs font-medium text-slate-300 flex items-center justify-between">
                    <span>Prefijo a descartar de rutas MPD (opcional)</span>
                    <span class="text-[10px] text-audiophile-cyan">Para rutas relativas o montajes directos</span>
                  </label>
                  <input
                    id="mpd-prefix-input"
                    type="text"
                    bind:value={config.path_strip_prefix}
                    placeholder="ej: USB/ o USB/rootfs/mnt/SDCARD/"
                    class="w-full px-3 py-1.5 rounded-lg border border-audiophile-border bg-slate-950 font-mono text-xs text-white focus:outline-none focus:border-audiophile-cyan"
                  />
                  <p class="text-[11px] text-slate-500">
                    Si MPD devuelve rutas internas que no coinciden con la raíz de tu carpeta montada, indica aquí el prefijo a omitir al reproducir o transferir.
                  </p>
                </div>

                <!-- SMB / Network Share Credentials -->
                <div class="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2">
                  <div class="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Network size={14} class="text-audiophile-cyan" />
                    <span>Credenciales de Red / SMB (opcional)</span>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div class="space-y-1">
                      <label for="mpd-smb-user" class="text-[10px] text-slate-400">Usuario SMB</label>
                      <input
                        id="mpd-smb-user"
                        type="text"
                        bind:value={config.smb_user}
                        placeholder="ej: guest"
                        class="w-full px-2.5 py-1 rounded border border-audiophile-border bg-slate-900 font-mono text-xs text-white focus:outline-none focus:border-audiophile-cyan"
                      />
                    </div>
                    <div class="space-y-1">
                      <label for="mpd-smb-pass" class="text-[10px] text-slate-400">Contraseña SMB</label>
                      <input
                        id="mpd-smb-pass"
                        type="password"
                        bind:value={config.smb_password}
                        placeholder="••••••••"
                        class="w-full px-2.5 py-1 rounded border border-audiophile-border bg-slate-900 font-mono text-xs text-white focus:outline-none focus:border-audiophile-cyan"
                      />
                    </div>
                    <div class="space-y-1">
                      <label for="mpd-smb-domain" class="text-[10px] text-slate-400">Grupo / Dominio</label>
                      <input
                        id="mpd-smb-domain"
                        type="text"
                        bind:value={config.smb_domain}
                        placeholder="WORKGROUP"
                        class="w-full px-2.5 py-1 rounded border border-audiophile-border bg-slate-900 font-mono text-xs text-white focus:outline-none focus:border-audiophile-cyan"
                      />
                    </div>
                  </div>
                </div>

                <!-- Action Buttons -->
                <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onclick={handleSaveConfig}
                    class="px-3 py-1.5 rounded-lg border border-audiophile-border bg-slate-800 text-xs font-semibold text-slate-200 hover:text-white transition cursor-pointer"
                  >
                    Guardar
                  </button>

                  <button
                    type="button"
                    onclick={() => void checkConnection()}
                    disabled={isConnecting}
                    class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-black transition cursor-pointer disabled:opacity-50"
                    style="background: {appearance.accentColor || '#06b6d4'};"
                  >
                    <RefreshCw size={13} class={isConnecting ? "animate-spin" : ""} />
                    <span>{isConnecting ? "Conectando..." : "Probar Conexión"}</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Right Column: MPD Status & Remote Playback Controls -->
            <div class="lg:col-span-6 space-y-5">
              <!-- Server Status & Stats Card -->
              <div class="p-4 rounded-xl border border-audiophile-border bg-slate-900/60 space-y-4">
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-bold text-white flex items-center gap-2">
                    <HardDrive size={16} class="text-audiophile-cyan" />
                    <span>Estadísticas de la Base de Datos MPD</span>
                  </h3>
                  <button
                    type="button"
                    onclick={() => handleMpdCommand("update")}
                    class="flex items-center gap-1 text-[11px] font-semibold text-audiophile-cyan hover:underline transition cursor-pointer"
                    title="Ordena a MPD re-escanear su carpeta de música"
                  >
                    <RefreshCw size={11} />
                    <span>Actualizar DB (update)</span>
                  </button>
                </div>

                {#if serverStatus?.connected}
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="p-2.5 rounded-lg bg-slate-800/60 border border-slate-800">
                      <span class="block text-[10px] text-slate-400 font-mono">Canciones</span>
                      <span class="text-base font-bold text-white font-mono">{serverStatus.stats.songs.toLocaleString()}</span>
                    </div>

                    <div class="p-2.5 rounded-lg bg-slate-800/60 border border-slate-800">
                      <span class="block text-[10px] text-slate-400 font-mono">Álbumes</span>
                      <span class="text-base font-bold text-white font-mono">{serverStatus.stats.albums.toLocaleString()}</span>
                    </div>

                    <div class="p-2.5 rounded-lg bg-slate-800/60 border border-slate-800">
                      <span class="block text-[10px] text-slate-400 font-mono">Artistas</span>
                      <span class="text-base font-bold text-white font-mono">{serverStatus.stats.artists.toLocaleString()}</span>
                    </div>

                    <div class="p-2.5 rounded-lg bg-slate-800/60 border border-slate-800">
                      <span class="block text-[10px] text-slate-400 font-mono">Tiempo DB</span>
                      <span class="text-base font-bold text-white font-mono">
                        {Math.floor(serverStatus.stats.db_playtime / 3600)}h
                      </span>
                    </div>
                  </div>

                  <div class="p-3 rounded-lg bg-slate-850/70 border border-slate-800 text-xs font-mono space-y-1">
                    <div class="flex justify-between text-slate-400">
                      <span>Versión del Daemon:</span>
                      <span class="text-white">MPD {serverStatus.version}</span>
                    </div>
                    <div class="flex justify-between text-slate-400">
                      <span>Latencia de red:</span>
                      <span class="text-emerald-400 font-bold">{serverStatus.ping_ms} ms</span>
                    </div>
                    <div class="flex justify-between text-slate-400">
                      <span>Cola remota MPD:</span>
                      <span class="text-white">{serverStatus.playlist_length} canciones</span>
                    </div>
                  </div>
                {:else}
                  <div class="py-6 text-center text-xs text-slate-500">
                    Servidor no conectado. Configura el host y haz clic en "Probar Conexión".
                  </div>
                {/if}
              </div>

              <!-- Remote Control Shortcut & Quick Status Card -->
              <div class="p-4 rounded-xl border border-audiophile-border bg-slate-900/60 space-y-3">
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-bold text-white flex items-center gap-2">
                    <Play size={16} class="text-audiophile-cyan" />
                    <span>Control Remoto & Salidas de Audio</span>
                  </h3>
                  {#if serverStatus?.connected}
                    <span class="text-[10px] font-mono text-emerald-400 font-bold uppercase">{serverStatus.state}</span>
                  {/if}
                </div>

                {#if serverStatus?.connected}
                  <div class="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
                    <div class="flex items-center justify-between text-xs">
                      <span class="text-slate-300 font-semibold truncate max-w-[70%]">
                        {serverStatus.current_song?.title || serverStatus.current_song?.file || "Sin pista activa"}
                      </span>
                      <span class="text-audiophile-cyan font-mono text-[11px] font-bold">
                        {serverStatus.volume >= 0 ? `${serverStatus.volume}% vol` : "Volumen fijo"}
                      </span>
                    </div>

                    <p class="text-xs text-slate-400 leading-relaxed">
                      La nueva pestaña de <strong>Control Remoto</strong> incluye un scrubber interactivo, salidas de audio ALSA/Bluetooth, modos single/consume, crossfade y gestión completa de la cola de MPD.
                    </p>

                    <button
                      type="button"
                      onclick={() => { activeTab = "control"; void loadControlData(); }}
                      class="w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer text-black hover:opacity-95 shadow-md"
                      style="background: {appearance.accentColor || '#06b6d4'};"
                    >
                      <Play size={14} class="fill-current" />
                      <span>Abrir Centro de Control Remoto MPD →</span>
                    </button>
                  </div>
                {:else}
                  <div class="py-4 text-center text-xs text-slate-500">
                    Conéctate al servidor MPD para controlar la reproducción y gestionar salidas.
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/if}

        <!-- ================================================================= -->
        <!-- TAB 2: ADVANCED MPD REMOTE CONTROL CENTER -->
        <!-- ================================================================= -->
        {#if activeTab === "control"}
          <div class="space-y-6">
            <!-- Hero Card: Now Playing & Transport -->
            <div class="p-5 rounded-2xl border border-audiophile-border bg-slate-900/70 shadow-lg space-y-4">
              <!-- Header Info -->
              <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div class="flex items-center gap-3 min-w-0">
                  <div
                    class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-audiophile-border shadow-inner"
                    style="background: {appearance.accentColor || '#06b6d4'}22; color: {appearance.accentColor || '#06b6d4'};"
                  >
                    <Music size={20} />
                  </div>
                  <div class="min-w-0">
                    <h3 class="text-sm sm:text-base font-bold text-white truncate">
                      {serverStatus?.current_song?.title || serverStatus?.current_song?.file?.split("/").pop() || "Sin reproducción activa en MPD"}
                    </h3>
                    <p class="text-xs text-slate-400 truncate">
                      {serverStatus?.current_song?.artist || "Servidor MPD"}
                      {#if serverStatus?.current_song?.album}
                        {" · "}{serverStatus.current_song.album}
                      {/if}
                    </p>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  {#if serverStatus?.current_song?.format}
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 border border-slate-700 text-slate-300">
                      {serverStatus.current_song.format}
                    </span>
                  {/if}
                  {#if serverStatus?.bitrate}
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 border border-slate-700 text-audiophile-cyan">
                      {serverStatus.bitrate} kbps
                    </span>
                  {/if}
                  <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase {serverStatus?.state === 'play' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : serverStatus?.state === 'pause' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-800 text-slate-400'}">
                    {serverStatus?.state || "stop"}
                  </span>
                </div>
              </div>

              <!-- Interactive Timeline / Seekbar -->
              <div class="space-y-1.5">
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="relative h-2.5 w-full bg-slate-950 rounded-full border border-slate-800 cursor-pointer overflow-hidden group"
                  onclick={handleTimelineSeek}
                  title="Haz clic para saltar a esta posición en MPD"
                >
                  <div
                    class="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-150"
                    style="width: {serverStatus?.duration ? Math.min(100, ((serverStatus.elapsed / serverStatus.duration) * 100)) : 0}%"
                  ></div>
                  <!-- Hover effect bar -->
                  <div class="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                </div>

                <div class="flex justify-between text-[11px] font-mono text-slate-400">
                  <span>
                    {Math.floor((serverStatus?.elapsed || 0) / 60)}:{(Math.floor((serverStatus?.elapsed || 0) % 60)).toString().padStart(2, "0")}
                  </span>
                  <span class="text-slate-500 text-[10px]">
                    {serverStatus?.duration ? `${Math.round(((serverStatus.elapsed || 0) / serverStatus.duration) * 100)}%` : ""}
                  </span>
                  <span>
                    {Math.floor((serverStatus?.duration || 0) / 60)}:{(Math.floor((serverStatus?.duration || 0) % 60)).toString().padStart(2, "0")}
                  </span>
                </div>
              </div>

              <!-- Primary Transport & Mode Controls -->
              <div class="flex flex-wrap items-center justify-between gap-4 pt-2">
                <!-- Modes: Repeat, Random, Single, Consume -->
                <div class="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onclick={() => handleMpdCommand("repeat", serverStatus?.repeat ? "0" : "1")}
                    class="p-2 rounded-lg text-xs transition cursor-pointer {serverStatus?.repeat ? 'bg-audiophile-cyan/20 text-audiophile-cyan border border-audiophile-cyan/40' : 'text-slate-500 hover:text-slate-300'}"
                    title="Repetir (Repeat)"
                  >
                    <Repeat size={14} />
                  </button>

                  <button
                    type="button"
                    onclick={() => handleMpdCommand("random", serverStatus?.random ? "0" : "1")}
                    class="p-2 rounded-lg text-xs transition cursor-pointer {serverStatus?.random ? 'bg-audiophile-cyan/20 text-audiophile-cyan border border-audiophile-cyan/40' : 'text-slate-500 hover:text-slate-300'}"
                    title="Aleatorio (Random)"
                  >
                    <Shuffle size={14} />
                  </button>

                  <button
                    type="button"
                    onclick={() => handleMpdCommand("single", serverStatus?.single ? "0" : "1")}
                    class="px-2 py-1.5 rounded-lg text-[11px] font-mono font-bold transition cursor-pointer {serverStatus?.single ? 'bg-audiophile-cyan/20 text-audiophile-cyan border border-audiophile-cyan/40' : 'text-slate-500 hover:text-slate-300'}"
                    title="Single Mode: para tras reproducir la pista actual"
                  >
                    1x Single
                  </button>

                  <button
                    type="button"
                    onclick={() => handleMpdCommand("consume", serverStatus?.consume ? "0" : "1")}
                    class="px-2 py-1.5 rounded-lg text-[11px] font-mono font-bold transition cursor-pointer {serverStatus?.consume ? 'bg-audiophile-cyan/20 text-audiophile-cyan border border-audiophile-cyan/40' : 'text-slate-500 hover:text-slate-300'}"
                    title="Consume Mode: quita la pista de la lista tras reproducirla"
                  >
                    Consume
                  </button>
                </div>

                <!-- Main Transport Buttons -->
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    onclick={() => handleMpdCommand("previous")}
                    class="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer shadow-sm"
                    title="Pista anterior"
                  >
                    <SkipBack size={16} />
                  </button>

                  {#if serverStatus?.state === "play"}
                    <button
                      type="button"
                      onclick={() => handleMpdCommand("pause")}
                      class="p-3 rounded-2xl bg-audiophile-cyan text-black font-bold hover:scale-105 transition cursor-pointer shadow-lg"
                      title="Pausar MPD"
                    >
                      <Pause size={20} />
                    </button>
                  {:else}
                    <button
                      type="button"
                      onclick={() => handleMpdCommand("resume")}
                      class="p-3 rounded-2xl bg-audiophile-cyan text-black font-bold hover:scale-105 transition cursor-pointer shadow-lg"
                      title="Reproducir MPD"
                    >
                      <Play size={20} class="fill-current" />
                    </button>
                  {/if}

                  <button
                    type="button"
                    onclick={() => handleMpdCommand("stop")}
                    class="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer shadow-sm"
                    title="Detener MPD"
                  >
                    <Square size={16} />
                  </button>

                  <button
                    type="button"
                    onclick={() => handleMpdCommand("next")}
                    class="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer shadow-sm"
                    title="Siguiente pista"
                  >
                    <SkipForward size={16} />
                  </button>
                </div>

                <!-- Volume & Presets -->
                <div class="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onclick={toggleMute}
                    class="p-1.5 text-slate-400 hover:text-white transition cursor-pointer"
                    title={isMuted ? "Restaurar volumen" : "Silenciar"}
                  >
                    {#if isMuted || remoteVolume === 0}
                      <VolumeX size={16} class="text-rose-400" />
                    {:else}
                      <Volume2 size={16} class="text-audiophile-cyan" />
                    {/if}
                  </button>

                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={remoteVolume}
                    oninput={handleVolumeChange}
                    class="w-24 sm:w-28 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />

                  <span class="font-mono text-xs text-white font-bold w-9 text-right">
                    {remoteVolume}%
                  </span>

                  <!-- Quick volume presets -->
                  <div class="hidden sm:flex items-center gap-1 border-l border-slate-800 pl-2">
                    {#each [25, 50, 75, 100] as vol}
                      <button
                        type="button"
                        onclick={() => setVolumePreset(vol)}
                        class="px-1.5 py-0.5 rounded text-[10px] font-mono {remoteVolume === vol ? 'bg-audiophile-cyan text-black font-bold' : 'text-slate-400 hover:text-white hover:bg-slate-850'} transition cursor-pointer"
                      >
                        {vol}
                      </button>
                    {/each}
                  </div>
                </div>
              </div>

              <!-- Crossfade Slider -->
              <div class="flex items-center justify-between gap-4 pt-2 border-t border-slate-800/80 text-xs">
                <div class="flex items-center gap-2 text-slate-400">
                  <SlidersHorizontal size={14} class="text-audiophile-cyan" />
                  <span>Transición suave / Crossfade:</span>
                  <span class="font-mono text-white font-bold">{crossfadeSecs} s</span>
                </div>
                <div class="flex items-center gap-2 w-48">
                  <input
                    type="range"
                    min="0"
                    max="15"
                    value={crossfadeSecs}
                    oninput={(e) => setCrossfade(Number((e.currentTarget as HTMLInputElement).value))}
                    class="flex-1 h-1.5 bg-slate-950 rounded appearance-none cursor-pointer accent-cyan-400"
                  />
                  <span class="font-mono text-[10px] text-slate-500">15s</span>
                </div>
              </div>
            </div>

            <!-- Two Column Detail Section: Audio Outputs & MPD Active Queue -->
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <!-- Left Column: Audio Outputs Manager -->
              <div class="lg:col-span-5 space-y-4">
                <div class="p-4 rounded-xl border border-audiophile-border bg-slate-900/60 space-y-3">
                  <div class="flex items-center justify-between">
                    <h4 class="text-xs font-bold text-white flex items-center gap-2">
                      <Speaker size={15} class="text-audiophile-cyan" />
                      <span>Salidas de Audio MPD (Outputs)</span>
                    </h4>
                    <button
                      type="button"
                      onclick={loadControlData}
                      disabled={isLoadingOutputs}
                      class="text-[11px] font-semibold text-audiophile-cyan hover:underline transition cursor-pointer"
                    >
                      Refrescar
                    </button>
                  </div>
                  <p class="text-[11px] text-slate-400">
                    Activa o desactiva dispositivos de salida (ALSA, Bluetooth, Servidor HTTP) conectados a tu MPD.
                  </p>

                  <div class="space-y-2 max-h-64 overflow-y-auto">
                    {#if isLoadingOutputs}
                      <div class="py-6 text-center text-xs text-slate-500">Cargando salidas de audio...</div>
                    {:else if mpdOutputs.length === 0}
                      <div class="py-6 text-center text-xs text-slate-500">No se detectaron salidas adicionales o no requiere selector.</div>
                    {:else}
                      {#each mpdOutputs as out}
                        <div class="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                          <div class="flex items-center gap-2.5 min-w-0">
                            <span class="w-2 h-2 rounded-full {out.enabled ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-slate-600'}"></span>
                            <div class="min-w-0">
                              <span class="font-semibold text-white block truncate">{out.name}</span>
                              <span class="text-[10px] font-mono text-slate-500">Plugin: {out.plugin} · ID: {out.id}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onclick={() => toggleOutput(out)}
                            class="px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer {out.enabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30' : 'bg-slate-800 text-slate-400 hover:text-white'}"
                          >
                            {out.enabled ? "Activo" : "Activar"}
                          </button>
                        </div>
                      {/each}
                    {/if}
                  </div>
                </div>

                <!-- Database Maintenance Card -->
                <div class="p-4 rounded-xl border border-audiophile-border bg-slate-900/60 space-y-3">
                  <div class="flex items-center justify-between">
                    <h4 class="text-xs font-bold text-white flex items-center gap-2">
                      <HardDrive size={15} class="text-audiophile-cyan" />
                      <span>Base de Datos del Servidor</span>
                    </h4>
                    <button
                      type="button"
                      onclick={async () => {
                        isUpdatingDb = true;
                        await handleMpdCommand("update");
                        showToast("MPD está re-escaneando los archivos de música...", "info");
                        setTimeout(() => { isUpdatingDb = false; }, 3000);
                      }}
                      disabled={isUpdatingDb}
                      class="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-audiophile-cyan/20 text-audiophile-cyan hover:bg-audiophile-cyan hover:text-black transition cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw size={11} class={isUpdatingDb ? "animate-spin" : ""} />
                      <span>{isUpdatingDb ? "Actualizando..." : "Actualizar DB (update)"}</span>
                    </button>
                  </div>
                  <p class="text-[11px] text-slate-400">
                    Última actualización de base de datos: <span class="text-slate-300 font-mono">{serverStatus?.stats ? new Date(serverStatus.stats.db_update * 1000).toLocaleString() : "—"}</span>
                  </p>
                </div>
              </div>

              <!-- Right Column: MPD Remote Playlist / Queue Viewer -->
              <div class="lg:col-span-7 space-y-4">
                <div class="p-4 rounded-xl border border-audiophile-border bg-slate-900/60 flex flex-col h-[420px]">
                  <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 shrink-0">
                    <div class="flex items-center gap-2">
                      <List size={16} class="text-audiophile-cyan" />
                      <h4 class="text-xs font-bold text-white">Cola de Reproducción Remota de MPD</h4>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-300">
                        {mpdPlaylist.length} pistas
                      </span>
                    </div>

                    <div class="flex items-center gap-1.5">
                      <button
                        type="button"
                        onclick={() => handleMpdCommand("shuffle")}
                        class="px-2 py-1 rounded text-[11px] font-semibold bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                        title="Desordenar lista de MPD"
                      >
                        <Shuffle size={12} class="inline mr-1" />
                        Desordenar
                      </button>

                      <button
                        type="button"
                        onclick={() => handleMpdCommand("clear")}
                        class="px-2 py-1 rounded text-[11px] font-semibold bg-slate-800 text-rose-400 hover:bg-rose-950/40 transition cursor-pointer"
                        title="Vaciar cola de MPD"
                      >
                        <Trash2 size={12} class="inline mr-1" />
                        Vaciar
                      </button>

                      <button
                        type="button"
                        onclick={loadControlData}
                        class="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer"
                        title="Refrescar lista"
                      >
                        <RefreshCw size={12} />
                      </button>
                    </div>
                  </div>

                  <!-- Playlist Table -->
                  <div class="flex-1 overflow-y-auto min-h-0 pt-2">
                    {#if isLoadingPlaylist}
                      <div class="py-12 text-center text-xs text-slate-500">Cargando cola remota...</div>
                    {:else if mpdPlaylist.length === 0}
                      <div class="py-12 text-center text-xs text-slate-500 space-y-1">
                        <p>La cola de reproducción de MPD está vacía.</p>
                        <p class="text-[11px] text-slate-600">Añade pistas desde la pestaña "Explorador en Red" con el botón "+ MPD".</p>
                      </div>
                    {:else}
                      <table class="w-full text-left text-xs border-collapse">
                        <tbody class="divide-y divide-slate-850">
                          {#each mpdPlaylist as song, idx}
                            {@const isCurrentSong = serverStatus?.current_song?.file === song.file}
                            <tr class="hover:bg-slate-850/60 transition group {isCurrentSong ? 'bg-audiophile-cyan/10' : ''}">
                              <!-- Pos / Play indicator -->
                              <td class="py-1.5 px-2 w-8 text-center font-mono text-[11px] text-slate-500">
                                {#if isCurrentSong}
                                  <span class="text-audiophile-cyan font-bold">▶</span>
                                {:else}
                                  <span>{idx + 1}</span>
                                {/if}
                              </td>

                              <!-- Title & Artist -->
                              <td class="py-1.5 px-2 min-w-0">
                                <span class="font-semibold block truncate {isCurrentSong ? 'text-audiophile-cyan' : 'text-slate-200'}">
                                  {song.title || song.file.split("/").pop()}
                                </span>
                                <span class="text-[10px] text-slate-500 truncate block">
                                  {song.artist || "Desconocido"}
                                  {#if song.album}
                                    {" · "}{song.album}
                                  {/if}
                                </span>
                              </td>

                              <!-- Duration -->
                              <td class="py-1.5 px-2 text-right font-mono text-[11px] text-slate-400 w-16">
                                {Math.floor(song.duration / 60)}:{(Math.floor(song.duration % 60)).toString().padStart(2, "0")}
                              </td>

                              <!-- Actions -->
                              <td class="py-1.5 px-2 text-right w-16 whitespace-nowrap">
                                <div class="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100">
                                  {#if song.id !== undefined}
                                    <button
                                      type="button"
                                      onclick={() => handleMpdCommand("playid", String(song.id))}
                                      class="p-1 rounded text-slate-400 hover:text-audiophile-cyan transition cursor-pointer"
                                      title="Reproducir esta pista en MPD"
                                    >
                                      <Play size={11} />
                                    </button>
                                    <button
                                      type="button"
                                      onclick={() => handleMpdCommand("deleteid", String(song.id))}
                                      class="p-1 rounded text-slate-400 hover:text-rose-400 transition cursor-pointer"
                                      title="Quitar de la cola MPD"
                                    >
                                      <X size={11} />
                                    </button>
                                  {/if}
                                </div>
                              </td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    {/if}
                  </div>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- ================================================================= -->
        <!-- TAB 2: NETWORK DISK EXPLORER -->
        <!-- ================================================================= -->
        {#if activeTab === "explorer"}
          <div class="flex flex-col h-full space-y-4">
            <!-- Explorer Toolbar -->
            <div class="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-audiophile-border bg-slate-900/60">
              <!-- Breadcrumbs Navigation -->
              <div class="flex items-center gap-1.5 text-xs font-mono overflow-x-auto max-w-[60%]">
                <button
                  type="button"
                  onclick={() => navigateBreadcrumb(-1, [])}
                  class="px-2 py-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white font-semibold transition cursor-pointer"
                >
                  Raíz
                </button>
                <button
                  type="button"
                  onclick={() => void initializeExplorerBase(true)}
                  class="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 text-audiophile-cyan hover:text-white font-semibold transition cursor-pointer"
                  title="Ir directamente a la carpeta de música de MPD"
                >
                  <Folder size={12} class="text-audiophile-cyan" />
                  <span>Música Base</span>
                </button>
                {#each breadcrumbParts as part, idx}
                  <span class="text-slate-600">/</span>
                  <button
                    type="button"
                    onclick={() => navigateBreadcrumb(idx, breadcrumbParts)}
                    class="px-2 py-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                  >
                    {part}
                  </button>
                {/each}
              </div>

              <!-- Search & Quick Batch Actions -->
              <div class="flex items-center gap-2">
                <div class="relative w-52">
                  <Search size={13} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    bind:value={explorerSearch}
                    placeholder="Filtrar archivos..."
                    class="w-full pl-8 pr-3 py-1 rounded-lg border border-audiophile-border bg-slate-950 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-audiophile-cyan"
                  />
                </div>

                <button
                  type="button"
                  onclick={addAllDirectoryToMusicXQueue}
                  class="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-audiophile-surface2 border border-audiophile-border hover:border-audiophile-cyan text-white transition cursor-pointer"
                  title="Añade todas las pistas de audio de esta carpeta a la cola de MusicX"
                >
                  <Plus size={13} class="text-audiophile-cyan" />
                  <span>Añadir carpeta a cola</span>
                </button>

                <button
                  type="button"
                  onclick={() => void loadDirectory(currentDirectory)}
                  class="p-1.5 rounded-lg border border-audiophile-border bg-slate-850 text-slate-300 hover:text-white transition cursor-pointer"
                  title="Recargar carpeta"
                >
                  <RefreshCw size={13} class={isLoadingDirectory ? "animate-spin text-audiophile-cyan" : ""} />
                </button>
              </div>
            </div>

            <!-- Explorer Items List -->
            <div class="flex-1 min-h-[380px] rounded-xl border border-audiophile-border bg-slate-950/80 overflow-y-auto">
              {#if isLoadingDirectory}
                <div class="flex items-center justify-center py-20 text-slate-400 gap-2 text-xs">
                  <RefreshCw size={16} class="animate-spin text-audiophile-cyan" />
                  <span>Cargando directorio del disco en red...</span>
                </div>
              {:else if filteredDirectoryItems.length === 0 && !currentDirectory}
                <div class="flex flex-col items-center justify-center py-20 text-slate-500 gap-2 text-xs">
                  <FolderOpen size={28} class="opacity-40" />
                  <span>Esta carpeta no contiene archivos o no coincide con la búsqueda.</span>
                </div>
              {:else}
                <table class="w-full text-left text-xs border-collapse">
                  <thead class="sticky top-0 bg-slate-900 border-b border-audiophile-border text-[11px] font-mono text-slate-400 select-none">
                    <tr>
                      <th class="py-2 px-3">Nombre</th>
                      <th class="py-2 px-3">Artista / Álbum</th>
                      <th class="py-2 px-3 w-20">Duración</th>
                      <th class="py-2 px-3 w-24">Tamaño</th>
                      <th class="py-2 px-3 w-36">Última Modificación</th>
                      <th class="py-2 px-3 w-44 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-900 font-sans">
                    {#if currentDirectory}
                      <tr
                        class="hover:bg-slate-900/60 transition group cursor-pointer bg-slate-950/40 select-none"
                        onclick={navigateToParent}
                      >
                        <td class="py-2 px-3 flex items-center gap-2 text-audiophile-cyan font-semibold">
                          <CornerLeftUp size={15} class="shrink-0" />
                          <span>.. (Carpeta anterior)</span>
                        </td>
                        <td class="py-2 px-3 text-slate-500 font-mono text-[10px]">Subir nivel</td>
                        <td class="py-2 px-3 text-slate-600 font-mono text-[11px]">—</td>
                        <td class="py-2 px-3 text-slate-600 font-mono text-[11px]">—</td>
                        <td class="py-2 px-3 text-slate-600 font-mono text-[11px]">—</td>
                        <td class="py-2 px-3 text-right text-slate-500 font-mono text-[11px]">Subir</td>
                      </tr>
                    {/if}
                    {#each filteredDirectoryItems as item}
                      <tr
                        class="hover:bg-slate-900/60 transition group cursor-pointer"
                        ondblclick={() => handleExplorerItemDblClick(item)}
                      >
                        <!-- Name & Icon -->
                        <td class="py-2 px-3">
                          {#if item.is_directory}
                            <button
                              type="button"
                              onclick={(e) => { e.stopPropagation(); navigateToSubfolder(item.path); }}
                              class="flex items-center gap-2 font-semibold text-slate-200 hover:text-audiophile-cyan transition cursor-pointer text-left"
                            >
                              <Folder size={15} class="text-amber-400 shrink-0" />
                              <span class="truncate max-w-[280px]">{item.name}</span>
                            </button>
                          {:else}
                            <div class="flex items-center gap-2 text-slate-200">
                              <FileAudio size={15} class="text-audiophile-cyan shrink-0" />
                              <span class="truncate max-w-[280px] font-medium">
                                {item.title || item.name}
                              </span>
                            </div>
                          {/if}
                        </td>

                        <!-- Artist / Album -->
                        <td class="py-2 px-3 text-slate-400 truncate max-w-[200px]">
                          {#if !item.is_directory}
                            <span>{item.artist || "—"}</span>
                            {#if item.album}
                              <span class="text-slate-500"> • {item.album}</span>
                            {/if}
                          {:else}
                            <span class="text-slate-600 font-mono text-[10px]">Carpeta</span>
                          {/if}
                        </td>

                        <!-- Duration -->
                        <td class="py-2 px-3 font-mono text-slate-400 text-[11px]">
                          {#if !item.is_directory && item.duration > 0}
                            {Math.floor(item.duration / 60)}:{(Math.floor(item.duration % 60)).toString().padStart(2, "0")}
                          {:else}
                            —
                          {/if}
                        </td>

                        <!-- Size -->
                        <td class="py-2 px-3 font-mono text-slate-400 text-[11px]">
                          {#if !item.is_directory && item.size > 0}
                            {(item.size / (1024 * 1024)).toFixed(1)} MB
                          {:else}
                            —
                          {/if}
                        </td>

                        <!-- Last Modified -->
                        <td class="py-2 px-3 font-mono text-slate-400 text-[11px]">
                          {item.last_modified || "—"}
                        </td>

                        <!-- Actions -->
                        <td class="py-2 px-3 text-right">
                          {#if !item.is_directory}
                            <div class="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100">
                              <!-- Play now in MusicX -->
                              <button
                                type="button"
                                onclick={(e) => { e.stopPropagation(); addToMusicXQueue(item, true); }}
                                class="p-1 rounded bg-slate-800 text-slate-200 hover:bg-audiophile-cyan hover:text-black transition cursor-pointer"
                                title="Reproducir ahora en MusicX"
                              >
                                <Play size={12} />
                              </button>

                              <!-- Add to MusicX Queue -->
                              <button
                                type="button"
                                onclick={(e) => { e.stopPropagation(); addToMusicXQueue(item, false); }}
                                class="px-1.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer text-[10px] font-semibold"
                                title="Añadir a cola de MusicX"
                              >
                                + Cola
                              </button>

                              <!-- Add to MPD remote queue -->
                              <button
                                type="button"
                                onclick={(e) => { e.stopPropagation(); handleMpdCommand("add", item.path); }}
                                class="px-1.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer text-[10px] font-semibold font-mono"
                                title="Añadir a la cola remota de MPD"
                              >
                                + MPD
                              </button>

                              <!-- Direct download if mounted -->
                              {#if config.remote_mount_path}
                                <button
                                  type="button"
                                  onclick={(e) => { e.stopPropagation(); executeTransfer("download_from_mpd", [item.path]); }}
                                  class="p-1 rounded bg-slate-800 text-emerald-400 hover:bg-emerald-500 hover:text-black transition cursor-pointer"
                                  title="Descargar pista a local"
                                >
                                  <Download size={12} />
                                </button>
                              {/if}

                              <!-- Delete Remote File -->
                              <button
                                type="button"
                                onclick={(e) => { e.stopPropagation(); promptDeleteItem("remote", item.path, item.title || item.name, false); }}
                                class="p-1 rounded bg-slate-800 text-slate-400 hover:bg-rose-950/60 hover:text-rose-400 transition cursor-pointer"
                                title="Eliminar archivo del servidor MPD"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          {:else}
                            <div class="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onclick={(e) => { e.stopPropagation(); navigateToSubfolder(item.path); }}
                                class="px-2 py-0.5 rounded text-[11px] font-semibold text-slate-400 hover:text-audiophile-cyan transition cursor-pointer"
                              >
                                Abrir
                              </button>
                              <!-- Delete Remote Folder -->
                              <button
                                type="button"
                                onclick={(e) => { e.stopPropagation(); promptDeleteItem("remote", item.path, item.name, true); }}
                                class="p-1 rounded bg-slate-800 text-slate-400 hover:bg-rose-950/60 hover:text-rose-400 transition cursor-pointer"
                                title="Eliminar carpeta de MPD"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {/if}
            </div>
          </div>
        {/if}

        <!-- ================================================================= -->
        <!-- TAB 3: MATCH & SYNCHRONIZATION -->
        <!-- ================================================================= -->
        {#if activeTab === "sync"}
          <div class="space-y-5">
            <!-- Header & Action Controls -->
            <div class="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-audiophile-border bg-slate-900/60">
              <div>
                <h3 class="text-sm font-bold text-white flex items-center gap-2">
                  <ArrowUpDown size={16} class="text-audiophile-cyan" />
                  <span>Comparador de Biblioteca (Disco en Red vs Local)</span>
                </h3>
                <p class="text-xs text-slate-400 mt-0.5">
                  Compara rutas relativas, tamaños y última modificación para sincronizar tu colección.
                </p>
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  onclick={runLibraryMatch}
                  disabled={isComparing}
                  class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-black transition cursor-pointer disabled:opacity-50 shadow-md"
                  style="background: {appearance.accentColor || '#06b6d4'};"
                >
                  <RefreshCw size={14} class={isComparing ? "animate-spin" : ""} />
                  <span>{isComparing ? "Analizando bibliotecas..." : "Ejecutar Match"}</span>
                </button>

                {#if diffResult && (diffResult.count_only_mpd > 0 || diffResult.count_only_local > 0)}
                  <button
                    type="button"
                    onclick={runSmartSync}
                    disabled={isTransferring}
                    class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-500 to-cyan-500 text-black hover:opacity-95 transition cursor-pointer disabled:opacity-50 shadow-md"
                    title="Sincronización Inteligente: descarga automáticamente lo que falte de MPD y sube lo que falte de local"
                  >
                    <Sparkles size={14} />
                    <span>Sincronización Inteligente</span>
                  </button>
                {/if}
              </div>
            </div>

            <!-- Summary Metric Cards -->
            {#if diffResult}
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div class="p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20">
                  <div class="flex items-center justify-between text-emerald-400 font-bold text-xs mb-1">
                    <span>Sincronizados</span>
                    <CheckCircle2 size={14} />
                  </div>
                  <div class="text-2xl font-black font-mono text-white">
                    {diffResult.count_in_sync.toLocaleString()}
                  </div>
                  <span class="text-[10px] text-emerald-300/70">Mismo tamaño y fecha al día</span>
                </div>

                <div class="p-3 rounded-xl border border-cyan-500/30 bg-cyan-950/20">
                  <div class="flex items-center justify-between text-cyan-400 font-bold text-xs mb-1">
                    <span>Solo en MPD (Red)</span>
                    <Download size={14} />
                  </div>
                  <div class="text-2xl font-black font-mono text-white">
                    {diffResult.count_only_mpd.toLocaleString()}
                  </div>
                  <span class="text-[10px] text-cyan-300/70">Disponibles para descargar</span>
                </div>

                <div class="p-3 rounded-xl border border-purple-500/30 bg-purple-950/20">
                  <div class="flex items-center justify-between text-purple-400 font-bold text-xs mb-1">
                    <span>Solo en Local</span>
                    <Upload size={14} />
                  </div>
                  <div class="text-2xl font-black font-mono text-white">
                    {diffResult.count_only_local.toLocaleString()}
                  </div>
                  <span class="text-[10px] text-purple-300/70">Listos para subir al disco red</span>
                </div>

                <div class="p-3 rounded-xl border border-amber-500/30 bg-amber-950/20">
                  <div class="flex items-center justify-between text-amber-400 font-bold text-xs mb-1">
                    <span>Modificados</span>
                    <Clock size={14} />
                  </div>
                  <div class="text-2xl font-black font-mono text-white">
                    {diffResult.count_modified.toLocaleString()}
                  </div>
                  <span class="text-[10px] text-amber-300/70">Difieren en fecha o tamaño</span>
                </div>
              </div>

              <!-- View Mode Toggle & Manual Folder Deletion Shortcuts -->
              <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <!-- View mode toggle: List View vs Split View (FileZilla) -->
                <div class="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    type="button"
                    onclick={() => (syncViewMode = "filezilla")}
                    class="flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition cursor-pointer {syncViewMode === 'filezilla' ? 'bg-audiophile-cyan text-black font-bold shadow-sm' : 'text-slate-400 hover:text-white'}"
                  >
                    <Columns size={13} />
                    <span>Vista Dividida (FileZilla)</span>
                  </button>
                  <button
                    type="button"
                    onclick={() => (syncViewMode = "list")}
                    class="flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition cursor-pointer {syncViewMode === 'list' ? 'bg-audiophile-cyan text-black font-bold shadow-sm' : 'text-slate-400 hover:text-white'}"
                  >
                    <List size={13} />
                    <span>Vista Lista Unificada</span>
                  </button>
                </div>

                <!-- Manual Folder Deletion Shortcuts -->
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    onclick={() => {
                      const folder = window.prompt("Introduce la ruta de la carpeta que deseas eliminar en el servidor MPD:");
                      if (folder && folder.trim()) {
                        promptDeleteItem("remote", folder.trim(), folder.trim(), true);
                      }
                    }}
                    class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-900 text-rose-300 border border-rose-900/40 hover:bg-rose-950/40 transition cursor-pointer"
                    title="Eliminar una carpeta manualmente en el disco remoto MPD"
                  >
                    <Trash2 size={12} />
                    <span>Borrar Carpeta Remota...</span>
                  </button>
                  <button
                    type="button"
                    onclick={() => {
                      const folder = window.prompt("Introduce la ruta de la carpeta que deseas eliminar en Local:");
                      if (folder && folder.trim()) {
                        promptDeleteItem("local", folder.trim(), folder.trim(), true);
                      }
                    }}
                    class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-900 text-rose-300 border border-rose-900/40 hover:bg-rose-950/40 transition cursor-pointer"
                    title="Eliminar una carpeta manualmente en la biblioteca local"
                  >
                    <Trash2 size={12} />
                    <span>Borrar Carpeta Local...</span>
                  </button>
                </div>
              </div>

              {#if syncViewMode === "filezilla"}
                <!-- ========================================== -->
                <!-- FILEZILLA STYLE SPLIT VIEW (LOCAL ⇄ REMOTE)-->
                <!-- ========================================== -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[420px]">
                  <!-- Left Column: Local Library -->
                  <div class="flex flex-col h-full rounded-xl border border-purple-500/30 bg-slate-950/90 overflow-hidden shadow-lg">
                    <!-- Local Header -->
                    <div class="p-3 border-b border-purple-500/20 bg-purple-950/20 shrink-0 space-y-2">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2 min-w-0">
                          <HardDrive size={15} class="text-purple-400 shrink-0" />
                          <span class="text-xs font-bold text-white truncate">Local: {librarySettings.musicFolder || "No configurada"}</span>
                        </div>
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/20 text-purple-300 font-bold shrink-0">
                          {filteredLocalItems.length} archivos
                        </span>
                      </div>
                      <div class="relative w-full">
                        <Search size={12} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="text"
                          bind:value={syncLocalSearch}
                          placeholder="Filtrar colección local..."
                          class="w-full pl-7 pr-2 py-1 rounded-lg border border-purple-500/20 bg-slate-950 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-400 font-mono"
                        />
                      </div>
                    </div>

                    <!-- Local Items Table -->
                    <div class="flex-1 overflow-y-auto">
                      <table class="w-full text-left text-xs border-collapse">
                        <thead class="sticky top-0 bg-slate-900 border-b border-purple-500/20 text-[10px] font-mono text-purple-300/70 select-none">
                          <tr>
                            <th class="py-1.5 px-2.5">Pista / Archivo Local</th>
                            <th class="py-1.5 px-2 w-16">Tam</th>
                            <th class="py-1.5 px-2 w-20">Estado</th>
                            <th class="py-1.5 px-2 w-24 text-right">Acción</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-900 font-sans">
                          {#each filteredLocalItems as item}
                            <tr class="hover:bg-purple-950/20 transition group">
                              <td class="py-1.5 px-2.5 min-w-0">
                                <span class="font-medium text-slate-200 block truncate" title={item.relative_path}>
                                  {item.title || item.relative_path.split("/").pop()}
                                </span>
                                <span class="text-[10px] font-mono text-slate-500 block truncate" title={item.relative_path}>
                                  {item.relative_path}
                                </span>
                              </td>
                              <td class="py-1.5 px-2 font-mono text-[10px] text-slate-400 whitespace-nowrap">
                                {item.local_size ? `${(item.local_size / (1024 * 1024)).toFixed(1)}M` : "—"}
                              </td>
                              <td class="py-1.5 px-2 whitespace-nowrap">
                                {#if item.status === "in_sync"}
                                  <span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-400">
                                    Al día
                                  </span>
                                {:else if item.status === "only_local"}
                                  <span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-purple-500/20 text-purple-300">
                                    Solo Local
                                  </span>
                                {:else}
                                  <span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-400">
                                    Modif.
                                  </span>
                                {/if}
                              </td>
                              <td class="py-1.5 px-2 text-right whitespace-nowrap">
                                <div class="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100">
                                  <button
                                    type="button"
                                    onclick={() => executeTransfer("upload_to_mpd", [item.relative_path])}
                                    class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-600 hover:bg-purple-500 text-white transition cursor-pointer flex items-center gap-1"
                                    title="Subir este archivo al disco en red de MPD"
                                  >
                                    <Upload size={10} />
                                    <span>Subir →</span>
                                  </button>
                                  <button
                                    type="button"
                                    onclick={() => promptDeleteItem("local", item.relative_path, item.title || item.relative_path, false)}
                                    class="p-1 rounded bg-slate-800 text-slate-400 hover:bg-rose-950 hover:text-rose-400 transition cursor-pointer"
                                    title="Eliminar este archivo de la biblioteca local"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <!-- Right Column: MPD Remote Storage -->
                  <div class="flex flex-col h-full rounded-xl border border-cyan-500/30 bg-slate-950/90 overflow-hidden shadow-lg">
                    <!-- Remote Header -->
                    <div class="p-3 border-b border-cyan-500/20 bg-cyan-950/20 shrink-0 space-y-2">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2 min-w-0">
                          <Server size={15} class="text-cyan-400 shrink-0" />
                          <span class="text-xs font-bold text-white truncate">MPD Remoto: {config.remote_mount_path || config.path_strip_prefix || "Disco en Red"}</span>
                        </div>
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-300 font-bold shrink-0">
                          {filteredRemoteItems.length} archivos
                        </span>
                      </div>
                      <div class="relative w-full">
                        <Search size={12} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="text"
                          bind:value={syncRemoteSearch}
                          placeholder="Filtrar archivos MPD..."
                          class="w-full pl-7 pr-2 py-1 rounded-lg border border-cyan-500/20 bg-slate-950 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-mono"
                        />
                      </div>
                    </div>

                    <!-- Remote Items Table -->
                    <div class="flex-1 overflow-y-auto">
                      <table class="w-full text-left text-xs border-collapse">
                        <thead class="sticky top-0 bg-slate-900 border-b border-cyan-500/20 text-[10px] font-mono text-cyan-300/70 select-none">
                          <tr>
                            <th class="py-1.5 px-2.5">Pista / Archivo Remoto MPD</th>
                            <th class="py-1.5 px-2 w-16">Tam</th>
                            <th class="py-1.5 px-2 w-20">Estado</th>
                            <th class="py-1.5 px-2 w-24 text-right">Acción</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-900 font-sans">
                          {#each filteredRemoteItems as item}
                            <tr class="hover:bg-cyan-950/20 transition group">
                              <td class="py-1.5 px-2.5 min-w-0">
                                <span class="font-medium text-slate-200 block truncate" title={item.relative_path}>
                                  {item.title || item.relative_path.split("/").pop()}
                                </span>
                                <span class="text-[10px] font-mono text-slate-500 block truncate" title={item.relative_path}>
                                  {item.relative_path}
                                </span>
                              </td>
                              <td class="py-1.5 px-2 font-mono text-[10px] text-slate-400 whitespace-nowrap">
                                {item.mpd_size ? `${(item.mpd_size / (1024 * 1024)).toFixed(1)}M` : "—"}
                              </td>
                              <td class="py-1.5 px-2 whitespace-nowrap">
                                {#if item.status === "in_sync"}
                                  <span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-400">
                                    Al día
                                  </span>
                                {:else if item.status === "only_mpd"}
                                  <span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-cyan-500/20 text-cyan-400">
                                    Solo MPD
                                  </span>
                                {:else}
                                  <span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-400">
                                    Modif.
                                  </span>
                                {/if}
                              </td>
                              <td class="py-1.5 px-2 text-right whitespace-nowrap">
                                <div class="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100">
                                  <button
                                    type="button"
                                    onclick={() => executeTransfer("download_from_mpd", [item.relative_path])}
                                    class="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-600 hover:bg-cyan-500 text-black transition cursor-pointer flex items-center gap-1"
                                    title="Descargar este archivo al almacenamiento local"
                                  >
                                    <Download size={10} />
                                    <span>← Bajar</span>
                                  </button>
                                  <button
                                    type="button"
                                    onclick={() => promptDeleteItem("remote", item.relative_path, item.title || item.relative_path, false)}
                                    class="p-1 rounded bg-slate-800 text-slate-400 hover:bg-rose-950 hover:text-rose-400 transition cursor-pointer"
                                    title="Eliminar este archivo del servidor MPD"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              {:else}
                <!-- Filter Tabs & Batch Buttons -->
                <div class="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <!-- Filters -->
                  <div class="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                    <button
                      type="button"
                      onclick={() => (diffFilter = "all")}
                      class="px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer {diffFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}"
                    >
                      Todos ({diffResult.items.length})
                    </button>

                    <button
                      type="button"
                      onclick={() => (diffFilter = "only_mpd")}
                      class="px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer {diffFilter === 'only_mpd' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'}"
                    >
                      Solo MPD ({diffResult.count_only_mpd})
                    </button>

                    <button
                      type="button"
                      onclick={() => (diffFilter = "only_local")}
                      class="px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer {diffFilter === 'only_local' ? 'bg-purple-500/20 text-purple-300' : 'text-slate-400 hover:text-white'}"
                    >
                      Solo Local ({diffResult.count_only_local})
                    </button>

                    <button
                      type="button"
                      onclick={() => (diffFilter = "modified")}
                      class="px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer {diffFilter === 'modified' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-white'}"
                    >
                      Modificados ({diffResult.count_modified})
                    </button>

                    <button
                      type="button"
                      onclick={() => (diffFilter = "in_sync")}
                      class="px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer {diffFilter === 'in_sync' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-white'}"
                    >
                      Al día ({diffResult.count_in_sync})
                    </button>
                  </div>

                  <!-- Batch Actions -->
                  <div class="flex items-center gap-2">
                    <div class="relative w-48">
                      <Search size={13} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        bind:value={diffSearch}
                        placeholder="Buscar diferencia..."
                        class="w-full pl-8 pr-3 py-1 rounded-lg border border-audiophile-border bg-slate-950 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-audiophile-cyan"
                      />
                    </div>

                    {#if selectedDiffPaths.size > 0}
                      <button
                        type="button"
                        onclick={() => executeTransfer("download_from_mpd")}
                        class="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-cyan-500 text-black hover:bg-cyan-400 transition cursor-pointer"
                      >
                        <Download size={13} />
                        <span>Descargar ({selectedDiffPaths.size})</span>
                      </button>

                      <button
                        type="button"
                        onclick={() => executeTransfer("upload_to_mpd")}
                        class="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-purple-500 text-white hover:bg-purple-400 transition cursor-pointer"
                      >
                        <Upload size={13} />
                        <span>Subir ({selectedDiffPaths.size})</span>
                      </button>

                      <button
                        type="button"
                        onclick={clearDiffSelection}
                        class="px-2 py-1 text-xs text-slate-400 hover:text-white transition cursor-pointer"
                      >
                        Limpiar
                      </button>
                    {:else}
                      {#if diffResult.count_only_mpd > 0}
                        <button
                          type="button"
                          onclick={() => executeTransfer("download_from_mpd")}
                          class="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500 hover:text-black transition cursor-pointer"
                        >
                          <Download size={13} />
                          <span>Descargar todo de MPD ({diffResult.count_only_mpd})</span>
                        </button>
                      {/if}

                      {#if diffResult.count_only_local > 0}
                        <button
                          type="button"
                          onclick={() => executeTransfer("upload_to_mpd")}
                          class="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500 hover:text-white transition cursor-pointer"
                        >
                          <Upload size={13} />
                          <span>Subir todo a MPD ({diffResult.count_only_local})</span>
                        </button>
                      {/if}
                    {/if}
                  </div>
                </div>

                <!-- Differences Table -->
                <div class="rounded-xl border border-audiophile-border bg-slate-950/80 overflow-y-auto max-h-[360px]">
                  <table class="w-full text-left text-xs border-collapse">
                    <thead class="sticky top-0 bg-slate-900 border-b border-audiophile-border text-[11px] font-mono text-slate-400 select-none">
                      <tr>
                        <th class="py-2 px-3 w-8">
                          <input
                            type="checkbox"
                            checked={selectedDiffPaths.size > 0 && selectedDiffPaths.size === filteredDiffItems.length}
                            onchange={(e) => {
                              if ((e.currentTarget as HTMLInputElement).checked) {
                                selectAllFilteredDiff();
                              } else {
                                clearDiffSelection();
                              }
                            }}
                            class="rounded bg-slate-800 border-slate-700 text-audiophile-cyan focus:ring-0 cursor-pointer"
                          />
                        </th>
                        <th class="py-2 px-3">Ruta Relativa / Canción</th>
                        <th class="py-2 px-3 w-28">Estado</th>
                        <th class="py-2 px-3 w-36">Última Mod. MPD</th>
                        <th class="py-2 px-3 w-36">Última Mod. Local</th>
                        <th class="py-2 px-3 w-28 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-900 font-sans">
                      {#each filteredDiffItems as item}
                        <tr class="hover:bg-slate-900/60 transition group {selectedDiffPaths.has(item.relative_path) ? 'bg-slate-900/40' : ''}">
                          <!-- Selection Checkbox -->
                          <td class="py-2 px-3">
                            <input
                              type="checkbox"
                              checked={selectedDiffPaths.has(item.relative_path)}
                              onchange={() => toggleSelectDiff(item.relative_path)}
                              class="rounded bg-slate-800 border-slate-700 text-audiophile-cyan focus:ring-0 cursor-pointer"
                            />
                          </td>

                          <!-- Relative Path / Title -->
                          <td class="py-2 px-3">
                            <div class="font-medium text-slate-200 truncate max-w-[340px]">
                              {item.title}
                            </div>
                            <div class="text-[11px] font-mono text-slate-500 truncate max-w-[340px]">
                              {item.relative_path}
                            </div>
                          </td>

                          <!-- Status Badge -->
                          <td class="py-2 px-3">
                            {#if item.status === "in_sync"}
                              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                Al día
                              </span>
                            {:else if item.status === "only_mpd"}
                              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                                Solo en MPD
                              </span>
                            {:else if item.status === "only_local"}
                              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                                Solo en Local
                              </span>
                            {:else if item.status === "modified"}
                              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                Modificado ({item.newer_side === 'mpd' ? 'MPD +' : item.newer_side === 'local' ? 'Local +' : 'Tam'})
                              </span>
                            {/if}
                          </td>

                          <!-- MPD Timestamp & Size -->
                          <td class="py-2 px-3 font-mono text-slate-400 text-[11px]">
                            <div>{item.mpd_mtime_str || "—"}</div>
                            {#if item.mpd_size}
                              <div class="text-[10px] text-slate-600">{(item.mpd_size / (1024 * 1024)).toFixed(1)} MB</div>
                            {/if}
                          </td>

                          <!-- Local Timestamp & Size -->
                          <td class="py-2 px-3 font-mono text-slate-400 text-[11px]">
                            <div>{item.local_mtime_str || "—"}</div>
                            {#if item.local_size}
                              <div class="text-[10px] text-slate-600">{(item.local_size / (1024 * 1024)).toFixed(1)} MB</div>
                            {/if}
                          </td>

                          <!-- Quick Single Action -->
                          <td class="py-2 px-3 text-right">
                            <div class="flex items-center justify-end gap-1">
                              {#if item.status === "only_mpd" || (item.status === "modified" && item.newer_side === "mpd")}
                                <button
                                  type="button"
                                  onclick={() => executeTransfer("download_from_mpd", [item.relative_path])}
                                  class="px-2 py-1 rounded text-[11px] font-semibold bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500 hover:text-black transition cursor-pointer"
                                  title="Descargar este archivo de MPD a local"
                                >
                                  Descargar
                                </button>
                              {:else if item.status === "only_local" || (item.status === "modified" && item.newer_side === "local")}
                                <button
                                  type="button"
                                  onclick={() => executeTransfer("upload_to_mpd", [item.relative_path])}
                                  class="px-2 py-1 rounded text-[11px] font-semibold bg-purple-500/20 text-purple-300 hover:bg-purple-500 hover:text-white transition cursor-pointer"
                                  title="Subir este archivo de local a MPD"
                                >
                                  Subir
                                </button>
                              {:else}
                                <span class="text-slate-600 text-xs">—</span>
                              {/if}
                              <button
                                type="button"
                                onclick={() => promptDeleteItem(item.status === 'only_local' ? 'local' : 'remote', item.relative_path, item.title, false)}
                                class="p-1 rounded bg-slate-800 text-slate-400 hover:bg-rose-950 hover:text-rose-400 transition cursor-pointer"
                                title="Eliminar archivo"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            {:else}
              <div class="py-16 text-center text-slate-500 space-y-2">
                <ArrowUpDown size={32} class="mx-auto opacity-30 text-audiophile-cyan" />
                <p class="text-xs">Haz clic en "Ejecutar Match" para comparar tu biblioteca local contra el disco duro en red de MPD.</p>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Modal Footer -->
      <div class="px-6 py-3 border-t border-audiophile-border bg-audiophile-surface2 flex items-center justify-between text-xs text-slate-400 shrink-0">
        <div class="flex items-center gap-2 font-mono text-[11px]">
          <span>Servidor actual:</span>
          <span class="text-white font-bold">{config.host}:{config.port}</span>
          {#if config.remote_mount_path}
            <span class="text-slate-600">•</span>
            <span class="text-slate-400 truncate max-w-xs" title={config.remote_mount_path}>
              Montado en: {config.remote_mount_path}
            </span>
          {/if}
        </div>

        <button
          type="button"
          onclick={closeModal}
          class="px-4 py-1.5 rounded-lg border border-audiophile-border bg-slate-800 text-xs font-semibold text-slate-200 hover:text-white hover:border-slate-600 transition cursor-pointer"
        >
          Cerrar
        </button>
      </div>
    </div>
  </div>

  <!-- Delete Confirmation Modal -->
  {#if deleteConfirmModal}
    <div class="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div class="w-full max-w-md p-6 rounded-2xl border border-rose-800/80 bg-slate-950 shadow-2xl space-y-4 text-slate-100">
        <div class="flex items-center gap-3 text-rose-400">
          <div class="p-2.5 rounded-xl bg-rose-950/80 border border-rose-800/60">
            <Trash2 size={24} />
          </div>
          <div>
            <h3 class="text-base font-bold text-white">Confirmar Eliminación</h3>
            <p class="text-xs text-rose-400/90 font-mono">
              {deleteConfirmModal.target === "remote" ? "Servidor MPD (Disco en Red)" : "Almacenamiento Local"}
            </p>
          </div>
        </div>

        <div class="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-2">
          <p class="text-slate-300">
            ¿Estás seguro de que deseas eliminar permanentemente {deleteConfirmModal.isDirectory ? "la carpeta completa y todo su contenido" : "el archivo"}?
          </p>
          <p class="font-mono text-[11px] text-rose-300 break-all bg-black/50 p-2 rounded border border-slate-800">
            {deleteConfirmModal.path}
          </p>
          <p class="text-[10px] text-amber-400/90">
            ⚠️ Esta acción es irreversible. {deleteConfirmModal.target === 'remote' ? 'Se notificará a MPD para actualizar la base de datos automáticamente.' : ''}
          </p>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onclick={() => (deleteConfirmModal = null)}
            class="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-850 hover:bg-slate-800 text-slate-300 transition cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onclick={executeDeletion}
            class="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer shadow-lg shadow-rose-950/50"
          >
            Eliminar Definitivamente
          </button>
        </div>
      </div>
    </div>
  {/if}
{/if}
