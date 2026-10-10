<script lang="ts">
  import { onMount } from "svelte";
  import {
    X,
    Tag,
    Folder,
    Music,
    Save,
    Loader2,
    CheckCircle,
    Sparkles,
    Image as ImageIcon,
    FolderOpen,
    Search,
    Upload,
    Trash2,
    Layers,
    Disc,
    Globe,
    FileAudio,
    ListMusic,
  } from "@lucide/svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import { useMusicStore, appearanceStore } from "../../store/index.ts";
  import * as api from "../../services/api";

  interface Props {
    isOpen?: boolean;
    onClose?: () => void;
  }

  let { isOpen = false, onClose = undefined }: Props = $props();

  let appearance = $derived($appearanceStore);
  let accentColor = $derived(appearance.accentColor || "#06b6d4");

  // Mode: "single" track or "folder" batch
  let activeMode = $state<"single" | "folder">("single");

  // Single file state
  let singleFilePath = $state<string>("");
  let singleFileInfo = $state<api.TrackTagInfo | null>(null);
  let singleTags = $state<api.TrackTagUpdate>({
    title: "",
    artist: "",
    album: "",
    year: "",
    track: "",
    genre: "",
    comment: "",
  });
  let singleCoverUrl = $state<string | null>(null);

  // Folder batch state
  let folderPath = $state<string>("");
  let folderTracks = $state<api.TrackTagInfo[]>([]);
  let commonTags = $state<{
    artist: string;
    album: string;
    year: string;
    genre: string;
    coverUrl: string | null;
  }>({
    artist: "",
    album: "",
    year: "",
    genre: "",
    coverUrl: null,
  });

  // Cover Art Studio (integrated) state
  let coverStudioTab = $state<"online" | "local" | "spectrogram">("online");
  let coverSearchQuery = $state<string>("");
  let coverSearchResults = $state<api.OnlineCoverResult[]>([]);
  let isSearchingCovers = $state<boolean>(false);
  let coverSearchSource = $state<"all" | "web">("all");

  // Spectrogram state
  const SPECTRO_PALETTES = [
    { id: "magma", name: "Magma (Cálido)" },
    { id: "plasma", name: "Plasma (Neón)" },
    { id: "viridis", name: "Viridis (Analítico)" },
    { id: "fire", name: "Fire (Fuego)" },
    { id: "cool", name: "Cool (Cian & Azul)" },
    { id: "rainbow", name: "Rainbow (Espectral)" },
    { id: "nebulae", name: "Nebulae (Espacial)" },
    { id: "cividis", name: "Cividis (Laboratorio)" },
  ];
  let selectedPalette = $state<string>("magma");
  let isGeneratingSpectro = $state<boolean>(false);

  // Global UI feedback state
  let isLoading = $state<boolean>(false);
  let isSaving = $state<boolean>(false);
  let isFetchingMetadata = $state<boolean>(false);
  let statusMessage = $state<{ type: "success" | "error"; text: string } | null>(null);

  function showStatus(text: string, type: "success" | "error" = "success") {
    statusMessage = { type, text };
    setTimeout(() => {
      if (statusMessage?.text === text) statusMessage = null;
    }, 4500);
  }

  // Load single audio file
  async function loadSingleFile(path: string) {
    if (!path) return;
    isLoading = true;
    statusMessage = null;
    singleFilePath = path;
    try {
      const info = await api.readSingleTrackTags(path);
      singleFileInfo = info;
      singleTags = {
        title: info.title || info.filename.replace(/\.[^/.]+$/, ""),
        artist: info.artist || "",
        album: info.album || "",
        year: info.year || "",
        track: info.track || "",
        genre: info.genre || "",
        comment: info.comment || "",
      };

      // Try reading current embedded cover
      const existingCover = await api.getTrackCoverArt(path);
      singleCoverUrl = existingCover || null;

      // Auto-populate cover search query
      coverSearchQuery = `${singleTags.artist} ${singleTags.album || singleTags.title}`.trim();
    } catch (e: any) {
      showStatus(`Error al cargar archivo: ${e?.message || e}`, "error");
    } finally {
      isLoading = false;
    }
  }

  // Quick load currently playing track in MusicX
  async function loadCurrentPlayingTrack() {
    const cur = useMusicStore.getState().currentTrack;
    if (cur && cur.filepath && !cur.filepath.startsWith("stream:")) {
      await loadSingleFile(cur.filepath);
    } else {
      showStatus("No hay una pista local reproduciéndose en este momento.", "error");
    }
  }

  // Pick single file via Tauri native dialog
  async function handlePickFile() {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "Archivos de Audio",
            extensions: ["mp3", "flac", "wav", "ogg", "m4a", "aac", "opus", "alac", "aiff", "wma"],
          },
        ],
      });
      if (typeof selected === "string") {
        await loadSingleFile(selected);
      }
    } catch (e: any) {
      showStatus(`Error al abrir explorador: ${e?.message || e}`, "error");
    }
  }

  // Pick folder via Tauri native dialog
  async function handlePickFolder() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (typeof selected === "string") {
        await loadFolder(selected);
      }
    } catch (e: any) {
      showStatus(`Error al abrir explorador: ${e?.message || e}`, "error");
    }
  }

  // Load folder tracks
  async function loadFolder(path: string) {
    if (!path) return;
    isLoading = true;
    folderPath = path;
    statusMessage = null;
    try {
      const tracks = await api.readFolderTracks(path);
      folderTracks = tracks;
      if (tracks.length > 0) {
        // Derive common tags if all match
        const first = tracks[0];
        commonTags = {
          artist: tracks.every((t) => t.artist === first.artist) ? first.artist || "" : "",
          album: tracks.every((t) => t.album === first.album) ? first.album || "" : "",
          year: tracks.every((t) => t.year === first.year) ? first.year || "" : "",
          genre: tracks.every((t) => t.genre === first.genre) ? first.genre || "" : "",
          coverUrl: null,
        };

        const existingCover = await api.getTrackCoverArt(first.path);
        commonTags.coverUrl = existingCover || null;

        coverSearchQuery = `${commonTags.artist} ${commonTags.album}`.trim();
        showStatus(`Se han detectado ${tracks.length} pistas en la carpeta.`);
      } else {
        showStatus("No se encontraron pistas de audio en esta carpeta.", "error");
      }
    } catch (e: any) {
      showStatus(`Error al leer carpeta: ${e?.message || e}`, "error");
    } finally {
      isLoading = false;
    }
  }

  // Online auto-complete metadata
  async function handleFetchOnlineMetadata() {
    const q = coverSearchQuery || `${singleTags.artist} ${singleTags.title}`.trim();
    if (!q) {
      showStatus("Introduce un título o artista para buscar metadatos online.", "error");
      return;
    }
    isFetchingMetadata = true;
    try {
      const meta = await api.fetchOnlineMetadata(q);
      if (meta) {
        singleTags.title = meta.title || singleTags.title;
        singleTags.artist = meta.artist || singleTags.artist;
        singleTags.album = meta.album || singleTags.album;
        showStatus("¡Metadatos ID3 autocompletados desde internet!");
      } else {
        showStatus("No se encontraron coincidencias online para esta búsqueda.", "error");
      }
    } catch (e: any) {
      showStatus(`Error en consulta online: ${e?.message || e}`, "error");
    } finally {
      isFetchingMetadata = false;
    }
  }

  // Search covers online (iTunes 1200px / Deezer / Web)
  async function handleSearchCovers() {
    const q = coverSearchQuery.trim();
    if (!q) return;
    isSearchingCovers = true;
    try {
      const res = await api.searchOnlineCovers(q, coverSearchSource === "all" ? undefined : "web");
      coverSearchResults = res;
      if (res.length === 0) {
        showStatus("No se encontraron carátulas para esta búsqueda.", "error");
      }
    } catch (e: any) {
      showStatus(`Error al buscar carátulas: ${e?.message || e}`, "error");
    } finally {
      isSearchingCovers = false;
    }
  }

  // Pick local cover image
  async function handlePickLocalImage() {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Imágenes", extensions: ["jpg", "jpeg", "png", "webp", "bmp"] }],
      });
      if (typeof selected === "string") {
        const dataUrl = await api.loadImageDataUrl(selected);
        applyCoverToCurrentTarget(dataUrl);
        showStatus("Carátula local seleccionada correctamente.");
      }
    } catch (e: any) {
      showStatus(`Error al cargar imagen: ${e?.message || e}`, "error");
    }
  }

  // Generate Spectrogram Cover
  async function handleGenerateSpectrogram() {
    const targetAudio = activeMode === "single" ? singleFilePath : folderTracks[0]?.path;
    if (!targetAudio) {
      showStatus("Carga un archivo de audio primero para generar el espectrograma.", "error");
      return;
    }
    isGeneratingSpectro = true;
    try {
      const specUrl = await api.generateSpectrogram(targetAudio, selectedPalette);
      applyCoverToCurrentTarget(specUrl);
      showStatus("¡Espectrograma HD 1000x1000 generado con éxito!");
    } catch (e: any) {
      showStatus(`Error al generar espectrograma: ${e?.message || e}`, "error");
    } finally {
      isGeneratingSpectro = false;
    }
  }

  function applyCoverToCurrentTarget(url: string | null) {
    if (activeMode === "single") {
      singleCoverUrl = url;
    } else {
      commonTags.coverUrl = url;
    }
  }

  // Save single track tags & cover
  async function handleSaveSingleTrack() {
    if (!singleFilePath) {
      showStatus("No hay ningún archivo seleccionado para guardar.", "error");
      return;
    }
    isSaving = true;
    statusMessage = null;
    try {
      await api.writeTrackTags(singleFilePath, singleTags, singleCoverUrl);
      showStatus("¡Metadatos ID3 y carátula guardados en el archivo con éxito!");

      // Refresh MusicStore if active track matches
      const store = useMusicStore.getState();
      if (store.currentTrack && store.currentTrack.filepath === singleFilePath) {
        store.fetchLibraryTracks().catch(() => {});
      }
    } catch (e: any) {
      showStatus(`Error al guardar etiquetas: ${e?.message || e}`, "error");
    } finally {
      isSaving = false;
    }
  }

  // Save batch folder tags & cover
  async function handleSaveBatchFolder() {
    if (folderTracks.length === 0) {
      showStatus("No hay pistas cargadas en el lote para guardar.", "error");
      return;
    }
    isSaving = true;
    statusMessage = null;
    try {
      const requests: api.BatchTagItem[] = folderTracks.map((t) => ({
        filePath: t.path,
        tags: {
          title: t.title,
          artist: commonTags.artist || t.artist,
          album: commonTags.album || t.album,
          year: commonTags.year || t.year,
          track: t.track,
          genre: commonTags.genre || t.genre,
        },
        coverUrl: commonTags.coverUrl,
      }));

      await api.batchWriteFolderTags(requests);
      showStatus(`¡Lote de ${requests.length} pistas guardado y actualizado con éxito!`);
      useMusicStore.getState().fetchLibraryTracks().catch(() => {});
    } catch (e: any) {
      showStatus(`Error en guardado por lotes: ${e?.message || e}`, "error");
    } finally {
      isSaving = false;
    }
  }

  // Auto-number folder tracks 1..N
  function autoNumberFolderTracks() {
    folderTracks = folderTracks.map((t, idx) => ({
      ...t,
      track: String(idx + 1),
    }));
    showStatus("Pistas renumeradas correlativamente (1 a " + folderTracks.length + ").");
  }

  function handleClose() {
    if (onClose) onClose();
    else useMusicStore.getState().setTagEditorOpen(false);
  }

  // Auto-load currently playing track if open and empty
  onMount(() => {
    const cur = useMusicStore.getState().currentTrack;
    if (cur && cur.filepath && !cur.filepath.startsWith("stream:")) {
      loadSingleFile(cur.filepath);
    }
  });
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 transition-all duration-200 select-none"
    onclick={(e) => {
      if (e.target === e.currentTarget) handleClose();
    }}
  >
    <div
      class="flex flex-col w-full max-w-5xl h-[88vh] rounded-2xl border bg-slate-950/95 shadow-2xl overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-150"
      style="border-color: {accentColor}35; box-shadow: 0 0 40px {accentColor}18;"
    >
      <!-- Modal Header -->
      <div
        class="flex items-center justify-between px-6 py-3.5 border-b shrink-0 bg-slate-900/60"
        style="border-color: {accentColor}25;"
      >
        <div class="flex items-center gap-3">
          <div
            class="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
            style="background: {accentColor}22; border: 1px solid {accentColor}44; color: {accentColor};"
          >
            <Tag size={19} />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-base font-bold tracking-tight text-white font-sans">
                Editor de Metadatos ID3 & Carátulas
              </h2>
              <span
                class="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold"
                style="background: {accentColor}20; color: {accentColor}; border: 1px solid {accentColor}35;"
              >
                Soundix Studio
              </span>
            </div>
            <p class="text-xs text-slate-400 font-sans">
              Edita etiquetas en archivo de audio sin pérdida y busca carátulas de alta resolución
            </p>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <!-- Mode Toggle -->
          <div class="flex p-0.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs font-semibold">
            <button
              type="button"
              onclick={() => (activeMode = "single")}
              class="flex items-center gap-1.5 px-3 py-1 rounded-md transition cursor-pointer {activeMode === 'single' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}"
              style={activeMode === "single" ? `color: ${accentColor}; font-weight: 700;` : ""}
            >
              <FileAudio size={13} />
              <span>Pista Individual</span>
            </button>
            <button
              type="button"
              onclick={() => (activeMode = "folder")}
              class="flex items-center gap-1.5 px-3 py-1 rounded-md transition cursor-pointer {activeMode === 'folder' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}"
              style={activeMode === "folder" ? `color: ${accentColor}; font-weight: 700;` : ""}
            >
              <Folder size={13} />
              <span>Álbum / Carpeta</span>
            </button>
          </div>

          <button
            type="button"
            onclick={handleClose}
            class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition cursor-pointer"
            title="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <!-- Action status bar / Alerts -->
      {#if statusMessage}
        <div
          class="px-6 py-2 text-xs font-medium flex items-center gap-2 border-b transition-all {statusMessage.type === 'success' ? 'bg-emerald-950/70 border-emerald-800/60 text-emerald-300' : 'bg-rose-950/70 border-rose-800/60 text-rose-300'}"
        >
          {#if statusMessage.type === "success"}
            <CheckCircle size={14} class="shrink-0 text-emerald-400" />
          {:else}
            <X size={14} class="shrink-0 text-rose-400" />
          {/if}
          <span>{statusMessage.text}</span>
        </div>
      {/if}

      <!-- Quick Action Toolbar -->
      <div
        class="flex flex-wrap items-center justify-between px-6 py-2.5 border-b bg-slate-900/40 text-xs shrink-0 gap-2"
        style="border-color: {accentColor}18;"
      >
        <div class="flex items-center gap-2 flex-wrap">
          {#if activeMode === "single"}
            <button
              type="button"
              onclick={handlePickFile}
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-slate-800/80 hover:bg-slate-700 transition font-medium cursor-pointer"
              style="border-color: {accentColor}40;"
            >
              <FolderOpen size={13} style="color: {accentColor};" />
              <span>Examinar Archivo...</span>
            </button>
            <button
              type="button"
              onclick={loadCurrentPlayingTrack}
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-slate-800/80 hover:bg-slate-700 transition font-medium cursor-pointer text-slate-200"
              style="border-color: {accentColor}40;"
            >
              <Music size={13} style="color: {accentColor};" />
              <span>Cargar Pista Actual</span>
            </button>
            <button
              type="button"
              onclick={handleFetchOnlineMetadata}
              disabled={isFetchingMetadata}
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-slate-800/80 hover:bg-slate-700 transition font-medium cursor-pointer text-slate-200 disabled:opacity-50"
              style="border-color: {accentColor}40;"
            >
              {#if isFetchingMetadata}
                <Loader2 size={13} class="animate-spin text-cyan-400" />
              {:else}
                <Sparkles size={13} style="color: {accentColor};" />
              {/if}
              <span>Autocompletar Online</span>
            </button>
          {:else}
            <button
              type="button"
              onclick={handlePickFolder}
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-slate-800/80 hover:bg-slate-700 transition font-medium cursor-pointer"
              style="border-color: {accentColor}40;"
            >
              <FolderOpen size={13} style="color: {accentColor};" />
              <span>Examinar Carpeta...</span>
            </button>
            <button
              type="button"
              onclick={autoNumberFolderTracks}
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-slate-800/80 hover:bg-slate-700 transition font-medium cursor-pointer text-slate-200"
              style="border-color: {accentColor}40;"
            >
              <ListMusic size={13} style="color: {accentColor};" />
              <span>Renumerar 1..N</span>
            </button>
          {/if}
        </div>

        <!-- File/Folder path indicator -->
        <div class="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 truncate max-w-md">
          {#if isLoading}
            <Loader2 size={12} class="animate-spin text-cyan-400 shrink-0" />
          {/if}
          <span class="truncate">
            {#if activeMode === "single"}
              {singleFilePath || "Ningún archivo cargado"}
            {:else}
              {folderPath ? `${folderPath} (${folderTracks.length} pistas)` : "Ninguna carpeta cargada"}
            {/if}
          </span>
        </div>
      </div>

      <!-- Main Body: Two Columns (Tags on Left, Cover Studio on Right) -->
      <div class="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        <!-- ── Left Column: Metadata Tags (7 cols) ── -->
        <div class="lg:col-span-7 flex flex-col h-full border-r overflow-y-auto p-6 space-y-4" style="border-color: {accentColor}20;">
          {#if activeMode === "single"}
            <!-- Single Track Tags Form -->
            <div class="flex items-center justify-between pb-2 border-b border-slate-800">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Tag size={13} style="color: {accentColor};" />
                Etiquetas ID3 de la Pista
              </span>
              {#if singleFileInfo}
                <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {singleFileInfo.ext.toUpperCase()} · {(singleFileInfo.bitRate / 1000).toFixed(0)} kbps · {Math.floor(singleFileInfo.duration / 60)}:{(Math.floor(singleFileInfo.duration % 60)).toString().padStart(2, "0")}
                </span>
              {/if}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Title -->
              <div class="md:col-span-2">
                <label for="track-title-input" class="block text-[11px] font-medium text-slate-400 mb-1">Título de la Canción</label>
                <input
                  id="track-title-input"
                  type="text"
                  bind:value={singleTags.title}
                  placeholder="Ej. Bohemian Rhapsody"
                  class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 focus:border-cyan-500 focus:outline-none text-sm font-medium text-white transition"
                />
              </div>

              <!-- Artist -->
              <div>
                <label for="track-artist-input" class="block text-[11px] font-medium text-slate-400 mb-1">Artista / Intérprete</label>
                <input
                  id="track-artist-input"
                  type="text"
                  bind:value={singleTags.artist}
                  placeholder="Ej. Queen"
                  class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 focus:border-cyan-500 focus:outline-none text-sm font-medium text-white transition"
                />
              </div>

              <!-- Album -->
              <div>
                <label for="track-album-input" class="block text-[11px] font-medium text-slate-400 mb-1">Álbum</label>
                <input
                  id="track-album-input"
                  type="text"
                  bind:value={singleTags.album}
                  placeholder="Ej. A Night at the Opera"
                  class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 focus:border-cyan-500 focus:outline-none text-sm font-medium text-white transition"
                />
              </div>

              <!-- Year -->
              <div>
                <label for="track-year-input" class="block text-[11px] font-medium text-slate-400 mb-1">Año / Fecha</label>
                <input
                  id="track-year-input"
                  type="text"
                  bind:value={singleTags.year}
                  placeholder="Ej. 1975"
                  class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 focus:border-cyan-500 focus:outline-none text-sm font-mono text-white transition"
                />
              </div>

              <!-- Track Number -->
              <div>
                <label for="track-number-input" class="block text-[11px] font-medium text-slate-400 mb-1">Nº de Pista</label>
                <input
                  id="track-number-input"
                  type="text"
                  bind:value={singleTags.track}
                  placeholder="Ej. 4 o 4/12"
                  class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 focus:border-cyan-500 focus:outline-none text-sm font-mono text-white transition"
                />
              </div>

              <!-- Genre -->
              <div>
                <label for="track-genre-input" class="block text-[11px] font-medium text-slate-400 mb-1">Género</label>
                <input
                  id="track-genre-input"
                  type="text"
                  bind:value={singleTags.genre}
                  placeholder="Ej. Rock, Jazz, Classical"
                  class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 focus:border-cyan-500 focus:outline-none text-sm font-medium text-white transition"
                />
              </div>

              <!-- Comment -->
              <div>
                <label for="track-comment-input" class="block text-[11px] font-medium text-slate-400 mb-1">Comentario</label>
                <input
                  id="track-comment-input"
                  type="text"
                  bind:value={singleTags.comment}
                  placeholder="Comentarios adicionales"
                  class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 focus:border-cyan-500 focus:outline-none text-sm font-medium text-white transition"
                />
              </div>
            </div>
          {:else}
            <!-- Batch Folder Editor -->
            <div class="flex items-center justify-between pb-2 border-b border-slate-800">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Layers size={13} style="color: {accentColor};" />
                Metadatos Comunes del Álbum (Lote)
              </span>
              <span class="text-xs font-mono text-slate-400">
                {folderTracks.length} pistas en lista
              </span>
            </div>

            <!-- Common Fields -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <div>
                <label for="batch-artist-input" class="block text-[11px] font-medium text-slate-400 mb-1">Artista Común</label>
                <input
                  id="batch-artist-input"
                  type="text"
                  bind:value={commonTags.artist}
                  placeholder="Aplicar artista a todas"
                  class="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-cyan-500 text-xs text-white"
                />
              </div>
              <div>
                <label for="batch-album-input" class="block text-[11px] font-medium text-slate-400 mb-1">Álbum Común</label>
                <input
                  id="batch-album-input"
                  type="text"
                  bind:value={commonTags.album}
                  placeholder="Aplicar álbum a todas"
                  class="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-cyan-500 text-xs text-white"
                />
              </div>
              <div>
                <label for="batch-year-input" class="block text-[11px] font-medium text-slate-400 mb-1">Año Común</label>
                <input
                  id="batch-year-input"
                  type="text"
                  bind:value={commonTags.year}
                  placeholder="Ej. 2024"
                  class="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-cyan-500 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label for="batch-genre-input" class="block text-[11px] font-medium text-slate-400 mb-1">Género Común</label>
                <input
                  id="batch-genre-input"
                  type="text"
                  bind:value={commonTags.genre}
                  placeholder="Ej. Hi-Fi Lossless"
                  class="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-cyan-500 text-xs text-white"
                />
              </div>
            </div>

            <!-- Folder tracks table -->
            <div class="flex-1 min-h-[220px] rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden flex flex-col">
              <div class="grid grid-cols-12 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-900 border-b border-slate-800">
                <span class="col-span-1">#</span>
                <span class="col-span-6">Título</span>
                <span class="col-span-3">Artista</span>
                <span class="col-span-2 text-right">Ext</span>
              </div>
              <div class="flex-1 overflow-y-auto divide-y divide-slate-800/40 text-xs">
                {#each folderTracks as track}
                  <div class="grid grid-cols-12 px-3 py-1.5 items-center hover:bg-slate-800/30">
                    <input
                      type="text"
                      bind:value={track.track}
                      class="col-span-1 w-7 px-1 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-center"
                    />
                    <input
                      type="text"
                      bind:value={track.title}
                      class="col-span-6 mx-1 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] truncate text-white"
                    />
                    <span class="col-span-3 text-[11px] text-slate-400 truncate pl-1">
                      {commonTags.artist || track.artist || "—"}
                    </span>
                    <span class="col-span-2 text-[10px] font-mono text-right text-slate-500 uppercase">
                      {track.ext}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <!-- ── Right Column: Cover Art Studio (Fused) (5 cols) ── -->
        <div class="lg:col-span-5 flex flex-col h-full overflow-hidden bg-slate-950 p-6 space-y-4">
          <!-- Header and active cover preview -->
          <div class="flex items-center justify-between pb-2 border-b border-slate-800 shrink-0">
            <span class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <ImageIcon size={13} style="color: {accentColor};" />
              Carátula Incrustada & Portadas
            </span>
            {#if (activeMode === "single" ? singleCoverUrl : commonTags.coverUrl)}
              <button
                type="button"
                onclick={() => applyCoverToCurrentTarget(null)}
                class="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 size={12} />
                <span>Quitar</span>
              </button>
            {/if}
          </div>

          <!-- Cover Preview Box -->
          <div class="flex items-center gap-4 shrink-0 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <div class="w-24 h-24 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0 shadow-inner relative group">
              {#if (activeMode === "single" ? singleCoverUrl : commonTags.coverUrl)}
                <img
                  src={activeMode === "single" ? singleCoverUrl : commonTags.coverUrl}
                  alt="Carátula"
                  class="w-full h-full object-cover"
                />
              {:else}
                <Disc size={36} class="text-slate-700 animate-spin-slow" />
              {/if}
            </div>
            <div class="flex flex-col justify-center text-xs space-y-1 overflow-hidden">
              <span class="font-bold text-white truncate">
                {(activeMode === "single" ? singleCoverUrl : commonTags.coverUrl) ? "Carátula Seleccionada" : "Sin Carátula"}
              </span>
              <p class="text-[11px] text-slate-400 leading-tight">
                Se incrustará en el contenedor de audio al guardar sin recodificar.
              </p>
              <div class="flex gap-2 pt-1">
                <button
                  type="button"
                  onclick={handlePickLocalImage}
                  class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-200 border border-slate-700 cursor-pointer flex items-center gap-1"
                >
                  <Upload size={11} />
                  <span>Cargar Imagen</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Cover Studio Tabs -->
          <div class="flex p-0.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-semibold shrink-0">
            <button
              type="button"
              onclick={() => (coverStudioTab = "online")}
              class="flex-1 py-1 rounded-md transition cursor-pointer text-center {coverStudioTab === 'online' ? 'bg-slate-800 text-white shadow' : 'text-slate-400'}"
              style={coverStudioTab === "online" ? `color: ${accentColor}; font-weight: 700;` : ""}
            >
              Búsqueda Online
            </button>
            <button
              type="button"
              onclick={() => (coverStudioTab = "spectrogram")}
              class="flex-1 py-1 rounded-md transition cursor-pointer text-center {coverStudioTab === 'spectrogram' ? 'bg-slate-800 text-white shadow' : 'text-slate-400'}"
              style={coverStudioTab === "spectrogram" ? `color: ${accentColor}; font-weight: 700;` : ""}
            >
              Espectrograma HD
            </button>
          </div>

          <!-- Tab 1: Online Cover Search -->
          {#if coverStudioTab === "online"}
            <div class="flex-1 flex flex-col min-h-0 space-y-3">
              <div class="flex gap-2 shrink-0">
                <div class="relative flex-1">
                  <input
                    type="text"
                    bind:value={coverSearchQuery}
                    placeholder="Artista Álbum o Canción..."
                    onkeydown={(e) => { if (e.key === 'Enter') handleSearchCovers(); }}
                    class="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 focus:border-cyan-500 text-xs text-white"
                  />
                  <Search size={13} class="absolute left-2.5 top-2 text-slate-500" />
                </div>
                <button
                  type="button"
                  onclick={handleSearchCovers}
                  disabled={isSearchingCovers}
                  class="px-3 py-1.5 rounded-lg font-medium text-xs flex items-center gap-1 transition cursor-pointer text-white disabled:opacity-50"
                  style="background: {accentColor};"
                >
                  {#if isSearchingCovers}
                    <Loader2 size={13} class="animate-spin" />
                  {:else}
                    <Search size={13} />
                  {/if}
                  <span>Buscar</span>
                </button>
              </div>

              <!-- Search Results Grid -->
              <div class="flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/40 p-2.5">
                {#if isSearchingCovers}
                  <div class="flex flex-col items-center justify-center h-40 text-slate-500 gap-2">
                    <Loader2 size={24} class="animate-spin text-cyan-400" />
                    <span class="text-xs">Buscando portadas en iTunes HD, Deezer y la Web...</span>
                  </div>
                {:else if coverSearchResults.length > 0}
                  <div class="grid grid-cols-3 gap-2.5">
                    {#each coverSearchResults as item}
                      <button
                        type="button"
                        onclick={() => applyCoverToCurrentTarget(item.coverUrl)}
                        class="group relative aspect-square rounded-lg overflow-hidden border border-slate-800 hover:border-cyan-400 transition cursor-pointer focus:outline-none"
                      >
                        <img
                          src={item.thumbnailUrl || item.coverUrl}
                          alt={item.title}
                          class="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                        />
                        <div class="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-black/90 via-black/50 to-transparent text-[9px] text-slate-200 truncate font-sans">
                          {item.source}
                        </div>
                      </button>
                    {/each}
                  </div>
                {:else}
                  <div class="flex flex-col items-center justify-center h-40 text-slate-500 text-center p-4">
                    <Globe size={28} class="mb-2 opacity-40" />
                    <span class="text-xs">Introduce el nombre de la canción o álbum y pulsa "Buscar"</span>
                  </div>
                {/if}
              </div>
            </div>
          {:else if coverStudioTab === "spectrogram"}
            <!-- Tab 2: Spectrogram Generator -->
            <div class="flex-1 flex flex-col min-h-0 space-y-4">
              <div class="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 text-xs space-y-3">
                <span class="font-bold text-white flex items-center gap-1.5">
                  <Sparkles size={13} style="color: {accentColor};" />
                  Generador de Espectrograma de Audio
                </span>
                <p class="text-[11px] text-slate-400 leading-normal">
                  Crea una obra de arte visual de 1000x1000 píxeles analizando el espectro de frecuencias real de esta canción mediante FFmpeg.
                </p>

                <div>
                  <label for="spectro-palette-select" class="block text-[11px] font-medium text-slate-400 mb-1">Paleta de Color</label>
                  <select
                    id="spectro-palette-select"
                    bind:value={selectedPalette}
                    class="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none"
                  >
                    {#each SPECTRO_PALETTES as pal}
                      <option value={pal.id}>{pal.name}</option>
                    {/each}
                  </select>
                </div>

                <button
                  type="button"
                  onclick={handleGenerateSpectrogram}
                  disabled={isGeneratingSpectro}
                  class="w-full py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer text-white disabled:opacity-50"
                  style="background: {accentColor};"
                >
                  {#if isGeneratingSpectro}
                    <Loader2 size={14} class="animate-spin" />
                    <span>Calculando transformada FFT...</span>
                  {:else}
                    <Sparkles size={14} />
                    <span>Generar Espectrograma como Carátula</span>
                  {/if}
                </button>
              </div>
            </div>
          {/if}
        </div>
      </div>

      <!-- Modal Footer (Save and Exit) -->
      <div
        class="flex items-center justify-between px-6 py-3.5 border-t shrink-0 bg-slate-900/80"
        style="border-color: {accentColor}25;"
      >
        <div class="flex items-center gap-2 text-xs text-slate-400">
          <Disc size={13} style="color: {accentColor};" />
          <span>El audio no se descomprime: la copia directa mantiene la calidad intacta (Bit-Perfect).</span>
        </div>

        <div class="flex items-center gap-3">
          <button
            type="button"
            onclick={handleClose}
            class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition cursor-pointer"
          >
            Cancelar
          </button>

          {#if activeMode === "single"}
            <button
              type="button"
              onclick={handleSaveSingleTrack}
              disabled={isSaving || !singleFilePath}
              class="px-5 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-50"
              style="background: {accentColor}; box-shadow: 0 0 16px {accentColor}40;"
            >
              {#if isSaving}
                <Loader2 size={14} class="animate-spin" />
                <span>Guardando...</span>
              {:else}
                <Save size={14} />
                <span>Guardar en Archivo de Audio</span>
              {/if}
            </button>
          {:else}
            <button
              type="button"
              onclick={handleSaveBatchFolder}
              disabled={isSaving || folderTracks.length === 0}
              class="px-5 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-50"
              style="background: {accentColor}; box-shadow: 0 0 16px {accentColor}40;"
            >
              {#if isSaving}
                <Loader2 size={14} class="animate-spin" />
                <span>Guardando Lote...</span>
              {:else}
                <Save size={14} />
                <span>Aplicar a Todas las Pistas ({folderTracks.length})</span>
              {/if}
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
