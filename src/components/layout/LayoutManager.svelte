<script lang="ts">
  import { onMount } from "svelte";
  import type { LayoutNode, WidgetType } from "../../types/layout.ts";
  import { useMusicStore } from "../../store/index.ts";
  import {
    DEFAULT_LAYOUT,
    LAYOUT_PRESETS,
    hasSavedLayout,
    loadActiveLayoutFavoriteId,
    loadLayoutFavorites,
    loadLayoutFromStorage,
    loadStartupLayoutFavorite,
    saveLayoutToStorage,
    saveActiveLayoutFavoriteId,
    saveLayoutFavorites,
    saveStartupLayoutFavorite,
    resetLayoutStorage,
    type LayoutFavoriteSnapshot,
  } from "./defaultLayout.ts";
  import LayoutNodeRenderer from "./LayoutNodeRenderer.svelte";
  import { BookmarkPlus, RotateCcw, Star } from "@lucide/svelte";

  interface Props {
    isEditing: boolean;
    onRestoreWindowSize: (
      size: { width: number; height: number },
      playerBarHeightRatio: number,
      isStartupRestore?: boolean
    ) => void | Promise<void>;
  }

  let { isEditing, onRestoreWindowSize }: Props = $props();

  const initialFavorite = (() => {
    const activeId = loadActiveLayoutFavoriteId();
    return loadLayoutFavorites().find((favorite) => favorite.id === activeId) ?? loadStartupLayoutFavorite();
  })();

  let layout = $state<LayoutNode>(loadLayoutFromStorage());

  let favorites = $state<LayoutFavoriteSnapshot[]>(loadLayoutFavorites());
  let activeFavoriteId = $state<string | null>(loadActiveLayoutFavoriteId());
  let startupFavorite = $state<LayoutFavoriteSnapshot | null>(loadStartupLayoutFavorite());
  let startupApplied = false;

  let lastSavedLayoutJson = "";
  $effect(() => {
    const currentJson = JSON.stringify(layout);
    if (currentJson !== lastSavedLayoutJson) {
      lastSavedLayoutJson = currentJson;
      saveLayoutToStorage(layout);
    }
  });

  const applyFavorite = async (favorite: LayoutFavoriteSnapshot, isStartupRestore = false) => {
    layout = JSON.parse(JSON.stringify(favorite.layout)) as LayoutNode;
    activeFavoriteId = favorite.id;
    saveActiveLayoutFavoriteId(favorite.id);
    saveLayoutToStorage(favorite.layout);

    const store = useMusicStore.getState();
    store.setLanguage(favorite.language);
    store.setAppearance(favorite.appearance);
    store.setAudioSettings(favorite.audioSettings);
    store.setPlaybackSettings(favorite.playbackSettings);
    store.setLibrarySettings(favorite.librarySettings);
    if (favorite.explorerPath) void store.browseDirectory(favorite.explorerPath).catch(() => {});

    if (favorite.selectedDevice && favorite.selectedDevice !== "Default") {
      await store.setOutputDevice(favorite.selectedDevice).catch(() => {});
    }
    await store.setBitPerfectMode(favorite.bitPerfectMode).catch(() => {});
    await store.setVolume(favorite.volume).catch(() => {});
    await onRestoreWindowSize(favorite.windowSize, favorite.playerBarHeightRatio, isStartupRestore);
  };

  onMount(() => {
    if (!hasSavedLayout()) {
      const favoriteToApply = initialFavorite ?? startupFavorite;
      if (favoriteToApply && !startupApplied) {
        startupApplied = true;
        void applyFavorite(favoriteToApply, true);
      }
    }

    const handleRestored = () => {
      layout = loadLayoutFromStorage();
      favorites = loadLayoutFavorites();
      activeFavoriteId = loadActiveLayoutFavoriteId();
      startupFavorite = loadStartupLayoutFavorite();
    };
    window.addEventListener("musicx-layout-restored", handleRestored);
    return () => {
      window.removeEventListener("musicx-layout-restored", handleRestored);
    };
  });

  $effect(() => {
    if (!startupFavorite || activeFavoriteId) return;
    const matchingFavorite = favorites.find((favorite) => favorite.id === startupFavorite?.id);
    if (matchingFavorite) {
      activeFavoriteId = matchingFavorite.id;
    }
  });

  const captureWindowSize = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const currentWindow = getCurrentWindow();
      const [physicalSize, scaleFactor] = await Promise.all([
        currentWindow.innerSize(),
        currentWindow.scaleFactor(),
      ]);
      return {
        width: Math.round(physicalSize.width / scaleFactor),
        height: Math.round(physicalSize.height / scaleFactor),
      };
    } catch {
      return { width: window.innerWidth, height: window.innerHeight };
    }
  };

  const handleSaveFavorite = async (overwriteActive = false) => {
    const store = useMusicStore.getState();
    const activeFavorite = overwriteActive
      ? favorites.find((favorite) => favorite.id === activeFavoriteId)
      : undefined;
    let nextNameIndex = 1;
    while (favorites.some((favorite) => favorite.name === `Favorito ${nextNameIndex}`)) nextNameIndex += 1;
    const id = activeFavorite?.id ?? `layout-favorite-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const name = activeFavorite?.name ?? `Favorito ${nextNameIndex}`;
    let playerBarHeightRatio = 0.18;
    try {
      const savedRatio = Number(localStorage.getItem("musicx_playerbar_height_ratio"));
      if (Number.isFinite(savedRatio) && savedRatio >= 0.06 && savedRatio <= 0.42) {
        playerBarHeightRatio = savedRatio;
      }
    } catch {
      // Use default footer size
    }

    const snapshot: LayoutFavoriteSnapshot = {
      id,
      name,
      layout: JSON.parse(JSON.stringify(layout)) as LayoutNode,
      windowSize: await captureWindowSize(),
      playerBarHeightRatio,
      language: store.language,
      appearance: JSON.parse(JSON.stringify(store.appearance)),
      audioSettings: JSON.parse(JSON.stringify(store.audioSettings)),
      playbackSettings: JSON.parse(JSON.stringify(store.playbackSettings)),
      librarySettings: JSON.parse(JSON.stringify(store.librarySettings)),
      volume: store.volume,
      selectedDevice: store.selectedDevice,
      bitPerfectMode: store.bitPerfectMode,
      explorerPath: store.explorer.currentPath,
    };

    const nextFavorites = activeFavorite
      ? favorites.map((favorite) => (favorite.id === id ? snapshot : favorite))
      : [...favorites, snapshot];
    favorites = nextFavorites;
    saveLayoutFavorites(nextFavorites);
    activeFavoriteId = id;
    saveActiveLayoutFavoriteId(id);

    const savedStartup = loadStartupLayoutFavorite();
    if (!savedStartup || savedStartup.id === id) {
      saveStartupLayoutFavorite(snapshot);
      startupFavorite = snapshot;
    }
  };

  const handleSplit = (targetId: string, direction: "horizontal" | "vertical") => {
    const splitRecursive = (current: LayoutNode): LayoutNode => {
      if (current.id === targetId && current.type === "leaf") {
        const newChild1: LayoutNode = {
          id: `leaf-${Date.now()}-1`,
          type: "leaf",
          widget: current.widget,
        };
        const newChild2: LayoutNode = {
          id: `leaf-${Date.now()}-2`,
          type: "leaf",
          widget: "tracklist",
        };

        return {
          id: `split-${Date.now()}`,
          type: "split",
          direction,
          sizes: [50, 50],
          children: [newChild1, newChild2],
        };
      }

      if (current.type === "split") {
        return {
          ...current,
          children: current.children.map(splitRecursive),
        };
      }

      return current;
    };

    layout = splitRecursive(layout);
  };

  const handleRemove = (targetId: string) => {
    const removeRecursive = (current: LayoutNode): LayoutNode | null => {
      if (current.id === targetId) {
        return null;
      }

      if (current.type === "split") {
        const remaining = current.children
          .map(removeRecursive)
          .filter((c): c is LayoutNode => c !== null);

        if (remaining.length === 0) return null;
        if (remaining.length === 1) return remaining[0];

        const newSizes = remaining.map(() => 100 / remaining.length);
        return {
          ...current,
          children: remaining,
          sizes: newSizes,
        };
      }

      return current;
    };

    const updated = removeRecursive(layout);
    layout = updated ?? DEFAULT_LAYOUT;
  };

  const handleChangeWidget = (targetId: string, widget: WidgetType) => {
    const updateRecursive = (current: LayoutNode): LayoutNode => {
      if (current.id === targetId && current.type === "leaf") {
        return { ...current, widget };
      }

      if (current.type === "split") {
        return {
          ...current,
          children: current.children.map(updateRecursive),
        };
      }

      return current;
    };

    layout = updateRecursive(layout);
  };

  const handleResize = (targetId: string, sizes: number[]) => {
    const resizeRecursive = (current: LayoutNode): LayoutNode => {
      if (current.id === targetId && current.type === "split") {
        return { ...current, sizes };
      }

      if (current.type === "split") {
        return {
          ...current,
          children: current.children.map(resizeRecursive),
        };
      }

      return current;
    };

    layout = resizeRecursive(layout);
  };

  const handleResetLayout = () => {
    const reset = resetLayoutStorage();
    layout = reset;
  };
</script>

<div class="relative flex h-full w-full flex-col overflow-hidden select-none bg-audiophile-base">
  {#if isEditing}
    <div class="relative z-40 flex min-h-10 min-w-0 shrink-0 items-center gap-2 border-b border-audiophile-border bg-audiophile-surface px-3 py-1.5">
      <div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        <button
          type="button"
          onclick={() => void handleSaveFavorite()}
          class="flex h-7 shrink-0 items-center gap-1.5 rounded border border-audiophile-border bg-audiophile-surface2 px-2 text-[10px] font-mono text-audiophile-text hover:border-audiophile-cyan hover:text-white"
          title="Guardar esta distribución en una nueva ranura favorita"
        >
          <BookmarkPlus size={12} />
          <span>Guardar (Fav)</span>
        </button>
        {#each favorites as favorite (favorite.id)}
          {@const isActive = favorite.id === activeFavoriteId}
          {@const isStartup = favorite.id === startupFavorite?.id}
          <button
            type="button"
            onclick={() => (isActive ? void handleSaveFavorite(true) : void applyFavorite(favorite))}
            class="flex h-7 max-w-40 shrink-0 items-center gap-1 rounded border px-2 text-[10px] font-mono transition {isActive ? 'border-audiophile-cyan bg-audiophile-cyan/15 text-audiophile-cyan' : 'border-audiophile-border bg-audiophile-base text-audiophile-muted hover:text-audiophile-text'}"
            title={isActive ? "Favorito activo · pulsa para sobrescribirlo" : `Aplicar ${favorite.name}`}
            aria-pressed={isActive}
          >
            <Star size={10} fill={isStartup ? "currentColor" : "none"} />
            <span class="truncate">{favorite.name}</span>
          </button>
        {/each}
      </div>
      <select
        value=""
        onchange={(event) => {
          const val = (event.target as HTMLSelectElement).value;
          const preset = LAYOUT_PRESETS.find((item) => item.id === val);
          if (preset) layout = JSON.parse(JSON.stringify(preset.layout)) as LayoutNode;
          (event.target as HTMLSelectElement).value = "";
        }}
        class="max-w-[32%] shrink-0 rounded border border-audiophile-border bg-audiophile-surface2 px-2 py-1 text-[11px] font-mono text-audiophile-text"
        aria-label="Aplicar preset de interfaz"
      >
        <option value="" disabled>Layouts</option>
        {#each LAYOUT_PRESETS as preset (preset.id)}
          <option value={preset.id}>{preset.label}</option>
        {/each}
      </select>
      <button
        onclick={handleResetLayout}
        class="flex shrink-0 items-center gap-1.5 rounded border border-audiophile-border bg-audiophile-surface2 px-2 py-1 text-[11px] font-mono text-audiophile-muted hover:text-white"
        title="Restaurar layout predeterminado"
      >
        <RotateCcw size={12} />
        <span>Restablecer</span>
      </button>
    </div>
  {/if}
  <div class="min-h-0 w-full flex-1 overflow-hidden">
    <LayoutNodeRenderer
      node={layout}
      {isEditing}
      onSplit={handleSplit}
      onRemove={handleRemove}
      onChangeWidget={handleChangeWidget}
      onResize={handleResize}
    />
  </div>
</div>
