import type { LayoutNode } from "../../types/layout.ts";
import {
  triggerFullBackupSync,
  type AppearanceState,
  type AudioSettingsState,
  type LibrarySettings,
  type PlaybackSettingsState,
} from "../../store/index.ts";
import type { Language } from "../../i18n/translations.ts";

export interface LayoutFavoriteSnapshot {
  id: string;
  name: string;
  layout: LayoutNode;
  windowSize: { width: number; height: number };
  playerBarHeightRatio: number;
  language: Language;
  appearance: AppearanceState;
  audioSettings: AudioSettingsState;
  playbackSettings: PlaybackSettingsState;
  librarySettings: LibrarySettings;
  volume: number;
  selectedDevice: string;
  bitPerfectMode: boolean;
  explorerPath: string;
}

export const DEFAULT_LAYOUT: LayoutNode = {
  id: "root",
  type: "split",
  direction: "horizontal",
  sizes: [22, 46, 32],
  children: [
    {
      id: "panel-left",
      type: "leaf",
      widget: "folder_explorer",
    },
    {
      id: "panel-center",
      type: "leaf",
      widget: "tracklist",
    },
    {
      id: "panel-right",
      type: "split",
      direction: "vertical",
      sizes: [30, 24, 24, 22],
      children: [
        {
          id: "panel-right-cover",
          type: "leaf",
          widget: "cover",
        },
        {
          id: "panel-right-inspector",
          type: "leaf",
          widget: "inspector",
        },
        {
          id: "panel-right-spectrum",
          type: "leaf",
          widget: "cava_visualizer",
        },
        {
          id: "panel-right-dac",
          type: "leaf",
          widget: "dac_telemetry",
        },
      ],
    },
  ],
};

export const FIRST_RUN_PROFILE = {
  windowSize: { width: 1100, height: 720 },
  playerBarHeightRatio: 0.18,
  layout: DEFAULT_LAYOUT,
};

export const LAYOUT_PRESETS: { id: string; label: string; layout: LayoutNode }[] = [
  { id: "default", label: "Tres columnas", layout: DEFAULT_LAYOUT },
  {
    id: "single-library",
    label: "1 panel · Biblioteca",
    layout: { id: "preset-single-library", type: "leaf", widget: "tracklist" },
  },
  {
    id: "single-explorer",
    label: "1 panel · Explorador",
    layout: { id: "preset-single-explorer", type: "leaf", widget: "folder_explorer" },
  },
  {
    id: "two-columns",
    label: "2 paneles · Explorador + biblioteca",
    layout: {
      id: "preset-two-columns",
      type: "split",
      direction: "horizontal",
      sizes: [34, 66],
      children: [
        { id: "preset-two-explorer", type: "leaf", widget: "folder_explorer" },
        { id: "preset-two-library", type: "leaf", widget: "tracklist" },
      ],
    },
  },
  {
    id: "two-rows",
    label: "2 paneles · Biblioteca + CAVA",
    layout: {
      id: "preset-two-rows",
      type: "split",
      direction: "vertical",
      sizes: [78, 22],
      children: [
        { id: "preset-two-rows-library", type: "leaf", widget: "tracklist" },
        { id: "preset-two-rows-cava", type: "leaf", widget: "cava_visualizer" },
      ],
    },
  },
  {
    id: "four-panels",
    label: "4 paneles · Cuadrícula",
    layout: {
      id: "preset-four-panels",
      type: "split",
      direction: "vertical",
      sizes: [50, 50],
      children: [
        {
          id: "preset-four-top",
          type: "split",
          direction: "horizontal",
          sizes: [38, 62],
          children: [
            { id: "preset-four-explorer", type: "leaf", widget: "folder_explorer" },
            { id: "preset-four-library", type: "leaf", widget: "tracklist" },
          ],
        },
        {
          id: "preset-four-bottom",
          type: "split",
          direction: "horizontal",
          sizes: [50, 50],
          children: [
            { id: "preset-four-cover", type: "leaf", widget: "cover" },
            { id: "preset-four-cava", type: "leaf", widget: "cava_visualizer" },
          ],
        },
      ],
    },
  },
  {
    id: "full-width-cava-strip",
    label: "CAVA · Franja horizontal completa",
    layout: {
      id: "preset-cava-strip",
      type: "split",
      direction: "vertical",
      sizes: [82, 18],
      children: [
        {
          id: "preset-cava-strip-library-row",
          type: "split",
          direction: "horizontal",
          sizes: [28, 72],
          children: [
            { id: "preset-cava-strip-explorer", type: "leaf", widget: "folder_explorer" },
            { id: "preset-cava-strip-library", type: "leaf", widget: "tracklist" },
          ],
        },
        { id: "preset-cava-strip-visualizer", type: "leaf", widget: "cava_visualizer" },
      ],
    },
  },
  {
    id: "three-columns-cava-strip",
    label: "CAVA largo · 3 columnas",
    layout: {
      id: "preset-cava-three-columns",
      type: "split",
      direction: "vertical",
      sizes: [82, 18],
      children: [
        {
          id: "preset-cava-three-columns-row",
          type: "split",
          direction: "horizontal",
          sizes: [23, 57, 20],
          children: [
            { id: "preset-cava-three-explorer", type: "leaf", widget: "folder_explorer" },
            { id: "preset-cava-three-library", type: "leaf", widget: "tracklist" },
            { id: "preset-cava-three-inspector", type: "leaf", widget: "inspector" },
          ],
        },
        { id: "preset-cava-three-visualizer", type: "leaf", widget: "cava_visualizer" },
      ],
    },
  },
  {
    id: "wide-library",
    label: "Biblioteca amplia",
    layout: {
      id: "preset-wide",
      type: "split",
      direction: "horizontal",
      sizes: [24, 76],
      children: [
        { id: "preset-wide-explorer", type: "leaf", widget: "folder_explorer" },
        { id: "preset-wide-tracks", type: "leaf", widget: "tracklist" },
      ],
    },
  },
  {
    id: "cava-studio",
    label: "Estudio CAVA",
    layout: {
      id: "preset-cava",
      type: "split",
      direction: "horizontal",
      sizes: [68, 32],
      children: [
        { id: "preset-cava-tracks", type: "leaf", widget: "tracklist" },
        {
          id: "preset-cava-side",
          type: "split",
          direction: "vertical",
          sizes: [58, 42],
          children: [
            { id: "preset-cava-visual", type: "leaf", widget: "cava_visualizer" },
            { id: "preset-cava-queue", type: "leaf", widget: "queue" },
          ],
        },
      ],
    },
  },
  {
    id: "explorer-visual",
    label: "Explorador + visualización",
    layout: {
      id: "preset-explorer",
      type: "split",
      direction: "horizontal",
      sizes: [38, 62],
      children: [
        { id: "preset-explorer-files", type: "leaf", widget: "folder_explorer" },
        {
          id: "preset-explorer-right",
          type: "split",
          direction: "vertical",
          sizes: [68, 32],
          children: [
            { id: "preset-explorer-tracks", type: "leaf", widget: "tracklist" },
            { id: "preset-explorer-cava", type: "leaf", widget: "cava_visualizer" },
          ],
        },
      ],
    },
  },
];

const STORAGE_KEY = "musicx_layout_config_v16";
const FAVORITES_STORAGE_KEY = "musicx_layout_favorites_v1";
const STARTUP_FAVORITE_STORAGE_KEY = "musicx_layout_startup_favorite_v1";
const ACTIVE_FAVORITE_STORAGE_KEY = "musicx_layout_active_favorite_v1";

function migrateCavaPanel(node: LayoutNode): LayoutNode {
  if (node.type === "leaf") {
    return node.id === "panel-right-spectrum" && node.widget === "spectrum"
      ? { ...node, widget: "cava_visualizer" }
      : node;
  }
  return { ...node, children: node.children.map(migrateCavaPanel) };
}

export function loadLayoutFromStorage(): LayoutNode {
  try {
    for (let i = 1; i <= 15; i++) {
      localStorage.removeItem(`musicx_layout_config_v${i}`);
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LayoutNode;
      if (parsed && parsed.id && parsed.type) {
        return migrateCavaPanel(parsed);
      }
    }
    const startupSnapshot = loadStartupLayoutFavorite();
    if (startupSnapshot?.layout?.id) return migrateCavaPanel(startupSnapshot.layout);
  } catch (e) {
    console.warn("No se pudo cargar el layout guardado. Usando layout por defecto:", e);
  }
  return FIRST_RUN_PROFILE.layout;
}

export function loadLayoutFavorites(): LayoutFavoriteSnapshot[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    const favorites = raw ? JSON.parse(raw) as LayoutFavoriteSnapshot[] : [];
    return Array.isArray(favorites)
      ? favorites.filter((favorite) => favorite?.id && favorite?.name && favorite?.layout?.id)
      : [];
  } catch {
    return [];
  }
}

export function saveLayoutFavorites(favorites: LayoutFavoriteSnapshot[]): void {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    triggerFullBackupSync();
  } catch (e) {
    console.error("Error al guardar favoritos de layout:", e);
  }
}

export function loadStartupLayoutFavorite(): LayoutFavoriteSnapshot | null {
  try {
    const raw = localStorage.getItem(STARTUP_FAVORITE_STORAGE_KEY);
    return raw ? JSON.parse(raw) as LayoutFavoriteSnapshot : null;
  } catch {
    return null;
  }
}

export function saveStartupLayoutFavorite(favorite: LayoutFavoriteSnapshot): void {
  try {
    localStorage.setItem(STARTUP_FAVORITE_STORAGE_KEY, JSON.stringify(favorite));
    triggerFullBackupSync();
  } catch (e) {
    console.error("Error al guardar el layout de arranque:", e);
  }
}

export function loadActiveLayoutFavoriteId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_FAVORITE_STORAGE_KEY) ?? loadStartupLayoutFavorite()?.id ?? null;
  } catch {
    return loadStartupLayoutFavorite()?.id ?? null;
  }
}

export function saveActiveLayoutFavoriteId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_FAVORITE_STORAGE_KEY, id);
    triggerFullBackupSync();
  } catch {
    // Ignore
  }
}

export function hasSavedLayout(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveLayoutToStorage(layout: LayoutNode): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    triggerFullBackupSync();
  } catch (e) {
    console.error("Error al guardar layout en localStorage:", e);
  }
}

export function resetLayoutStorage(): LayoutNode {
  try {
    for (let i = 1; i <= 16; i++) {
      localStorage.removeItem(`musicx_layout_config_v${i}`);
    }
  } catch {
    // Ignore
  }
  return FIRST_RUN_PROFILE.layout;
}
