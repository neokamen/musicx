<script lang="ts">
  import { onMount } from "svelte";
  import {
    Check,
    Columns2,
    Disc3,
    BookmarkPlus,
    Maximize2,
    Pencil,
    Pause,
    Play,
    Radio as RadioIcon,
    Rows2,
    SkipBack,
    SkipForward,
    SlidersHorizontal,
    Settings,
    Volume2,
    VolumeX,
    X,
  } from "@lucide/svelte";
  import { useMusicStore } from "../../store/index.ts";
  import {
    type MiniPlayerTemplate,
    type MiniPlayerFavorite,
    type FoobarWidget,
    type FoobarSplit,
    type FoobarCell,
    FOOBAR_WIDGETS,
    DEFAULT_FOOBAR_WIDGETS,
    FOOBAR_WIDGETS_KEY,
    FOOBAR_SPLIT_KEY,
    FOOBAR_LAYOUT_KEY,
    MINI_FAVORITES_KEY,
    MINI_PLAYER_TEMPLATES,
  } from "../../types/miniPlayer.ts";

  interface Props {
    template: MiniPlayerTemplate;
    onTemplateChange: (template: MiniPlayerTemplate) => void;
    onExpand: () => void;
    onOpenRadio: () => void;
    onOpenEq: () => void;
    onOpenSettings: () => void;
    isEditing: boolean;
    onToggleEditing: () => void;
  }

  let {
    template,
    onTemplateChange,
    onExpand,
    onOpenRadio,
    onOpenEq,
    onOpenSettings,
    isEditing,
    onToggleEditing,
  }: Props = $props();

  function loadFoobarWidgets(): FoobarWidget[] {
    try {
      const stored = JSON.parse(localStorage.getItem(FOOBAR_WIDGETS_KEY) || "null");
      if (Array.isArray(stored)) {
        return stored.filter((widget): widget is FoobarWidget => FOOBAR_WIDGETS.some((option) => option.id === widget));
      }
    } catch {
      // Ignore invalid stored modular layouts.
    }
    return [...DEFAULT_FOOBAR_WIDGETS];
  }

  function loadFoobarSplit(): FoobarSplit {
    const stored = localStorage.getItem(FOOBAR_SPLIT_KEY);
    return stored === "columns-2" || stored === "columns-3" || stored === "rows-2" ? stored : "columns-2";
  }

  function isFoobarCell(value: unknown): value is FoobarCell {
    if (!value || typeof value !== "object") return false;
    const cell = value as FoobarCell;
    if (typeof cell.id !== "string") return false;
    if (cell.type === "widget") return cell.widget === null || FOOBAR_WIDGETS.some((widget) => widget.id === cell.widget);
    return cell.type === "split" && (cell.direction === "horizontal" || cell.direction === "vertical") && Array.isArray(cell.children) && cell.children.length > 0 && cell.children.every(isFoobarCell);
  }

  function splitCell(direction: "horizontal" | "vertical", children: FoobarCell[]): FoobarCell {
    return { id: `foobar-split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type: "split", direction, children };
  }

  function createLegacyFoobarLayout(widgets: FoobarWidget[], split: FoobarSplit): FoobarCell {
    const cells: FoobarCell[] = widgets.map((widget, index) => ({ id: `foobar-widget-${index}-${widget}`, type: "widget", widget }));
    if (cells.length === 0) return { id: "foobar-empty-root", type: "widget", widget: null };
    if (cells.length === 1) return cells[0];

    if (split === "rows-2") {
      const midpoint = Math.ceil(cells.length / 2);
      const rows = [cells.slice(0, midpoint), cells.slice(midpoint)].filter((row) => row.length > 0);
      return splitCell("vertical", rows.map((row) => row.length === 1 ? row[0] : splitCell("horizontal", row)));
    }

    const columnCount = split === "columns-3" ? 3 : split === "columns-2" ? 2 : 1;
    const columns = Array.from({ length: Math.min(columnCount, cells.length) }, (_, index) => {
      const start = Math.floor(index * cells.length / columnCount);
      const end = Math.floor((index + 1) * cells.length / columnCount);
      const column = cells.slice(start, end);
      return column.length === 1 ? column[0] : splitCell("vertical", column);
    });
    return columns.length === 1 ? columns[0] : splitCell("horizontal", columns);
  }

  function loadFoobarLayout(): FoobarCell {
    try {
      const stored = JSON.parse(localStorage.getItem(FOOBAR_LAYOUT_KEY) || "null");
      if (isFoobarCell(stored)) return stored;
    } catch {
      // Migrate from the older flat Foobar layout below.
    }
    return createLegacyFoobarLayout(loadFoobarWidgets(), loadFoobarSplit());
  }

  function getFoobarWidgets(cell: FoobarCell): FoobarWidget[] {
    if (cell.type === "widget") return cell.widget ? [cell.widget] : [];
    return cell.children.flatMap(getFoobarWidgets);
  }

  function findEmptyFoobarCell(cell: FoobarCell): string | null {
    if (cell.type === "widget") return cell.widget === null ? cell.id : null;
    for (const child of cell.children) {
      const emptyId = findEmptyFoobarCell(child);
      if (emptyId) return emptyId;
    }
    return null;
  }

  function replaceFoobarCell(cell: FoobarCell, targetId: string, replacement: FoobarCell): FoobarCell {
    if (cell.id === targetId) return replacement;
    if (cell.type === "split") return { ...cell, children: cell.children.map((child) => replaceFoobarCell(child, targetId, replacement)) };
    return cell;
  }

  function formatTime(seconds: number): string {
    if (!seconds || Number.isNaN(seconds)) return "0:00";
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  }

  let favorites = $state<MiniPlayerFavorite[]>([]);
  let favoriteName = $state("");
  let showCover = $derived(template === "cover" || template === "vinyl" || template === "foobar");
  let showSpectrum = $derived(template === "spectrum" || template === "foobar");
  let showSeekbar = $derived(template !== "slim");
  let showVolume = $derived(template !== "slim");
  let foobarLayout = $state<FoobarCell>(loadFoobarLayout());

  onMount(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(MINI_FAVORITES_KEY) || "[]");
      if (Array.isArray(saved)) {
        favorites = saved.filter((item) => item?.id && item?.name && MINI_PLAYER_TEMPLATES.some((option) => option.id === item.template));
      }
    } catch {
      favorites = [];
    }
  });

  let foobarWidgets = $derived(getFoobarWidgets(foobarLayout));

  let isPlaying = $derived($useMusicStore.isPlaying);
  let volume = $derived($useMusicStore.volume);
  let currentTrack = $derived($useMusicStore.currentTrack);
  let currentCoverArt = $derived($useMusicStore.currentCoverArt);
  let telemetry = $derived($useMusicStore.telemetry);
  let appearance = $derived($useMusicStore.appearance);

  let currentTime = $derived(telemetry.current_time || 0);
  let duration = $derived(telemetry.duration || currentTrack?.duration_seconds || 0);
  let title = $derived(telemetry.track_title || currentTrack?.title || "Musicx Hi-Fi Player");
  let artist = $derived(telemetry.track_artist || currentTrack?.artist || "Listo para reproducir");
  let audioFormat = $derived(currentTrack?.format || telemetry.filepath?.split(".").pop()?.toUpperCase() || "PCM");
  let bitrate = $derived(telemetry.bitrate || currentTrack?.bitrate_kbps || 0);
  let accent = $derived(template === "winamp" ? "#a3e635" : appearance.accentColor || "#06b6d4");
  let spectrum = $derived(telemetry.spectrum.slice(0, 36));

  let templateSurface = $derived(
    template === "winamp"
      ? "border-lime-400/50 bg-[#11180e] shadow-[inset_0_0_18px_rgba(163,230,53,0.08)]"
      : template === "cover"
        ? "border-white/15 bg-[#111217]"
        : template === "vinyl"
          ? "border-rose-300/30 bg-[#171014]"
          : template === "slim"
            ? "border-emerald-300/35 bg-[#0b1513]"
            : "border-cyan-400/40 bg-[#080e18]"
  );

  let currentTemplate = $derived(MINI_PLAYER_TEMPLATES.find((option) => option.id === template) || MINI_PLAYER_TEMPLATES[0]);

  const changeTemplate = (nextTemplate: MiniPlayerTemplate) => {
    showCover = nextTemplate === "cover" || nextTemplate === "vinyl" || nextTemplate === "foobar";
    showSpectrum = nextTemplate === "spectrum" || nextTemplate === "foobar";
    showSeekbar = nextTemplate !== "slim";
    showVolume = nextTemplate !== "slim";
    onTemplateChange(nextTemplate);
  };

  const saveFoobarLayout = (layout: FoobarCell) => {
    foobarLayout = layout;
    localStorage.setItem(FOOBAR_LAYOUT_KEY, JSON.stringify(layout));
    const widgets = getFoobarWidgets(layout);
    localStorage.setItem(FOOBAR_WIDGETS_KEY, JSON.stringify(widgets));
  };

  const addFoobarWidget = (widget: FoobarWidget, targetId?: string) => {
    if (foobarWidgets.includes(widget)) return;
    const emptyId = targetId ?? findEmptyFoobarCell(foobarLayout);
    if (emptyId) {
      saveFoobarLayout(replaceFoobarCell(foobarLayout, emptyId, {
        id: emptyId,
        type: "widget",
        widget,
      }));
      return;
    }
    saveFoobarLayout(splitCell("horizontal", [foobarLayout, {
      id: `foobar-widget-${Date.now()}`,
      type: "widget",
      widget,
    }]));
  };

  const removeFoobarWidget = (cellId: string) => {
    saveFoobarLayout(replaceFoobarCell(foobarLayout, cellId, {
      id: cellId,
      type: "widget",
      widget: null,
    }));
  };

  const splitFoobarWidget = (cell: Extract<FoobarCell, { type: "widget" }>, direction: "horizontal" | "vertical") => {
    const firstChild: FoobarCell = { ...cell, id: `${cell.id}-first` };
    const emptyChild: FoobarCell = { id: `${cell.id}-second-${Date.now()}`, type: "widget", widget: null };
    saveFoobarLayout(replaceFoobarCell(foobarLayout, cell.id, splitCell(direction, [firstChild, emptyChild])));
  };

  const saveFavorite = () => {
    const name = favoriteName.trim();
    if (!name) return;
    const nextFavorites = [...favorites, {
      id: `mini-favorite-${Date.now()}`,
      name,
      template,
      width: currentTemplate.width,
      height: currentTemplate.height,
      showCover,
      showSpectrum,
      showSeekbar,
      showVolume,
      foobarWidgets,
      foobarLayout,
    }];
    favorites = nextFavorites;
    localStorage.setItem(MINI_FAVORITES_KEY, JSON.stringify(nextFavorites));
    favoriteName = "";
  };

  const applyFavorite = (favorite: MiniPlayerFavorite) => {
    changeTemplate(favorite.template);
    showCover = favorite.showCover ?? false;
    showSpectrum = favorite.showSpectrum ?? false;
    showSeekbar = favorite.showSeekbar ?? true;
    showVolume = favorite.showVolume ?? true;
    const restoredFoobarLayout = favorite.foobarLayout
      ?? createLegacyFoobarLayout(favorite.foobarWidgets ?? [...DEFAULT_FOOBAR_WIDGETS], favorite.foobarSplit ?? "columns-2");
    saveFoobarLayout(restoredFoobarLayout);
  };
</script>

{#snippet renderFoobarCell(cell: FoobarCell)}
  {#if cell.type === "split"}
    <div class="flex min-h-0 min-w-0 flex-1 gap-1 {cell.direction === 'horizontal' ? 'flex-row' : 'flex-col'}">
      {#each cell.children as child (child.id)}
        <div class="flex min-h-0 min-w-0 flex-1 basis-0">
          {@render renderFoobarCell(child)}
        </div>
      {/each}
    </div>
  {:else if cell.widget === null}
    <div class="flex h-full min-h-10 min-w-0 items-center justify-center border border-dashed border-white/15 bg-white/[0.02] p-1">
      {#if isEditing}
        <select
          value=""
          onchange={(event) => {
            const val = (event.target as HTMLSelectElement).value;
            if (val) addFoobarWidget(val as FoobarWidget, cell.id);
          }}
          aria-label="Añadir widget a esta casilla"
          class="max-w-full bg-black/40 px-1.5 py-1 text-[10px] text-white"
        >
          <option value="" disabled>Añadir widget...</option>
          {#each FOOBAR_WIDGETS.filter((widget) => !foobarWidgets.includes(widget.id)) as widget (widget.id)}
            <option value={widget.id} class="bg-slate-900">{widget.name}</option>
          {/each}
        </select>
      {:else}
        <span class="text-[9px] text-white/30">Casilla vacía</span>
      {/if}
    </div>
  {:else}
    {@const widget = cell.widget}
    <div class="relative flex h-full min-h-0 min-w-0 items-center justify-center overflow-hidden {isEditing ? 'border border-white/10 bg-white/[0.03] pt-6' : ''}">
      {#if isEditing}
        <div class="absolute right-1 top-1 z-10 flex items-center gap-0.5">
          <button type="button" onclick={() => splitFoobarWidget(cell as Extract<FoobarCell, { type: "widget" }>, "horizontal")} title="Dividir casilla en horizontal" aria-label="Dividir casilla en horizontal" class="flex h-5 w-5 items-center justify-center bg-black/70 text-white/65 hover:text-cyan-300"><Columns2 size={12} /></button>
          <button type="button" onclick={() => splitFoobarWidget(cell as Extract<FoobarCell, { type: "widget" }>, "vertical")} title="Dividir casilla en vertical" aria-label="Dividir casilla en vertical" class="flex h-5 w-5 items-center justify-center bg-black/70 text-white/65 hover:text-cyan-300"><Rows2 size={12} /></button>
          <button type="button" onclick={() => removeFoobarWidget(cell.id)} title="Cerrar widget" aria-label="Cerrar widget" class="flex h-5 w-5 items-center justify-center bg-black/70 text-white/65 hover:text-rose-300"><X size={12} /></button>
        </div>
      {/if}
      <div class="flex h-full min-h-0 min-w-0 w-full items-center justify-center overflow-hidden p-2">
        {#if widget === "cover"}
          {#if currentCoverArt}
            <img src={currentCoverArt} alt="Portada del álbum" class="h-full max-w-full object-contain" />
          {:else}
            <span class="text-[10px] text-white/40">Sin portada</span>
          {/if}
        {:else if widget === "track"}
          <div class="min-w-0 flex-1 text-center">
            <div class="truncate text-[12px] font-bold" title={title}>{title}</div>
            <div class="truncate text-[10px] text-white/55" title={artist}>{artist}</div>
          </div>
        {:else if widget === "spectrum"}
          <div class="flex h-full max-h-14 w-full items-end gap-[2px] overflow-hidden" aria-label="Espectro de audio">
            {#each (spectrum.length ? spectrum : Array.from({ length: 36 }, () => 0.04)) as value}
              <span class="min-w-[2px] flex-1 bg-[var(--mini-accent)]" style="height: {Math.max(8, Math.min(100, value * 100))}%;"></span>
            {/each}
          </div>
        {:else if widget === "seek"}
          <div class="flex w-full min-w-0 items-center gap-1 text-[9px] text-white/55">
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={Math.min(currentTime, duration || 100)}
              disabled={!duration}
              oninput={(event) => useMusicStore.getState().seek(Number((event.target as HTMLInputElement).value))}
              aria-label="Posición de reproducción"
              class="h-1 min-w-0 flex-1 accent-[var(--mini-accent)]"
            />
            <span>{formatTime(duration)}</span>
          </div>
        {:else if widget === "transport"}
          <div class="flex items-center gap-3">
            <button type="button" onclick={() => void useMusicStore.getState().previousTrack()} title="Anterior" aria-label="Pista anterior" class="text-white/65 hover:text-[var(--mini-accent)]"><SkipBack size={14} /></button>
            <button type="button" onclick={() => void useMusicStore.getState().togglePlayPause()} title={isPlaying ? "Pausar" : "Reproducir"} aria-label={isPlaying ? "Pausar" : "Reproducir"} class="flex h-7 w-7 items-center justify-center border border-[var(--mini-accent)] text-[var(--mini-accent)]">
              {#if isPlaying}<Pause size={13} />{:else}<Play size={13} />{/if}
            </button>
            <button type="button" onclick={() => void useMusicStore.getState().nextTrack()} title="Siguiente" aria-label="Pista siguiente" class="text-white/65 hover:text-[var(--mini-accent)]"><SkipForward size={14} /></button>
          </div>
        {:else if widget === "volume"}
          <div class="flex w-full items-center justify-center gap-2">
            <button type="button" onclick={() => void useMusicStore.getState().setVolume(volume > 0 ? 0 : 1)} title={volume > 0 ? "Silenciar" : "Activar sonido"} aria-label={volume > 0 ? "Silenciar" : "Activar sonido"} class="text-white/60 hover:text-[var(--mini-accent)]">
              {#if volume > 0}<Volume2 size={14} />{:else}<VolumeX size={14} />{/if}
            </button>
            <input type="range" min={0} max={1} step={0.01} value={Math.min(volume, 1)} oninput={(event) => void useMusicStore.getState().setVolume(Number((event.target as HTMLInputElement).value))} aria-label="Volumen" class="w-20 accent-[var(--mini-accent)]" />
          </div>
        {:else if widget === "format"}
          <span class="text-[11px] font-bold text-[var(--mini-accent)]">{audioFormat}</span>
        {:else if widget === "bitrate"}
          <span class="text-[10px] text-white/65">{bitrate ? `${bitrate} kbps` : "Bitrate desconocido"}</span>
        {/if}
      </div>
    </div>
  {/if}
{/snippet}

<section
  class="mini-player mini-player-{template} flex h-full min-h-0 flex-col overflow-hidden border font-mono text-white {templateSurface}"
  style="--mini-accent: {accent};"
>
  <div class="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-2">
    <span class="shrink-0 text-[12px] font-bold text-white" aria-label="Musicx">
      Music<span class="text-[var(--mini-accent)]">x</span>
    </span>
    <div class="flex shrink-0 items-center justify-end gap-0.5">
      <button
        type="button"
        onclick={onOpenRadio}
        title="Abrir radio"
        aria-label="Abrir radio"
        class="flex h-7 w-7 items-center justify-center border border-transparent transition hover:border-white/15 hover:text-[var(--mini-accent)] text-white/70"
      >
        <RadioIcon size={14} />
      </button>
      <button
        type="button"
        onclick={onOpenEq}
        title="Abrir ecualizador"
        aria-label="Abrir ecualizador"
        class="flex h-7 w-7 items-center justify-center border border-transparent transition hover:border-white/15 hover:text-[var(--mini-accent)] text-white/70"
      >
        <SlidersHorizontal size={14} />
      </button>
      <button
        type="button"
        onclick={onToggleEditing}
        title={isEditing ? "Cerrar editor de interfaz" : "Editar interfaz compacta"}
        aria-label={isEditing ? "Cerrar editor de interfaz" : "Editar interfaz compacta"}
        aria-pressed={isEditing}
        class="flex h-7 w-7 items-center justify-center border border-transparent transition hover:border-white/15 hover:text-[var(--mini-accent)] {isEditing ? 'text-[var(--mini-accent)]' : 'text-white/70'}"
      >
        {#if isEditing}<Check size={14} />{:else}<Pencil size={14} />{/if}
      </button>
      <button
        type="button"
        onclick={onOpenSettings}
        title="Abrir ajustes"
        aria-label="Abrir ajustes"
        class="flex h-7 w-7 items-center justify-center border border-transparent transition hover:border-white/15 hover:text-[var(--mini-accent)] text-white/70"
      >
        <Settings size={14} />
      </button>
      <button
        type="button"
        onclick={onExpand}
        title="Volver a ventana completa"
        aria-label="Volver a ventana completa"
        class="flex h-7 w-7 items-center justify-center border border-transparent transition hover:border-white/15 hover:text-[var(--mini-accent)] text-white/70"
      >
        <Maximize2 size={14} />
      </button>
    </div>
  </div>

  {#if isEditing}
    <div class="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-white/10 bg-black/20 px-2 py-1.5">
      <span class="text-[9px] uppercase text-white/50">Diseño</span>
      <select
        value={template}
        onchange={(event) => changeTemplate((event.target as HTMLSelectElement).value as MiniPlayerTemplate)}
        class="max-w-32 bg-black/30 px-1.5 py-1 text-[10px] text-white"
        aria-label="Diseño del reproductor compacto"
      >
        {#each MINI_PLAYER_TEMPLATES as option (option.id)}
          <option value={option.id} class="bg-slate-900">{option.name}</option>
        {/each}
      </select>
      {#if template === "foobar"}
        <select
          value=""
          onchange={(event) => {
            const val = (event.target as HTMLSelectElement).value;
            if (val) addFoobarWidget(val as FoobarWidget);
            (event.target as HTMLSelectElement).value = "";
          }}
          aria-label="Añadir widget Foobar"
          class="max-w-40 bg-black/30 px-1.5 py-1 text-[10px] text-white"
        >
          <option value="" disabled>Añadir widget...</option>
          {#each FOOBAR_WIDGETS.filter((widget) => !foobarWidgets.includes(widget.id)) as widget (widget.id)}
            <option value={widget.id} class="bg-slate-900">{widget.name}</option>
          {/each}
        </select>
      {:else}
        <label class="flex cursor-pointer items-center gap-1 text-[9px] text-white/65">
          <input type="checkbox" checked={showCover} onchange={(e) => { showCover = (e.target as HTMLInputElement).checked; }} class="accent-[var(--mini-accent)]" />
          Portada
        </label>
        <label class="flex cursor-pointer items-center gap-1 text-[9px] text-white/65">
          <input type="checkbox" checked={showSpectrum} onchange={(e) => { showSpectrum = (e.target as HTMLInputElement).checked; }} class="accent-[var(--mini-accent)]" />
          Espectro
        </label>
        <label class="flex cursor-pointer items-center gap-1 text-[9px] text-white/65">
          <input type="checkbox" checked={showSeekbar} onchange={(e) => { showSeekbar = (e.target as HTMLInputElement).checked; }} class="accent-[var(--mini-accent)]" />
          Seek
        </label>
        <label class="flex cursor-pointer items-center gap-1 text-[9px] text-white/65">
          <input type="checkbox" checked={showVolume} onchange={(e) => { showVolume = (e.target as HTMLInputElement).checked; }} class="accent-[var(--mini-accent)]" />
          Volumen
        </label>
      {/if}
      <input
        bind:value={favoriteName}
        placeholder="Nombre de favorita"
        class="min-w-0 flex-1 bg-black/30 px-2 py-1 text-[10px] text-white placeholder:text-white/35"
        aria-label="Nombre de la plantilla favorita"
      />
      <button
        type="button"
        onclick={saveFavorite}
        disabled={!favoriteName.trim()}
        title="Guardar plantilla favorita"
        class="flex h-6 w-7 items-center justify-center border border-white/10 text-white/75 hover:text-[var(--mini-accent)] disabled:opacity-35"
      >
        <BookmarkPlus size={13} />
      </button>
      {#if favorites.length > 0}
        <select
          value=""
          onchange={(event) => {
            const favorite = favorites.find((item) => item.id === (event.target as HTMLSelectElement).value);
            if (favorite) applyFavorite(favorite);
            (event.target as HTMLSelectElement).value = "";
          }}
          aria-label="Aplicar plantilla favorita"
          class="max-w-32 bg-black/30 px-1 py-1 text-[10px] text-white"
        >
          <option value="" disabled>Favoritas ({favorites.length})</option>
          {#each favorites as favorite (favorite.id)}
            <option value={favorite.id} class="bg-slate-900">{favorite.name}</option>
          {/each}
        </select>
      {/if}
    </div>
  {/if}

  {#if template === "foobar"}
    <div class="flex min-h-0 flex-1 overflow-hidden p-1">
      {@render renderFoobarCell(foobarLayout)}
    </div>
  {:else}
    <div class="flex min-h-0 flex-1 items-center gap-3 overflow-hidden px-3 py-2 {showCover ? 'gap-4' : ''} {template === 'slim' ? 'py-1' : ''}">
      {#if showCover}
        <div class="{template === 'vinyl' ? 'h-[108px] w-[108px] rounded-full' : 'h-[92px] w-[92px]'} relative shrink-0 overflow-hidden border border-white/10 bg-black/40">
          {#if currentCoverArt}
            <img src={currentCoverArt} alt="Portada del álbum" class="h-full w-full object-cover" />
          {:else}
            <div class="flex h-full items-center justify-center text-[10px] text-white/40">
              {#if template === 'vinyl'}<Disc3 size={32} />{:else}MUSICX{/if}
            </div>
          {/if}
          {#if template === "vinyl"}
            <span class="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40 bg-black/70"></span>
          {/if}
        </div>
      {/if}

      <div class="min-w-0 flex-1">
        {#if showSpectrum}
          <div class="mb-2 flex h-8 items-end gap-[2px] overflow-hidden" aria-hidden="true">
            {#each (spectrum.length ? spectrum : Array.from({ length: 36 }, () => 0.04)) as value}
              <span
                class="min-w-[2px] flex-1 bg-[var(--mini-accent)] opacity-90"
                style="height: {Math.max(8, Math.min(100, value * 100))}%;"
              ></span>
            {/each}
          </div>
        {/if}
        <div class="truncate text-[13px] font-bold" title={title}>{title}</div>
        <div class="mt-0.5 truncate text-[11px] text-white/55" title={artist}>{artist}</div>
        {#if showSeekbar}
          <div class="mt-3 flex items-center gap-2 text-[9px] text-white/50">
            <span class="w-8 text-right">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={Math.min(currentTime, duration || 100)}
              disabled={!duration}
              oninput={(event) => useMusicStore.getState().seek(Number((event.target as HTMLInputElement).value))}
              aria-label="Posición de reproducción"
              class="h-1 min-w-0 flex-1 cursor-pointer accent-[var(--mini-accent)] disabled:cursor-default"
            />
            <span class="w-8">{formatTime(duration)}</span>
          </div>
        {/if}
      </div>

      {#if template === "slim"}
        <div class="flex shrink-0 items-center gap-2">
          <button type="button" onclick={() => void useMusicStore.getState().previousTrack()} title="Anterior" aria-label="Pista anterior" class="text-white/65 hover:text-[var(--mini-accent)]"><SkipBack size={14} /></button>
          <button type="button" onclick={() => void useMusicStore.getState().togglePlayPause()} title={isPlaying ? "Pausar" : "Reproducir"} aria-label={isPlaying ? "Pausar" : "Reproducir"} class="flex h-7 w-7 items-center justify-center border border-[var(--mini-accent)] text-[var(--mini-accent)]">
            {#if isPlaying}<Pause size={13} />{:else}<Play size={13} />{/if}
          </button>
          <button type="button" onclick={() => void useMusicStore.getState().nextTrack()} title="Siguiente" aria-label="Siguiente" class="text-white/65 hover:text-[var(--mini-accent)]"><SkipForward size={14} /></button>
          {#if showVolume}
            <button type="button" onclick={() => void useMusicStore.getState().setVolume(volume > 0 ? 0 : 1)} title="Silenciar/activar sonido" aria-label="Silenciar o activar sonido" class="ml-1 text-white/60 hover:text-[var(--mini-accent)]">
              {#if volume > 0}<Volume2 size={14} />{:else}<VolumeX size={14} />{/if}
            </button>
          {/if}
        </div>
      {/if}
    </div>

    {#if template !== "slim"}
      <div class="flex h-11 shrink-0 items-center justify-center gap-4 border-t border-white/10 px-3">
        <button type="button" onclick={() => void useMusicStore.getState().previousTrack()} title="Anterior" aria-label="Pista anterior" class="text-white/65 hover:text-[var(--mini-accent)]">
          <SkipBack size={16} />
        </button>
        <button
          type="button"
          onclick={() => void useMusicStore.getState().togglePlayPause()}
          title={isPlaying ? "Pausar" : "Reproducir"}
          aria-label={isPlaying ? "Pausar" : "Reproducir"}
          class="flex h-8 w-8 items-center justify-center border border-[var(--mini-accent)] text-[var(--mini-accent)] transition hover:bg-[var(--mini-accent)] hover:text-black"
        >
          {#if isPlaying}<Pause size={15} fill="currentColor" />{:else}<Play size={15} fill="currentColor" />{/if}
        </button>
        <button type="button" onclick={() => void useMusicStore.getState().nextTrack()} title="Siguiente" aria-label="Pista siguiente" class="text-white/65 hover:text-[var(--mini-accent)]">
          <SkipForward size={16} />
        </button>
        {#if showVolume}
          <div class="ml-2 flex items-center gap-2">
            <button
              type="button"
              onclick={() => void useMusicStore.getState().setVolume(volume > 0 ? 0 : 1)}
              title={volume > 0 ? "Silenciar" : "Activar sonido"}
              aria-label={volume > 0 ? "Silenciar" : "Activar sonido"}
              class="text-white/60 hover:text-[var(--mini-accent)]"
            >
              {#if volume > 0}<Volume2 size={14} />{:else}<VolumeX size={14} />{/if}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={Math.min(volume, 1)}
              oninput={(event) => void useMusicStore.getState().setVolume(Number((event.target as HTMLInputElement).value))}
              aria-label="Volumen"
              class="w-14 cursor-pointer accent-[var(--mini-accent)]"
            />
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</section>
