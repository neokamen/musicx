<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import {
    Globe,
    Search,
    Download,
    Play,
    Pause,
    Loader2,
    Music,
    ArrowLeft,
    CheckSquare,
    AlertCircle,
    CheckCircle,
    X,
    Check,
    ListPlus,
    ListMusic,
  } from "@lucide/svelte";
  import { useMusicStore } from "../../store/index.ts";
  import { isStreamTrack, streamFilepath, streamTrackFromNeo } from "../../lib/streamTracks.ts";
  import SoundixDownloadDialog from "./SoundixDownloadDialog.svelte";
  import type { NeoTrack, AnalyzeResult, TrackProgress } from "../../types/stream.ts";
  import { DEFAULT_STREAM_TRACKS } from "../../types/stream.ts";

  interface Props {
    isOpen?: boolean;
    onClose?: () => void;
    embedded?: boolean;
    onBackToLibrary?: () => void;
  }

  let {
    isOpen = false,
    onClose = () => {},
    embedded = false,
    onBackToLibrary,
  }: Props = $props();

  const musicStore = useMusicStore;
  let accent = $derived($musicStore.appearance.accentColor || "#06b6d4");
  let isStreamMusicOpen = $derived($musicStore.isStreamMusicOpen);
  let isVisible = $derived(embedded || isOpen || isStreamMusicOpen);

  type SearchFilterCategory = "all" | "songs" | "artists" | "albums";

  let query = $state("");
  let searchFilter = $state<SearchFilterCategory>("all");
  let result = $state<AnalyzeResult | null>({
    kind: "search",
    name: "Catálogo Recomendado en Streaming",
    totalTracks: DEFAULT_STREAM_TRACKS.length,
    tracks: DEFAULT_STREAM_TRACKS,
  });
  let isSearching = $state(false);
  let searchError = $state<string | null>(null);
  let localFilter = $state("");
  let selectedIds = $state<Set<string>>(new Set());
  let showOptions = $state(false);
  let downloadDialogTracks = $state<NeoTrack[] | null>(null);
  let downloadSuccessMsg = $state<string | null>(null);
  let progress = $state<Record<string, TrackProgress>>({});
  let pendingPlayId = $state<string | null>(null);
  let queueHint = $state<string | null>(null);

  let hasAutoLoaded = false;

  onMount(() => {
    let unlisten: (() => void) | null = null;
    listen<TrackProgress>("download-track-progress", (event) => {
      const p = event.payload;
      progress = { ...progress, [p.trackId]: p };
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  });

  async function executeSearch(
    searchTerm: string,
    category: SearchFilterCategory = "all",
    isBackgroundInitial = false
  ) {
    const q = (searchTerm.trim() || "Top Hits").trim();

    isSearching = true;
    searchError = null;
    if (!isBackgroundInitial) {
      selectedIds = new Set();
    }
    progress = {};
    downloadSuccessMsg = null;

    let finalQuery = q;
    const isDirectUrl = q.startsWith("http://") || q.startsWith("https://");
    if (!isDirectUrl) {
      if (category === "artists") {
        finalQuery = `${q} artist`;
      } else if (category === "albums") {
        finalQuery = `${q} album`;
      } else if (category === "songs") {
        finalQuery = `${q} song`;
      }
    }

    try {
      const res = await invoke<AnalyzeResult>("analyze_source_link", {
        urlOrQuery: finalQuery,
        limit: 25,
      });
      if (res && res.tracks && res.tracks.length > 0) {
        result = res;
        selectedIds = new Set();
      }
    } catch (err: unknown) {
      console.warn("Stream search error:", err);
      if (!isBackgroundInitial) {
        searchError = String(err);
      }
    } finally {
      isSearching = false;
    }
  }

  $effect(() => {
    if (!isVisible || hasAutoLoaded) return;
    hasAutoLoaded = true;
    void executeSearch("Top Hits 2026", "songs", true);
  });

  let rawTracks = $derived(result?.tracks ?? []);
  let filteredTracks = $derived.by(() => {
    if (!localFilter.trim()) return rawTracks;
    const lower = localFilter.toLowerCase().trim();
    return rawTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(lower) ||
        t.artist.toLowerCase().includes(lower) ||
        t.album.toLowerCase().includes(lower)
    );
  });

  function handleModalClose() {
    onClose();
    if (!embedded) musicStore.getState().setStreamMusicOpen(false);
  }

  function handleSearchSubmit(e?: Event) {
    if (e) e.preventDefault();
    const term = query.trim() || "Top Hits";
    if (!query.trim()) query = "Top Hits";
    void executeSearch(term, searchFilter, false);
  }

  function handleFilterCategoryChange(cat: SearchFilterCategory) {
    searchFilter = cat;
    const term = query.trim() || "Top Hits";
    void executeSearch(term, cat, false);
  }

  function handleQuickArtistSearch(artistName: string) {
    query = artistName;
    searchFilter = "artists";
    void executeSearch(artistName, "artists");
  }

  function handleQuickAlbumSearch(albumName: string) {
    query = albumName;
    searchFilter = "albums";
    void executeSearch(albumName, "albums");
  }

  async function handlePlayNow(track: NeoTrack) {
    const store = musicStore.getState();
    const mxTrack = streamTrackFromNeo(track);
    if (store.currentTrack?.filepath === mxTrack.filepath) {
      await store.togglePlayPause();
      return;
    }
    pendingPlayId = track.id;
    searchError = null;
    try {
      await store.play(mxTrack);
    } catch (err: unknown) {
      searchError = `Error al iniciar stream: ${String(err)}`;
    } finally {
      pendingPlayId = null;
    }
  }

  function handleAddToQueue(track: NeoTrack) {
    musicStore.getState().addToQueue(streamTrackFromNeo(track));
    queueHint = `Añadida a la cola: ${track.title}`;
    window.setTimeout(() => (queueHint = null), 2200);
  }

  function handleAddSelectedToQueue() {
    const selected = filteredTracks.filter((t) => selectedIds.has(t.id)).map(streamTrackFromNeo);
    if (selected.length === 0) return;
    musicStore.getState().addToQueue(selected);
    queueHint = `${selected.length} canciones añadidas a la cola de MusicX`;
    window.setTimeout(() => (queueHint = null), 2200);
  }

  function formatSeconds(sec: number) {
    if (!sec || isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function openDownloadDialog(trks: NeoTrack[]) {
    if (trks.length === 0) return;
    downloadDialogTracks = trks;
    showOptions = false;
  }

  function handleDownloadSingleTrack(track: NeoTrack) {
    openDownloadDialog([track]);
  }

  function handleDownloadSelected() {
    const toDownload = filteredTracks.filter((t) => selectedIds.has(t.id));
    openDownloadDialog(toDownload);
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  function toggleAll() {
    if (selectedIds.size === filteredTracks.length) {
      selectedIds = new Set();
    } else {
      selectedIds = new Set(filteredTracks.map((t) => t.id));
    }
  }

  function phaseColor(phase: TrackProgress["phase"]) {
    switch (phase) {
      case "done":
        return "#22c55e";
      case "error":
        return "#ef4444";
      case "converting":
      case "tagging":
        return "#f59e0b";
      case "downloading":
        return accent;
      default:
        return "#64748b";
    }
  }

  let heroTrack = $derived(filteredTracks[0] || rawTracks[0]);
  let shelfTracks = $derived(filteredTracks.slice(0, 8));
  let listTracks = $derived(filteredTracks.slice(0, 40));
  let selectedCount = $derived(selectedIds.size);
  let currentTrack = $derived($musicStore.currentTrack);
  let isPlaying = $derived($musicStore.isPlaying);
  let streamStatusLabel = $derived(
    currentTrack && isStreamTrack(currentTrack)
      ? `${isPlaying ? "Sonando" : "Pausado"}: ${currentTrack.title}`
      : "Listo para mezclar streaming con tu biblioteca local"
  );
</script>

{#if isVisible}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class={embedded ? "h-full min-h-0 w-full bg-transparent" : "fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-xl animate-fade-in"}
    onclick={embedded ? undefined : handleModalClose}
  >
    <div
      class={embedded ? "relative flex h-full w-full overflow-hidden rounded-none border-0 shadow-none" : "relative flex h-[88vh] w-[94vw] max-w-6xl overflow-hidden rounded-[28px] border shadow-2xl"}
      style:background="radial-gradient(circle at 18% 0%, {accent}24 0, transparent 34%), linear-gradient(145deg, var(--app-bg, rgba(8,13,24,0.98)), var(--app-surface, rgba(2,6,14,0.98)))"
      style:border-color="{accent}35"
      style:box-shadow="0 24px 70px rgba(0,0,0,0.78), 0 0 45px {accent}18"
      onclick={(e) => e.stopPropagation()}
    >
      <aside class="hidden w-56 shrink-0 flex-col border-r border-white/10 bg-black/20 p-4 lg:flex">
        <div class="mb-6 flex items-center gap-3">
          <div class="flex size-10 items-center justify-center rounded-2xl" style:background-color="{accent}24" style:color={accent}>
            <Globe size={20} />
          </div>
          <div>
            <div class="text-sm font-black tracking-tight text-white">Stream Music</div>
            <div class="text-[10px] uppercase tracking-[0.22em] text-slate-500">MusicX Online</div>
          </div>
        </div>
        <div class="space-y-1.5 text-sm">
          {#each [{ id: "all", label: "Descubrir" }, { id: "songs", label: "Canciones" }, { id: "artists", label: "Artistas" }, { id: "albums", label: "Álbumes" }] as cat}
            <button
              type="button"
              onclick={() => handleFilterCategoryChange(cat.id as SearchFilterCategory)}
              class="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left transition hover:bg-white/8"
              style:background-color={searchFilter === cat.id ? `${accent}20` : "transparent"}
              style:color={searchFilter === cat.id ? "#fff" : "#94a3b8"}
            >
              <span>{cat.label}</span>
              {#if searchFilter === cat.id}
                <span class="size-1.5 rounded-full" style:background-color={accent}></span>
              {/if}
            </button>
          {/each}
        </div>
        <div class="mt-auto rounded-3xl border border-white/10 bg-white/[0.035] p-3 text-xs text-slate-400">
          <div class="mb-1 font-semibold text-white">Integrado con MusicX</div>
          <p>Play, cola mixta, EQ Pro, volumen e In Play usan el reproductor principal.</p>
        </div>
      </aside>

      <section class="flex min-w-0 flex-1 flex-col">
        <header class="flex shrink-0 items-center gap-3 border-b border-white/10 px-5 py-4">
          <form onsubmit={handleSearchSubmit} class="relative min-w-0 flex-1">
            <Search size={16} class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              bind:value={query}
              placeholder="Buscar música, artistas, álbumes o pegar enlace..."
              class="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.055] pl-11 pr-12 text-sm text-white outline-none placeholder:text-slate-500 focus:border-white/25"
            />
            {#if query}
              <button
                type="button"
                onclick={() => (query = "")}
                class="absolute right-12 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X size={14} />
              </button>
            {/if}
            <button
              type="submit"
              disabled={isSearching || !query.trim()}
              class="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-xl text-white transition disabled:opacity-40"
              style:background-color={accent}
              title="Buscar"
            >
              {#if isSearching}
                <Loader2 size={15} class="animate-spin" />
              {:else}
                <Search size={15} />
              {/if}
            </button>
          </form>
          <button
            type="button"
            onclick={() => (showOptions = !showOptions)}
            class="hidden items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 sm:flex"
            title="Guardar música offline"
          >
            <Download size={14} color={accent} /> Guardar offline
          </button>
          {#if embedded && onBackToLibrary}
            <button
              type="button"
              onclick={onBackToLibrary}
              class="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Volver a la biblioteca"
              title="Volver a la biblioteca"
            >
              <ArrowLeft size={16} />
            </button>
          {:else}
            <button
              type="button"
              onclick={handleModalClose}
              class="rounded-2xl p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
              title="Cerrar Stream Music"
            >
              <X size={18} />
            </button>
          {/if}
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {#if searchError || downloadSuccessMsg || queueHint}
            <div class="mb-4 space-y-2">
              {#if searchError}
                <div class="flex items-center gap-2 rounded-2xl border border-rose-500/40 bg-rose-950/50 p-3 text-xs text-rose-200">
                  <AlertCircle size={15} />
                  <span class="flex-1">{searchError}</span>
                  <button type="button" onclick={() => (searchError = null)}><X size={13} /></button>
                </div>
              {/if}
              {#if downloadSuccessMsg}
                <div class="flex items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs text-emerald-200">
                  <CheckCircle size={15} />
                  <span class="flex-1">{downloadSuccessMsg}</span>
                  <button type="button" onclick={() => (downloadSuccessMsg = null)}><X size={13} /></button>
                </div>
              {/if}
              {#if queueHint}
                <div class="flex items-center gap-2 rounded-2xl border bg-white/[0.045] p-3 text-xs text-slate-200" style:border-color="{accent}40">
                  <ListMusic size={15} color={accent} />
                  <span>{queueHint}</span>
                </div>
              {/if}
            </div>
          {/if}

          <section class="mb-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div class="relative min-h-[238px] overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.045] p-5">
              {#if heroTrack?.coverUrl}
                <img src={heroTrack.coverUrl} alt="" class="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl" />
              {/if}
              <div class="relative z-10 flex h-full flex-col justify-between gap-5">
                <div>
                  <div class="mb-2 text-[11px] font-bold uppercase tracking-[0.24em]" style:color={accent}>Sonora style streaming</div>
                  <h2 class="max-w-xl text-3xl font-black leading-tight text-white">{heroTrack ? heroTrack.title : "Tu nueva puerta de entrada a música online"}</h2>
                  <p class="mt-2 max-w-xl text-sm text-slate-300">{heroTrack ? `${heroTrack.artist} · ${heroTrack.album || "Stream Music"}` : "Busca, escucha y añade a cola sin salir del reproductor principal de MusicX."}</p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  {#if heroTrack}
                    <button
                      type="button"
                      onclick={() => void handlePlayNow(heroTrack)}
                      class="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-black text-black shadow-lg transition hover:scale-[1.02]"
                      style:background-color={accent}
                    >
                      {#if pendingPlayId === heroTrack.id}
                        <Loader2 size={16} class="animate-spin" />
                      {:else}
                        <Play size={16} fill="currentColor" />
                      {/if}
                      Reproducir
                    </button>
                    <button
                      type="button"
                      onclick={() => handleAddToQueue(heroTrack)}
                      class="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
                    >
                      <ListPlus size={16} /> Añadir a cola
                    </button>
                  {/if}
                  <span class="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">{streamStatusLabel}</span>
                </div>
              </div>
            </div>
            <div class="rounded-[30px] border border-white/10 bg-white/[0.035] p-4">
              <div class="mb-3 flex items-center justify-between">
                <div>
                  <div class="text-sm font-bold text-white">Explorar rápido</div>
                  <div class="text-xs text-slate-500">Géneros y estados de ánimo</div>
                </div>
                {#if isSearching}
                  <Loader2 size={16} class="animate-spin" color={accent} />
                {/if}
              </div>
              <div class="grid grid-cols-2 gap-2">
                {#each [{ label: "Top Hits", q: "Top Hits 2026" }, { label: "Rock clásico", q: "Classic Rock Hits" }, { label: "Lo-Fi", q: "Lofi hip hop beats" }, { label: "Electrónica", q: "Electronic dance music" }, { label: "Jazz & Soul", q: "Smooth Jazz Relax" }, { label: "Pop", q: "Pop Music Hits" }] as g}
                  <button
                    type="button"
                    onclick={() => { query = g.q; void executeSearch(g.q, "songs"); }}
                    class="rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-left text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                  >
                    {g.label}
                  </button>
                {/each}
              </div>
            </div>
          </section>

          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-lg font-black text-white">{result?.name || "Stream Music"}</h3>
              <p class="text-xs text-slate-500">{filteredTracks.length} resultados · doble clic para reproducir</p>
            </div>
            <div class="flex items-center gap-2">
              {#if rawTracks.length > 0}
                <input
                  type="text"
                  bind:value={localFilter}
                  placeholder="Filtrar resultados..."
                  class="w-44 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs text-white outline-none placeholder:text-slate-500"
                />
              {/if}
              <button
                type="button"
                onclick={handleAddSelectedToQueue}
                disabled={selectedCount === 0}
                class="rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-40"
              >
                <ListPlus size={13} class="mr-1 inline" /> Cola ({selectedCount})
              </button>
            </div>
          </div>

          {#if isSearching && filteredTracks.length === 0}
            <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {#each [1, 2, 3, 4, 5, 6, 7, 8] as _}
                <div class="h-52 animate-pulse rounded-3xl border border-white/10 bg-white/[0.035]"></div>
              {/each}
            </div>
          {:else if filteredTracks.length === 0}
            <div class="flex min-h-[260px] flex-col items-center justify-center rounded-[30px] border border-white/10 bg-white/[0.03] text-center text-slate-400">
              <Music size={34} color={accent} />
              <p class="mt-3 text-sm font-bold text-white">Busca algo para empezar</p>
              <p class="mt-1 max-w-md text-xs">Stream Music está pensado para escuchar primero. La descarga está disponible, pero ya no manda en la pantalla.</p>
            </div>
          {:else}
            <div class="mb-6 flex gap-3 overflow-x-auto pb-2">
              {#each shelfTracks as track (track.id)}
                {@const mxPath = streamFilepath(track.id)}
                {@const isCurr = currentTrack?.filepath === mxPath && isStreamTrack(currentTrack)}
                {@const isCurrPlaying = isCurr && isPlaying}
                {@const isCurrLoading = pendingPlayId === track.id}
                <article class="group w-40 shrink-0">
                  <button
                    type="button"
                    onclick={() => void handlePlayNow(track)}
                    class="relative mb-2 block size-40 overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-xl"
                  >
                    {#if track.coverUrl}
                      <img src={track.coverUrl} alt={track.title} class="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                    {:else}
                      <div class="flex h-full w-full items-center justify-center"><Music size={26} /></div>
                    {/if}
                    <span class="absolute inset-0 bg-black/0 transition group-hover:bg-black/35"></span>
                    <span
                      class="absolute bottom-3 right-3 flex size-10 items-center justify-center rounded-full text-black opacity-0 shadow-lg transition group-hover:opacity-100"
                      style:background-color={accent}
                    >
                      {#if isCurrLoading}
                        <Loader2 size={17} class="animate-spin" />
                      {:else if isCurrPlaying}
                        <Pause size={17} />
                      {:else}
                        <Play size={17} fill="currentColor" />
                      {/if}
                    </span>
                  </button>
                  <div class="truncate text-sm font-bold text-white" title={track.title}>{track.title}</div>
                  <div class="truncate text-xs text-slate-500" title={track.artist}>{track.artist}</div>
                </article>
              {/each}
            </div>

            <div class="overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.025]">
              {#each listTracks as track, index (track.id)}
                {@const isSelected = selectedIds.has(track.id)}
                {@const mxPath = streamFilepath(track.id)}
                {@const isCurr = currentTrack?.filepath === mxPath && isStreamTrack(currentTrack)}
                {@const isCurrPlaying = isCurr && isPlaying}
                {@const isCurrLoading = pendingPlayId === track.id}
                {@const prog = progress[track.id]}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  ondblclick={() => void handlePlayNow(track)}
                  class="group grid grid-cols-[34px_48px_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/[0.06] px-3 py-2.5 last:border-b-0 hover:bg-white/[0.045]"
                  style:border-left={isCurr ? `3px solid ${accent}` : "3px solid transparent"}
                >
                  <button
                    type="button"
                    onclick={() => toggleSelect(track.id)}
                    class="text-xs text-slate-500 hover:text-white"
                    title="Seleccionar para guardar offline"
                  >
                    {#if isSelected}
                      <CheckSquare size={14} color={accent} />
                    {:else}
                      <span>{index + 1}</span>
                    {/if}
                  </button>
                  <button
                    type="button"
                    onclick={() => void handlePlayNow(track)}
                    class="relative size-11 overflow-hidden rounded-xl bg-slate-900"
                  >
                    {#if track.coverUrl}
                      <img src={track.coverUrl} alt={track.title} class="h-full w-full object-cover" />
                    {:else}
                      <Music size={16} />
                    {/if}
                    <span class="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition group-hover:opacity-100">
                      {#if isCurrLoading}
                        <Loader2 size={15} class="animate-spin" />
                      {:else if isCurrPlaying}
                        <Pause size={15} />
                      {:else}
                        <Play size={15} fill="currentColor" />
                      {/if}
                    </span>
                  </button>
                  <div class="min-w-0">
                    <div class="truncate text-sm font-semibold" style:color={isCurr ? accent : "#f8fafc"}>
                      {track.title}
                    </div>
                    <div class="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-slate-500">
                      <button type="button" onclick={() => handleQuickArtistSearch(track.artist)} class="truncate hover:text-white">
                        {track.artist || "Desconocido"}
                      </button>
                      <span>·</span>
                      <button type="button" onclick={() => handleQuickAlbumSearch(track.album)} class="truncate hover:text-white">
                        {track.album || "Stream"}
                      </button>
                    </div>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="hidden w-12 text-right font-mono text-xs text-slate-500 sm:block">
                      {track.durationString || formatSeconds(track.duration)}
                    </span>
                    <button
                      type="button"
                      onclick={() => handleAddToQueue(track)}
                      class="rounded-xl border border-white/10 bg-white/[0.045] p-2 text-slate-300 opacity-0 transition hover:text-white group-hover:opacity-100"
                      title="Añadir a cola"
                    >
                      <ListPlus size={14} />
                    </button>
                    <button
                      type="button"
                      onclick={() => handleDownloadSingleTrack(track)}
                      disabled={Boolean(downloadDialogTracks) && prog?.phase === "downloading"}
                      class="rounded-xl border border-white/10 bg-white/[0.035] p-2 text-slate-500 opacity-0 transition hover:text-white disabled:opacity-30 group-hover:opacity-100"
                      title="Guardar offline"
                      style:color={prog ? phaseColor(prog.phase) : undefined}
                    >
                      {#if prog && prog.phase !== "done" && prog.phase !== "error"}
                        <Loader2 size={14} class="animate-spin" />
                      {:else if prog?.phase === "done"}
                        <Check size={14} />
                      {:else}
                        <Download size={14} />
                      {/if}
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        {#if showOptions && filteredTracks.length > 0}
          <footer class="shrink-0 border-t border-white/10 bg-black/35 px-5 py-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="text-sm font-bold text-white">Guardar offline</div>
                <div class="text-xs text-slate-500">Formato, calidad, carpeta y estructura.</div>
              </div>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  onclick={toggleAll}
                  class="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
                >
                  {selectedIds.size === filteredTracks.length ? "Deseleccionar" : "Seleccionar todo"}
                </button>
                <button
                  type="button"
                  onclick={handleDownloadSelected}
                  disabled={selectedCount === 0}
                  class="rounded-xl px-4 py-1.5 text-xs font-black text-black disabled:opacity-40"
                  style:background-color={accent}
                >
                  Descargar {selectedCount}
                </button>
              </div>
            </div>
          </footer>
        {/if}

        {#if downloadDialogTracks}
          <SoundixDownloadDialog
            tracks={downloadDialogTracks}
            onClose={() => (downloadDialogTracks = null)}
            onComplete={(message) => (downloadSuccessMsg = message)}
            onError={(message) => (searchError = message)}
          />
        {/if}
      </section>
    </div>
  </div>
{/if}
