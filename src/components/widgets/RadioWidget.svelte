<script lang="ts">
  import { onMount } from "svelte";
  import {
    Radio,
    Library,
    Search,
    Star,
    Play,
    Pause,
    Square,
    X,
    ExternalLink,
    Clock,
    Loader2,
    Volume2,
    Sparkles,
    CircleDot,
    Download,
    Trash2,
    Check,
  } from "@lucide/svelte";
  import { useMusicStore } from "../../store/index.ts";
  import {
    getFavoriteStations,
    getRecentStations,
    toggleFavoriteStation,
  } from "../../services/radioStorage.ts";
  import { searchStations } from "../../services/radioApi.ts";
  import { radioAudioService } from "../../services/radioAudioService.ts";
  import { saveRadioRecording } from "../../services/api.ts";
  import type { RadioStation, RecordedRadioTrack } from "../../types/radio.ts";
  import { formatDataSize } from "../../lib/formatBytes.ts";

  interface Props {
    onBackToLibrary?: () => void;
  }

  let { onBackToLibrary = undefined }: Props = $props();

  let activeRadioStation = $derived($useMusicStore.activeRadioStation);
  let isRadioPlaying = $derived($useMusicStore.isRadioPlaying);
  let appearance = $derived($useMusicStore.appearance);
  let librarySettings = $derived($useMusicStore.librarySettings);

  let favorites = $state<RadioStation[]>(getFavoriteStations());
  let recents = $state<RadioStation[]>(getRecentStations());
  let activeTab = $state<"favorites" | "search" | "recents" | "recordings">("favorites");
  let searchQuery = $state("");
  let searchResults = $state<RadioStation[]>([]);
  let isSearching = $state(false);
  let searchInputRef = $state<HTMLInputElement | null>(null);

  // Recording state
  let isRecording = $state(false);
  let recordings = $state<RecordedRadioTrack[]>([]);
  let savingTrackId = $state<string | null>(null);
  let saveSuccessTrackId = $state<string | null>(null);
  let previewPlayingId = $state<string | null>(null);
  let previewAudio: HTMLAudioElement | null = null;

  // Live/session data usage
  let bytesPerSecond = $state(0);
  let sessionBytesTotal = $state(0);
  let isRealDataUsage = $state(false);
  let streamTitle = $state("");

  onMount(() => {
    const unsub = radioAudioService.subscribe((playbackState) => {
      bytesPerSecond = playbackState.status === "playing" ? playbackState.bytesPerSecond || 0 : 0;
      sessionBytesTotal = playbackState.sessionBytesTotal || 0;
      isRealDataUsage = Boolean(playbackState.isRealDataUsage);
      streamTitle = playbackState.streamTitle || "";
    });

    const handleFavoritesChanged = () => {
      favorites = getFavoriteStations();
    };
    const handleRecentsChanged = () => {
      recents = getRecentStations();
    };

    window.addEventListener("musicx:radio-favorites-changed", handleFavoritesChanged);
    window.addEventListener("musicx:radio-recents-changed", handleRecentsChanged);
    window.addEventListener("storage", handleFavoritesChanged);

    radioAudioService.setMaxStoredTracks(librarySettings.radioMaxStoredTracks || 20);
    const unsubRecording = radioAudioService.subscribeRecording((recStatus, recList) => {
      isRecording = recStatus;
      recordings = recList;
    });

    return () => {
      unsub();
      unsubRecording();
      window.removeEventListener("musicx:radio-favorites-changed", handleFavoritesChanged);
      window.removeEventListener("musicx:radio-recents-changed", handleRecentsChanged);
      window.removeEventListener("storage", handleFavoritesChanged);
      if (previewAudio) {
        previewAudio.pause();
        previewAudio = null;
      }
    };
  });

  $effect(() => {
    radioAudioService.setAutoRecordEnabled(Boolean(librarySettings.radioAutoRecordEnabled));
  });

  $effect(() => {
    radioAudioService.setMaxStoredTracks(librarySettings.radioMaxStoredTracks || 20);
  });

  // Debounced search
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const query = searchQuery.trim();
    if (searchTimer) clearTimeout(searchTimer);
    if (!query) {
      searchResults = [];
      isSearching = false;
      return;
    }
    activeTab = "search";
    isSearching = true;
    searchTimer = setTimeout(() => {
      searchStations(query, 25)
        .then((results) => {
          searchResults = results;
        })
        .catch((err) => {
          console.error("Error buscando emisoras en widget:", err);
          searchResults = [];
        })
        .finally(() => {
          isSearching = false;
        });
    }, 300);
  });

  let favoriteMap = $derived(new Set(favorites.map((s) => s.stationuuid)));

  const handleToggleRecord = () => {
    if (isRecording) {
      radioAudioService.stopRecording();
    } else {
      if (!activeRadioStation) return;
      radioAudioService.startRecording(activeRadioStation);
    }
  };

  const handleSaveTrack = async (track: RecordedRadioTrack) => {
    if (!librarySettings.radioRecordingFolder) {
      alert("Por favor configura una carpeta de destino para grabaciones en Ajustes > Biblioteca.");
      return;
    }
    savingTrackId = track.id;
    try {
      const arrayBuffer = await track.blob.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      const ext = track.mimeType.includes("ogg") ? "ogg" : "webm";
      const cleanStation = track.stationName.replace(/[/\\?%*:|"<>]/g, "_").trim();
      const timestamp = new Date(track.recordedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `${cleanStation}_${timestamp}.${ext}`;

      await saveRadioRecording(librarySettings.radioRecordingFolder, filename, uint8);
      saveSuccessTrackId = track.id;
      setTimeout(() => {
        saveSuccessTrackId = saveSuccessTrackId === track.id ? null : saveSuccessTrackId;
      }, 3000);
    } catch (err) {
      console.error("Error guardando grabación:", err);
      alert(`Error guardando grabación en disco: ${err}`);
    } finally {
      savingTrackId = null;
    }
  };

  const handleDeleteTrack = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    if (previewPlayingId === id && previewAudio) {
      previewAudio.pause();
      previewPlayingId = null;
    }
    radioAudioService.deleteRecordedTrack(id);
  };

  const handlePlayPreview = (track: RecordedRadioTrack) => {
    if (previewPlayingId === track.id) {
      if (previewAudio) {
        previewAudio.pause();
      }
      previewPlayingId = null;
      return;
    }

    if (previewAudio) {
      previewAudio.pause();
    }

    const audio = new Audio(track.blobUrl);
    previewAudio = audio;
    audio.play().catch(console.error);
    previewPlayingId = track.id;
    audio.onended = () => {
      previewPlayingId = null;
    };
  };

  const handleToggleFavorite = (station: RadioStation, e: MouseEvent) => {
    e.stopPropagation();
    const updated = toggleFavoriteStation(station);
    favorites = updated;
  };

  const handlePlayStation = (station: RadioStation) => {
    if (activeRadioStation?.stationuuid === station.stationuuid) {
      void useMusicStore.getState().togglePlayPause();
    } else {
      void useMusicStore.getState().playRadioStation(station);
    }
  };

  const clearSearch = () => {
    searchQuery = "";
    searchResults = [];
    activeTab = favorites.length > 0 ? "favorites" : "recents";
    searchInputRef?.focus();
  };
</script>

{#snippet stationRow(station: RadioStation)}
  {@const isCurrent = activeRadioStation?.stationuuid === station.stationuuid}
  {@const isPlaying = Boolean(isCurrent && isRadioPlaying)}
  {@const isFav = favoriteMap.has(station.stationuuid)}

  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    onclick={() => handlePlayStation(station)}
    class="group flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition-colors {isCurrent ? 'bg-audiophile-cyan/15 text-audiophile-cyan' : 'text-audiophile-text hover:bg-audiophile-surface2/70'}"
  >
    <div class="flex items-center gap-2.5 min-w-0">
      <div class="relative h-6 w-6 shrink-0 rounded bg-slate-900/60 border border-slate-800 flex items-center justify-center overflow-hidden">
        {#if station.favicon}
          <img
            src={station.favicon}
            alt=""
            class="h-full w-full object-cover"
            onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        {:else}
          <Radio size={12} class="text-audiophile-muted" />
        {/if}

        {#if isCurrent && isPlaying}
          <div class="absolute inset-0 bg-black/60 flex items-center justify-center">
            <Volume2 size={11} class="text-audiophile-cyan animate-pulse" />
          </div>
        {/if}
      </div>

      <div class="min-w-0">
        <div class="truncate text-xs font-medium leading-tight {isCurrent ? 'font-semibold' : ''}">
          {station.name}
        </div>
        <div class="truncate text-[10px] text-audiophile-muted flex items-center gap-1.5">
          {#if station.country}<span>{station.country}</span>{/if}
          {#if station.tags}
            <span class="truncate max-w-[120px] text-slate-500">
              · {station.tags.split(",").slice(0, 2).join(", ")}
            </span>
          {/if}
        </div>
      </div>
    </div>

    <div class="flex items-center gap-1 shrink-0 ml-2">
      <button
        type="button"
        onclick={(e) => handleToggleFavorite(station, e)}
        class="p-1 rounded transition-colors {isFav ? 'text-amber-400' : 'text-audiophile-muted/40 hover:text-amber-400 opacity-0 group-hover:opacity-100'}"
        title={isFav ? "Quitar de favoritos" : "Guardar en favoritos"}
      >
        <Star size={12} class={isFav ? "fill-amber-400" : ""} />
      </button>

      <button
        type="button"
        onclick={(e) => {
          e.stopPropagation();
          handlePlayStation(station);
        }}
        class="p-1 rounded text-audiophile-muted hover:text-audiophile-text opacity-0 group-hover:opacity-100 transition-opacity"
        title={isCurrent && isPlaying ? "Pausar" : "Reproducir"}
      >
        {#if isCurrent && isPlaying}
          <Pause size={12} />
        {:else}
          <Play size={12} />
        {/if}
      </button>
    </div>
  </div>
{/snippet}

<div class="flex flex-col h-full w-full bg-audiophile-surface select-none font-sans overflow-hidden text-xs relative">
  <!-- Top Header -->
  <div class="flex items-center justify-between px-3 py-2 border-b border-audiophile-border bg-slate-950/40">
    <div class="flex items-center gap-2">
      <div
        class="p-1 rounded-md"
        style="background-color: {appearance.accentColor}20;"
      >
        <Radio size={14} style="color: {appearance.accentColor};" />
      </div>
      <span class="font-semibold text-audiophile-text text-xs tracking-wider uppercase font-mono">
        Radio
      </span>
      {#if isRadioPlaying}
        <span class="flex items-center gap-1 text-[9px] font-mono uppercase text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          Live
        </span>
      {/if}
    </div>

    <div class="flex items-center gap-1">
      {#if onBackToLibrary}
        <button
          type="button"
          onclick={onBackToLibrary}
          class="grid size-7 place-items-center text-audiophile-muted hover:text-audiophile-cyan"
          title="Volver a la biblioteca"
          aria-label="Volver a la biblioteca"
        >
          <Library size={13} />
        </button>
      {/if}
      <button
        type="button"
        onclick={() => useMusicStore.getState().setRadioHubOpen(true)}
        class="flex items-center gap-1 text-[11px] text-audiophile-muted hover:text-audiophile-cyan transition-colors px-1.5 py-0.5 rounded hover:bg-audiophile-surface2"
        title="Abrir explorador completo de emisoras"
      >
        <span>Explorador</span>
        <ExternalLink size={12} />
      </button>
    </div>
  </div>

  <!-- Search Bar -->
  <div class="p-2 bg-slate-900/40">
    <div class="flex items-center bg-audiophile-base border border-slate-800/60 rounded px-2.5 py-1">
      <Search size={13} class="text-audiophile-muted mr-2 shrink-0 pointer-events-none" />
      <input
        bind:this={searchInputRef}
        type="text"
        bind:value={searchQuery}
        placeholder="Buscar emisora o género..."
        class="w-full bg-transparent font-mono text-[11px] text-audiophile-text placeholder:text-audiophile-muted/50 focus:outline-none"
      />
      {#if isSearching}
        <Loader2 size={12} class="text-audiophile-cyan animate-spin shrink-0 ml-1.5" />
      {:else if searchQuery}
        <button
          type="button"
          onclick={clearSearch}
          class="text-audiophile-muted hover:text-audiophile-text p-0.5 rounded shrink-0 ml-1.5"
        >
          <X size={12} />
        </button>
      {/if}
    </div>
  </div>

  <!-- Tabs selector -->
  <div class="flex items-center gap-1 px-2 py-1.5 bg-slate-950/20 text-[11px]">
    <button
      type="button"
      onclick={() => { activeTab = "favorites"; }}
      class="flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors font-medium {activeTab === 'favorites' ? 'bg-audiophile-surface2 text-audiophile-text shadow-sm' : 'text-audiophile-muted hover:text-audiophile-text'}"
    >
      <Star size={12} class={activeTab === 'favorites' ? 'text-amber-400 fill-amber-400' : ''} />
      <span>Favoritos</span>
      <span class="text-[10px] text-audiophile-muted px-1 rounded-full bg-slate-800/80">
        {favorites.length}
      </span>
    </button>

    {#if searchQuery.trim().length > 0}
      <button
        type="button"
        onclick={() => { activeTab = "search"; }}
        class="flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors font-medium {activeTab === 'search' ? 'bg-audiophile-surface2 text-audiophile-text shadow-sm' : 'text-audiophile-muted hover:text-audiophile-text'}"
      >
        <Search size={12} />
        <span>Resultados</span>
        <span class="text-[10px] text-audiophile-muted px-1 rounded-full bg-slate-800/80">
          {searchResults.length}
        </span>
      </button>
    {/if}

    <button
      type="button"
      onclick={() => { activeTab = "recents"; }}
      class="flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors font-medium {activeTab === 'recents' ? 'bg-audiophile-surface2 text-audiophile-text shadow-sm' : 'text-audiophile-muted hover:text-audiophile-text'}"
    >
      <Clock size={12} />
      <span>Recientes</span>
    </button>

    <button
      type="button"
      onclick={() => { activeTab = "recordings"; }}
      class="flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors font-medium relative {activeTab === 'recordings' ? 'bg-audiophile-surface2 text-audiophile-text shadow-sm' : 'text-audiophile-muted hover:text-audiophile-text'}"
      title="Grabaciones de radio en memoria"
    >
      <CircleDot size={12} class={isRecording ? 'text-rose-500 animate-pulse' : 'text-rose-400/70'} />
      <span>Grabaciones</span>
      {#if recordings.length > 0}
        <span class="text-[10px] text-rose-400 font-semibold px-1 rounded-full bg-rose-950/60 border border-rose-900/60">
          {recordings.length}
        </span>
      {/if}
    </button>
  </div>

  <!-- Main Content Area -->
  <div class="flex-1 overflow-y-auto p-1 divide-y divide-audiophile-border/30">
    {#if activeTab === "recordings"}
      <div class="p-2 space-y-2">
        <div class="flex items-center justify-between text-[11px] text-audiophile-muted px-1">
          <span>
            En memoria: <strong class="text-audiophile-text">{recordings.length}</strong> / {librarySettings.radioMaxStoredTracks || 20}
          </span>
          {#if recordings.length > 0}
            <button
              type="button"
              onclick={() => radioAudioService.clearAllRecordings()}
              class="text-[10px] text-rose-400/80 hover:text-rose-300 transition-colors"
            >
              Limpiar todas
            </button>
          {/if}
        </div>

        {#if recordings.length === 0}
          <div class="flex flex-col items-center justify-center p-6 text-center text-audiophile-muted gap-2">
            <CircleDot size={26} class="text-rose-500/40" />
            <span class="text-xs font-medium text-audiophile-text">
              Sin pistas grabadas
            </span>
            <p class="text-[11px] max-w-[220px] text-audiophile-muted leading-relaxed">
              Usa el botón de grabación en el reproductor inferior mientras escuchas una emisora para capturar canciones al vuelo (Neowave Recorder).
            </p>
          </div>
        {:else}
          <div class="space-y-1.5">
            {#each recordings as rec (rec.id)}
              {@const isPreviewing = previewPlayingId === rec.id}
              {@const isSaving = savingTrackId === rec.id}
              {@const isSaved = saveSuccessTrackId === rec.id}
              {@const sizeMb = (rec.sizeBytes / (1024 * 1024)).toFixed(2)}
              {@const minutes = Math.floor(rec.durationSeconds / 60)}
              {@const seconds = rec.durationSeconds % 60}
              {@const durStr = `${minutes}:${seconds.toString().padStart(2, "0")}`}

              <div class="flex items-center justify-between p-2 rounded bg-audiophile-surface2/60 border border-audiophile-border/40 hover:border-audiophile-cyan/40 transition-colors">
                <div class="min-w-0 flex items-center gap-2">
                  <button
                    type="button"
                    onclick={() => handlePlayPreview(rec)}
                    class="p-1.5 rounded-full bg-slate-900 text-audiophile-cyan hover:scale-105 transition-transform shrink-0"
                    title={isPreviewing ? "Pausar preescucha" : "Preescuchar"}
                  >
                    {#if isPreviewing}
                      <Pause size={12} />
                    {:else}
                      <Play size={12} class="ml-0.5" />
                    {/if}
                  </button>
                  <div class="min-w-0">
                    <div class="text-xs font-medium text-audiophile-text truncate">
                      {rec.title}
                    </div>
                    <div class="text-[10px] text-audiophile-muted flex items-center gap-1.5 font-mono">
                      <span>{durStr}</span>
                      <span>•</span>
                      <span>{sizeMb} MB</span>
                      <span>•</span>
                      <span>{rec.stationName}</span>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    type="button"
                    onclick={() => void handleSaveTrack(rec)}
                    disabled={isSaving}
                    class="p-1.5 rounded text-[11px] font-mono flex items-center gap-1 transition-colors {isSaved ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800' : 'bg-audiophile-base hover:bg-audiophile-surface text-audiophile-text border border-audiophile-border'}"
                    title="Guardar archivo en la carpeta configurada de tu ordenador"
                  >
                    {#if isSaving}
                      <Loader2 size={12} class="animate-spin text-audiophile-cyan" />
                    {:else if isSaved}
                      <Check size={12} class="text-emerald-400" />
                      <span class="text-[10px]">Guardado</span>
                    {:else}
                      <Download size={12} />
                      <span class="text-[10px]">Guardar</span>
                    {/if}
                  </button>

                  <button
                    type="button"
                    onclick={(e) => handleDeleteTrack(rec.id, e)}
                    class="p-1.5 rounded text-neutral-500 hover:text-rose-400 transition-colors"
                    title="Eliminar de la lista temporal"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {:else if activeTab === "favorites"}
      {#if favorites.length === 0}
        <div class="flex flex-col items-center justify-center p-6 text-center text-audiophile-muted h-full gap-2">
          <Star size={26} class="text-amber-400/40" />
          <span class="text-xs font-medium text-audiophile-text">
            Sin emisoras favoritas
          </span>
          <p class="text-[11px] max-w-[220px] text-audiophile-muted leading-relaxed">
            Busca emisoras con la barra superior o explora el catálogo para añadirlas aquí.
          </p>
          <button
            type="button"
            onclick={() => useMusicStore.getState().setRadioHubOpen(true)}
            class="mt-1 flex items-center gap-1.5 rounded-md border border-audiophile-border bg-audiophile-surface2 px-2.5 py-1 text-xs text-audiophile-text hover:border-audiophile-cyan transition-colors"
          >
            <Sparkles size={12} /> Explorar emisoras
          </button>
        </div>
      {:else}
        {#each favorites as station (station.stationuuid)}
          {@render stationRow(station)}
        {/each}
      {/if}
    {:else if activeTab === "search"}
      {#if isSearching}
        <div class="flex flex-col items-center justify-center p-8 text-center text-audiophile-muted gap-2">
          <Loader2 size={20} class="animate-spin text-audiophile-cyan" />
          <span class="text-xs">Buscando emisoras...</span>
        </div>
      {:else if searchResults.length === 0}
        <div class="flex flex-col items-center justify-center p-6 text-center text-audiophile-muted h-full gap-2">
          <Search size={22} class="text-slate-600" />
          <span class="text-xs font-medium text-audiophile-text">
            No se encontraron emisoras
          </span>
          <p class="text-[11px] text-audiophile-muted">
            Prueba buscando por nombre ("BBC", "Ibiza", "Rock FM") o género.
          </p>
        </div>
      {:else}
        {#each searchResults as station (station.stationuuid)}
          {@render stationRow(station)}
        {/each}
      {/if}
    {:else if activeTab === "recents"}
      {#if recents.length === 0}
        <div class="flex flex-col items-center justify-center p-6 text-center text-audiophile-muted h-full gap-2">
          <Clock size={22} class="text-slate-600" />
          <span class="text-xs font-medium text-audiophile-text">
            Sin historial reciente
          </span>
          <p class="text-[11px] text-audiophile-muted">
            Las emisoras que escuches se guardarán aquí para acceso rápido.
          </p>
        </div>
      {:else}
        {#each recents as station (station.stationuuid)}
          {@render stationRow(station)}
        {/each}
      {/if}
    {/if}
  </div>

  <!-- Docked Now Playing Mini-Player at bottom -->
  {#if activeRadioStation}
    <div class="border-t border-audiophile-border bg-slate-950/70 p-2.5 backdrop-blur-sm">
      <div class="flex items-center justify-between gap-2">
        <!-- Station info -->
        <div class="flex items-center gap-2 min-w-0">
          {#if activeRadioStation.favicon}
            <img
              src={activeRadioStation.favicon}
              alt=""
              class="h-8 w-8 rounded object-cover shrink-0 border border-slate-750"
              onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          {:else}
            <div class="h-8 w-8 rounded bg-audiophile-surface2 flex items-center justify-center shrink-0">
              <Radio size={14} style="color: {appearance.accentColor};" />
            </div>
          {/if}
          <div class="min-w-0">
            <div class="truncate text-xs font-semibold text-audiophile-text">
              {activeRadioStation.name}
            </div>
            {#if streamTitle}
              <div class="truncate text-[10px] text-audiophile-cyan" title={streamTitle}>
                {streamTitle}
              </div>
            {/if}
            <div class="truncate text-[10px] text-audiophile-muted flex items-center gap-1.5">
              {#if activeRadioStation.country}<span>{activeRadioStation.country}</span>{/if}
              {#if activeRadioStation.codec}<span>· {activeRadioStation.codec}</span>{/if}
              {#if Boolean(activeRadioStation.bitrate && activeRadioStation.bitrate > 0)}
                <span>· {activeRadioStation.bitrate} kbps</span>
              {/if}
            </div>
          </div>
        </div>

        <!-- Quick playback controls -->
        <div class="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onclick={(e) => handleToggleFavorite(activeRadioStation, e)}
            class="p-1.5 rounded text-audiophile-muted hover:text-amber-400 transition-colors"
            title={favoriteMap.has(activeRadioStation.stationuuid) ? "Quitar de favoritos" : "Añadir a favoritos"}
          >
            <Star
              size={14}
              class={favoriteMap.has(activeRadioStation.stationuuid) ? "text-amber-400 fill-amber-400" : ""}
            />
          </button>

          <button
            type="button"
            onclick={handleToggleRecord}
            class="p-1.5 rounded transition-colors flex items-center justify-center {isRecording ? 'text-rose-400 bg-rose-950/60 border border-rose-600 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.4)]' : 'text-audiophile-muted hover:text-rose-400'}"
            title={isRecording ? "Detener grabación y añadir a lista" : "Grabar emisora (Neowave Recorder)"}
          >
            <CircleDot size={14} class={isRecording ? "fill-rose-500" : ""} />
          </button>

          <button
            type="button"
            onclick={() => useMusicStore.getState().setLibrarySettings({ radioAutoRecordEnabled: !librarySettings.radioAutoRecordEnabled })}
            class="p-1.5 rounded transition-colors flex items-center justify-center {librarySettings.radioAutoRecordEnabled ? 'text-emerald-400 bg-emerald-950/50 border border-emerald-600/60' : 'text-audiophile-muted hover:text-emerald-400'}"
            title={librarySettings.radioAutoRecordEnabled ? "Guardado automático de canciones activado (requiere que la emisora envíe metadatos ICY)" : "Activar guardado automático de canciones detectadas"}
          >
            <Sparkles size={14} />
          </button>

          <button
            type="button"
            onclick={() => void useMusicStore.getState().togglePlayPause()}
            class="p-1.5 rounded-full text-slate-950 font-bold transition-transform hover:scale-105 active:scale-95"
            style="background-color: {appearance.accentColor};"
            title={isRadioPlaying ? "Pausar emisora" : "Reanudar emisora"}
          >
            {#if isRadioPlaying}
              <Pause size={14} />
            {:else}
              <Play size={14} class="ml-0.5" />
            {/if}
          </button>

          <button
            type="button"
            onclick={() => useMusicStore.getState().stopRadio()}
            class="p-1.5 rounded text-audiophile-muted hover:text-rose-400 transition-colors"
            title="Detener emisora"
          >
            <Square size={12} />
          </button>
        </div>
      </div>

      <!-- Real-time and accumulated network data usage -->
      {#if isRadioPlaying}
        <div
          class="mt-1.5 flex items-center justify-between text-[9px] font-mono text-audiophile-muted"
          title={isRealDataUsage ? "Bytes reales medidos en la red" : "Estimado a partir del bitrate reportado por la emisora"}
        >
          <span>
            {bytesPerSecond > 0 ? `${(bytesPerSecond / 1024).toFixed(0)} KB/s ${isRealDataUsage ? "en vivo" : "(estimado)"}` : "Consumo no disponible"}
          </span>
          <span>Sesión: {formatDataSize(sessionBytesTotal)}</span>
        </div>
      {/if}
    </div>
  {/if}
</div>
