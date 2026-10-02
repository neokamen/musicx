<script lang="ts">
  import {
    ArrowLeft,
    ChevronLeft,
    ChevronRight,
    LoaderCircle,
    Plus,
    Radio,
    Search,
    Upload,
    X,
  } from "@lucide/svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import { useMusicStore } from "../../store/index.ts";
  import type { RadioStation } from "../../types/radio.ts";
  import {
    getPopularStations,
    searchStations,
    searchStationsByCountryCode,
    searchStationsByLanguage,
    searchStationsByTag,
    searchStationsByQuality,
  } from "../../services/radioApi.ts";
  import {
    addRecentStation,
    getCustomStations,
    getFavoriteStations,
    getRecentStations,
    removeCustomStation,
    saveCustomStation,
    toggleFavoriteStation,
    importRadioPlaylist,
  } from "../../services/radioStorage.ts";
  import { readTextFile } from "../../services/api.ts";
  import StationCard from "./StationCard.svelte";
  import AddCustomStationModal from "./AddCustomStationModal.svelte";

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    embedded?: boolean;
    onBackToLibrary?: () => void;
  }

  let { isOpen, onClose, embedded = false, onBackToLibrary }: Props = $props();

  const musicStore = useMusicStore;
  let activeRadioStation = $derived($musicStore.activeRadioStation);
  let isRadioPlaying = $derived($musicStore.isRadioPlaying);
  let appearance = $derived($musicStore.appearance);
  let language = $derived($musicStore.language);

  type RadioView = "discover" | "genres" | "countries" | "favorites" | "recent" | "custom";
  type QualityFilter = "all" | "lossless" | "high-bitrate";

  const GENRES = [
    { id: "rap", label: "Rap" },
    { id: "hiphop", label: "Hip-Hop" },
    { id: "blues", label: "Blues" },
    { id: "rock", label: "Rock" },
    { id: "soul", label: "Soul" },
    { id: "pop", label: "Pop" },
    { id: "jazz", label: "Jazz" },
    { id: "electronic", label: "Electronic" },
    { id: "classical", label: "Clásica" },
    { id: "metal", label: "Metal" },
    { id: "reggae", label: "Reggae" },
    { id: "rnb", label: "R&B" },
    { id: "latin", label: "Latina" },
    { id: "ambient", label: "Ambient" },
    { id: "disco", label: "Disco" },
    { id: "funk", label: "Funk" },
    { id: "indie", label: "Indie" },
    { id: "country", label: "Country" },
  ];

  interface RegionCountryOption {
    id: string;
    kind: "country" | "language";
    queryValue: string;
    nameEs: string;
    nameCa: string;
    nameEn: string;
  }

  const REGION_OPTIONS: RegionCountryOption[] = [
    { id: "catalunya", kind: "language", queryValue: "catalan", nameEs: "Catalunya", nameCa: "Catalunya", nameEn: "Catalonia" },
    { id: "spain", kind: "country", queryValue: "ES", nameEs: "España", nameCa: "Espanya", nameEn: "Spain" },
    { id: "andorra", kind: "country", queryValue: "AD", nameEs: "Andorra", nameCa: "Andorra", nameEn: "Andorra" },
    { id: "galego", kind: "language", queryValue: "galician", nameEs: "Gallego", nameCa: "Gallego", nameEn: "Galician" },
    { id: "euskera", kind: "language", queryValue: "basque", nameEs: "Euskera", nameCa: "Euskera", nameEn: "Basque" },
    { id: "france", kind: "country", queryValue: "FR", nameEs: "Francia", nameCa: "França", nameEn: "France" },
    { id: "italy", kind: "country", queryValue: "IT", nameEs: "Italia", nameCa: "Itàlia", nameEn: "Italy" },
    { id: "uk", kind: "country", queryValue: "GB", nameEs: "Reino Unido", nameCa: "Regne Unit", nameEn: "United Kingdom" },
    { id: "usa", kind: "country", queryValue: "US", nameEs: "Estados Unidos", nameCa: "Estats Units", nameEn: "United States" },
    { id: "mexico", kind: "country", queryValue: "MX", nameEs: "México", nameCa: "Mèxic", nameEn: "Mexico" },
    { id: "argentina", kind: "country", queryValue: "AR", nameEs: "Argentina", nameCa: "Argentina", nameEn: "Argentina" },
    { id: "colombia", kind: "country", queryValue: "CO", nameEs: "Colombia", nameCa: "Colòmbia", nameEn: "Colombia" },
    { id: "chile", kind: "country", queryValue: "CL", nameEs: "Chile", nameCa: "Xile", nameEn: "Chile" },
    { id: "peru", kind: "country", queryValue: "PE", nameEs: "Perú", nameCa: "Perú", nameEn: "Peru" },
    { id: "germany", kind: "country", queryValue: "DE", nameEs: "Alemania", nameCa: "Alemanya", nameEn: "Germany" },
    { id: "portugal", kind: "country", queryValue: "PT", nameEs: "Portugal", nameCa: "Portugal", nameEn: "Portugal" },
    { id: "brazil", kind: "country", queryValue: "BR", nameEs: "Brasil", nameCa: "Brasil", nameEn: "Brazil" },
    { id: "canada", kind: "country", queryValue: "CA", nameEs: "Canadá", nameCa: "Canadà", nameEn: "Canada" },
    { id: "australia", kind: "country", queryValue: "AU", nameEs: "Australia", nameCa: "Austràlia", nameEn: "Australia" },
    { id: "netherlands", kind: "country", queryValue: "NL", nameEs: "Países Bajos", nameCa: "Països Baixos", nameEn: "Netherlands" },
    { id: "japan", kind: "country", queryValue: "JP", nameEs: "Japón", nameCa: "Japó", nameEn: "Japan" },
  ];

  let view = $state<RadioView>("discover");
  let query = $state("");
  let selectedGenre = $state("rap");
  let selectedRegionId = $state("spain");

  let stations = $state<RadioStation[]>([]);
  let favorites = $state<RadioStation[]>([]);
  let recents = $state<RadioStation[]>([]);
  let customStations = $state<RadioStation[]>([]);
  let isAddOpen = $state(false);
  let isLoading = $state(false);
  let error = $state("");
  let qualityFilter = $state<QualityFilter>("all");

  let genresScrollRef = $state<HTMLDivElement | null>(null);
  let countriesScrollRef = $state<HTMLDivElement | null>(null);

  function scrollLeft(el: HTMLDivElement | null) {
    el?.scrollBy({ left: -220, behavior: "smooth" });
  }

  function scrollRight(el: HTMLDivElement | null) {
    el?.scrollBy({ left: 220, behavior: "smooth" });
  }

  let sortedRegions = $derived.by(() => {
    if (language === "ca") {
      const priorityOrder = ["catalunya", "andorra", "spain", "galego", "euskera", "france", "italy", "uk", "usa", "mexico", "argentina", "colombia", "chile", "peru"];
      return [...REGION_OPTIONS].sort((a, b) => {
        const idxA = priorityOrder.indexOf(a.id);
        const idxB = priorityOrder.indexOf(b.id);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.nameCa.localeCompare(b.nameCa, "ca");
      });
    }

    if (language === "en") {
      const priorityOrder = ["uk", "usa", "canada", "australia", "spain", "catalunya", "france", "germany", "italy", "mexico"];
      return [...REGION_OPTIONS].sort((a, b) => {
        const idxA = priorityOrder.indexOf(a.id);
        const idxB = priorityOrder.indexOf(b.id);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.nameEn.localeCompare(b.nameEn, "en");
      });
    }

    const priorityOrder = ["spain", "catalunya", "galego", "euskera", "mexico", "argentina", "colombia", "chile", "peru", "andorra", "france", "italy", "uk", "usa"];
    return [...REGION_OPTIONS].sort((a, b) => {
      const idxA = priorityOrder.indexOf(a.id);
      const idxB = priorityOrder.indexOf(b.id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.nameEs.localeCompare(b.nameEs, "es");
    });
  });

  $effect(() => {
    if (language === "ca") selectedRegionId = "catalunya";
    else if (language === "en") selectedRegionId = "uk";
    else selectedRegionId = "spain";
  });

  let selectedRegion = $derived(
    REGION_OPTIONS.find((r) => r.id === selectedRegionId) || REGION_OPTIONS[0]
  );

  let viewStations = $derived.by(() => {
    const source =
      view === "favorites"
        ? favorites
        : view === "recent"
          ? recents
          : view === "custom"
            ? customStations
            : stations;
    if (qualityFilter === "all") return source;
    return source.filter((station) => {
      const codec = (station.codec || "").toLowerCase();
      return qualityFilter === "lossless"
        ? /flac|alac|wav|pcm/.test(codec)
        : (station.bitrate || 0) >= 320;
    });
  });

  $effect(() => {
    if (isOpen) {
      favorites = getFavoriteStations();
      recents = getRecentStations();
      customStations = getCustomStations();
    }
  });

  $effect(() => {
    if (!isOpen) return;
    if (view === "favorites" || view === "recent" || view === "custom") return;

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      isLoading = true;
      error = "";
      try {
        let res: RadioStation[] = [];
        if (query.trim()) {
          res =
            qualityFilter === "all"
              ? await searchStations(query.trim())
              : await searchStationsByQuality(qualityFilter, query.trim());
        } else if (qualityFilter !== "all") {
          res = await searchStationsByQuality(qualityFilter);
        } else if (view === "genres") {
          res = await searchStationsByTag(selectedGenre);
        } else if (view === "countries") {
          if (selectedRegion.kind === "language") {
            res = await searchStationsByLanguage(selectedRegion.queryValue);
          } else {
            res = await searchStationsByCountryCode(selectedRegion.queryValue);
          }
        } else {
          res = await getPopularStations();
        }
        if (!cancelled) stations = res;
      } catch (requestError) {
        if (!cancelled) {
          error =
            requestError instanceof Error ? requestError.message : "No se pudo conectar con Radio-Browser.";
          stations = [];
        }
      } finally {
        if (!cancelled) isLoading = false;
      }
    }, query.trim() ? 250 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  });

  async function handlePlay(station: RadioStation) {
    error = "";
    try {
      await musicStore.getState().playRadioStation(station);
      addRecentStation(station);
      recents = getRecentStations();
    } catch (playError) {
      error = playError instanceof Error ? playError.message : "No se pudo iniciar la emisora.";
    }
  }

  function handleSaveCustom(station: RadioStation) {
    customStations = saveCustomStation(station);
    view = "custom";
  }

  function handleRemoveCustom(station: RadioStation) {
    customStations = removeCustomStation(station.stationuuid);
  }

  async function handleImportPlaylist() {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Listas de radio", extensions: ["pls", "m3u", "m3u8", "json"] }],
      });
      if (typeof selected !== "string") return;
      const contents = await readTextFile(selected);
      if (!contents) throw new Error("No se pudo leer el archivo seleccionado.");
      customStations = importRadioPlaylist(contents);
      view = "custom";
      query = "";
      error = "";
    } catch (importError) {
      error = importError instanceof Error ? importError.message : "No se pudo importar la lista.";
    }
  }

  let views = $derived<{ id: RadioView; label: string }[]>([
    { id: "discover", label: language === "ca" ? "Explorar" : language === "en" ? "Explore" : "Explorar" },
    { id: "genres", label: language === "ca" ? "Estils" : language === "en" ? "Genres" : "Estilos" },
    { id: "countries", label: language === "ca" ? "Països" : language === "en" ? "Countries" : "Países" },
    { id: "favorites", label: language === "ca" ? "Preferides" : language === "en" ? "Favorites" : "Favoritas" },
    { id: "recent", label: language === "ca" ? "Recents" : language === "en" ? "Recent" : "Recientes" },
    { id: "custom", label: language === "ca" ? "Personalitzades" : language === "en" ? "Custom" : "Personalizadas" },
  ]);

  function getRegionLabel(r: RegionCountryOption) {
    if (language === "ca") return r.nameCa;
    if (language === "en") return r.nameEn;
    return r.nameEs;
  }
</script>

{#if isOpen || embedded}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class={embedded ? "flex h-full min-h-0 w-full select-none" : "fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm select-none"}
    onmousedown={(event) => {
      if (!embedded && event.target === event.currentTarget) onClose();
    }}
  >
    <section
      role={embedded ? "region" : "dialog"}
      aria-modal={embedded ? undefined : true}
      aria-label="Radio online Neowave"
      class={embedded ? "flex h-full min-h-0 w-full flex-col overflow-hidden bg-audiophile-surface" : "flex h-[760px] w-[860px] max-w-[94vw] max-h-[94vh] flex-col overflow-hidden rounded-xl border border-audiophile-border bg-audiophile-surface shadow-2xl"}
    >
      <header class="flex shrink-0 items-center justify-between border-b border-audiophile-border px-4 py-3">
        <div class="flex items-center gap-2.5">
          <Radio size={20} style="color: {appearance.accentColor}" />
          <div>
            <h2 class="text-sm font-bold text-audiophile-text">
              {language === "ca" ? "Ràdio Online (Neowave)" : language === "en" ? "Online Radio (Neowave)" : "Radio Online (Neowave)"}
            </h2>
            <p class="text-[10px] text-audiophile-muted">Radio-Browser &bull; emisoras mundiales en streaming</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={() => void handleImportPlaylist()}
            class="flex items-center gap-1.5 rounded-lg border border-audiophile-border px-2.5 py-1.5 text-[11px] text-audiophile-text hover:border-audiophile-cyan transition-colors"
            title="Importar lista moOde"
          >
            <Upload size={13} /> {language === "en" ? "Import playlist" : language === "ca" ? "Importar llista" : "Importar lista"}
          </button>
          <button
            type="button"
            onclick={() => (isAddOpen = true)}
            class="flex items-center gap-1.5 rounded-lg border border-audiophile-border px-2.5 py-1.5 text-[11px] text-audiophile-text hover:border-audiophile-cyan transition-colors"
          >
            <Plus size={13} /> {language === "ca" ? "Afegir URL" : language === "en" ? "Add URL" : "Añadir URL"}
          </button>
          {#if embedded && onBackToLibrary}
            <button
              type="button"
              onclick={onBackToLibrary}
              class="rounded-lg p-1.5 text-audiophile-muted hover:bg-audiophile-surface2 hover:text-white transition-colors"
              aria-label="Volver a la biblioteca"
              title="Volver a la biblioteca"
            >
              <ArrowLeft size={16} />
            </button>
          {:else if !embedded}
            <button
              type="button"
              onclick={onClose}
              class="rounded-lg p-1.5 text-audiophile-muted hover:bg-audiophile-surface2 hover:text-white transition-colors"
              aria-label="Cerrar radio"
            >
              <X size={16} />
            </button>
          {/if}
        </div>
      </header>

      {#if activeRadioStation}
        <div class="flex shrink-0 items-center justify-between gap-3 border-b border-audiophile-border bg-audiophile-cyan/10 px-4 py-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="flex items-center gap-1 text-[9px] font-mono uppercase text-emerald-400 font-bold shrink-0">
              <span class="h-1.5 w-1.5 rounded-full {isRadioPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}"></span>
              {isRadioPlaying
                ? language === "ca" ? "En directe" : language === "en" ? "Live" : "En directo"
                : language === "ca" ? "Pausat" : language === "en" ? "Paused" : "En pausa"}
            </span>
            <span class="truncate text-xs font-semibold text-audiophile-text">{activeRadioStation.name}</span>
          </div>
          <span class="shrink-0 text-[10px] text-audiophile-muted font-mono">
            {activeRadioStation.codec} {activeRadioStation.bitrate ? `· ${activeRadioStation.bitrate} kbps` : ""}
          </span>
        </div>
      {/if}

      <!-- Views Navigation -->
      <nav class="flex shrink-0 gap-1 overflow-x-auto border-b border-audiophile-border px-3 py-2 settings-tabs-scroll" aria-label="Secciones de radio">
        {#each views as item (item.id)}
          <button
            type="button"
            onclick={() => {
              view = item.id;
              query = "";
            }}
            class="rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors {view === item.id ? 'bg-audiophile-cyan/20 font-semibold text-audiophile-cyan border border-audiophile-cyan/40' : 'text-audiophile-muted hover:bg-audiophile-surface2 hover:text-audiophile-text border border-transparent'}"
          >
            {item.label}
          </button>
        {/each}
      </nav>

      <div class="flex shrink-0 items-center gap-1 border-b border-audiophile-border px-3 py-2" role="group" aria-label="Filtro de calidad">
        {#each [
          { id: "all", label: language === "en" ? "All" : language === "ca" ? "Totes" : "Todas" },
          { id: "lossless", label: "FLAC / Lossless" },
          { id: "high-bitrate", label: "≥ 320 kbps" },
        ] as filter (filter.id)}
          <button
            type="button"
            onclick={() => (qualityFilter = filter.id as QualityFilter)}
            aria-pressed={qualityFilter === filter.id}
            class="rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors {qualityFilter === filter.id ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40' : 'border border-transparent text-audiophile-muted hover:bg-audiophile-surface2 hover:text-audiophile-text'}"
          >
            {filter.label}
          </button>
        {/each}
      </div>

      <!-- Genres subbar -->
      {#if view === "genres"}
        <div class="relative flex shrink-0 items-center border-b border-audiophile-border/70 bg-slate-950/40 px-1 py-1.5">
          <button
            type="button"
            onclick={() => scrollLeft(genresScrollRef)}
            class="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 shadow hover:bg-slate-700 hover:text-white"
            title="Desplazar a la izquierda"
          >
            <ChevronLeft size={16} />
          </button>
          <div
            bind:this={genresScrollRef}
            class="flex flex-1 items-center gap-1.5 overflow-x-auto px-2 py-0.5 settings-tabs-scroll scroll-smooth"
          >
            {#each GENRES as g (g.id)}
              <button
                type="button"
                onclick={() => {
                  selectedGenre = g.id;
                  query = "";
                }}
                class="rounded-full px-3 py-1 text-[11px] whitespace-nowrap font-medium transition-all {selectedGenre === g.id && !query.trim() ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'}"
              >
                {g.label}
              </button>
            {/each}
          </div>
          <button
            type="button"
            onclick={() => scrollRight(genresScrollRef)}
            class="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 shadow hover:bg-slate-700 hover:text-white"
            title="Desplazar a la derecha"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      {/if}

      <!-- Countries subbar -->
      {#if view === "countries"}
        <div class="relative flex shrink-0 items-center border-b border-audiophile-border/70 bg-slate-950/40 px-1 py-1.5">
          <button
            type="button"
            onclick={() => scrollLeft(countriesScrollRef)}
            class="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 shadow hover:bg-slate-700 hover:text-white"
            title="Desplazar a la izquierda"
          >
            <ChevronLeft size={16} />
          </button>
          <div
            bind:this={countriesScrollRef}
            class="flex flex-1 items-center gap-1.5 overflow-x-auto px-2 py-0.5 settings-tabs-scroll scroll-smooth"
          >
            {#each sortedRegions as r (r.id)}
              <button
                type="button"
                onclick={() => {
                  selectedRegionId = r.id;
                  query = "";
                }}
                class="rounded-full px-3 py-1 text-[11px] whitespace-nowrap font-medium transition-all {selectedRegionId === r.id && !query.trim() ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'}"
              >
                {getRegionLabel(r)}
              </button>
            {/each}
          </div>
          <button
            type="button"
            onclick={() => scrollRight(countriesScrollRef)}
            class="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 shadow hover:bg-slate-700 hover:text-white"
            title="Desplazar a la derecha"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      {/if}

      <!-- Search box -->
      {#if view === "discover" || view === "genres" || view === "countries"}
        <div class="shrink-0 px-3 pt-2.5 pb-1">
          <label class="flex items-center gap-2 rounded-lg border border-audiophile-border bg-slate-950/60 px-3 py-1.5">
            <Search size={14} class="shrink-0 text-audiophile-muted" />
            <input
              bind:value={query}
              placeholder={language === "ca"
                ? "Cercar emissora o filtre..."
                : language === "en"
                  ? "Search station, genre, or country..."
                  : "Buscar emisora por nombre, estilo o país..."}
              class="min-w-0 flex-1 bg-transparent text-xs text-audiophile-text outline-none placeholder:text-audiophile-muted"
            />
            {#if query}
              <button type="button" onclick={() => (query = "")} class="text-slate-400 hover:text-white">
                <X size={13} />
              </button>
            {/if}
          </label>
        </div>
      {/if}

      <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {#if error}
          <p role="alert" class="m-2 rounded-lg border border-rose-900/60 bg-rose-950/30 p-2 text-xs text-rose-300">
            {error}
          </p>
        {/if}
        {#if isLoading}
          <div class="flex h-36 items-center justify-center gap-2 text-xs text-audiophile-muted">
            <LoaderCircle size={18} class="animate-spin text-cyan-400" />
            <span>{language === "ca" ? "Carregant emissores…" : language === "en" ? "Loading stations…" : "Cargando emisoras…"}</span>
          </div>
        {:else if viewStations.length}
          {#each viewStations as station (station.stationuuid)}
            <StationCard
              {station}
              isFavorite={favorites.some((fav) => fav.stationuuid === station.stationuuid)}
              isActive={activeRadioStation?.stationuuid === station.stationuuid}
              isPlaying={isRadioPlaying}
              onPlay={(item) => void handlePlay(item)}
              onToggleFavorite={(item) => (favorites = toggleFavoriteStation(item))}
              onRemoveCustom={station.isCustom ? handleRemoveCustom : undefined}
            />
          {/each}
        {:else}
          <div class="flex h-36 flex-col items-center justify-center px-4 text-center text-xs text-audiophile-muted gap-1">
            <p>
              {view === "discover"
                ? "No se encontraron emisoras."
                : view === "genres"
                  ? `No se encontraron emisoras de ${selectedGenre}.`
                  : view === "countries"
                    ? `No se encontraron emisoras para ${getRegionLabel(selectedRegion)}.`
                    : view === "favorites"
                      ? "Aún no tienes emisoras favoritas."
                      : view === "recent"
                        ? "Todavía no has escuchado ninguna emisora."
                        : "Añade una URL de streaming para crear tu lista."}
            </p>
          </div>
        {/if}
      </div>

      <footer class="flex shrink-0 items-center justify-between border-t border-audiophile-border px-4 py-2.5 text-[10px] text-audiophile-muted">
        <span>{viewStations.length} {language === "ca" ? "emissores" : language === "en" ? "stations" : "emisoras"}</span>
        <span>MusicX Hi-Fi Radio Core</span>
      </footer>
      <AddCustomStationModal isOpen={isAddOpen} onClose={() => (isAddOpen = false)} onSave={handleSaveCustom} />
    </section>
  </div>
{/if}
