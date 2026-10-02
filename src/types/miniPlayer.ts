export type MiniPlayerTemplate = "winamp" | "cover" | "spectrum" | "slim" | "vinyl" | "foobar";

export interface MiniPlayerFavorite {
  id: string;
  name: string;
  template: MiniPlayerTemplate;
  width: number;
  height: number;
  showCover: boolean;
  showSpectrum: boolean;
  showSeekbar: boolean;
  showVolume: boolean;
  foobarWidgets?: FoobarWidget[];
  foobarSplit?: FoobarSplit;
  foobarLayout?: FoobarCell;
}

export type FoobarWidget = "cover" | "track" | "spectrum" | "seek" | "transport" | "volume" | "format" | "bitrate";
export type FoobarSplit = "single" | "columns-2" | "columns-3" | "rows-2";
export type FoobarCell =
  | { id: string; type: "widget"; widget: FoobarWidget | null }
  | { id: string; type: "split"; direction: "horizontal" | "vertical"; children: FoobarCell[] };

export const FOOBAR_WIDGETS: { id: FoobarWidget; name: string }[] = [
  { id: "cover", name: "Portada" },
  { id: "track", name: "Pista y artista" },
  { id: "spectrum", name: "Espectro" },
  { id: "seek", name: "Barra de progreso" },
  { id: "transport", name: "Controles de reproducción" },
  { id: "volume", name: "Volumen" },
  { id: "format", name: "Formato de audio" },
  { id: "bitrate", name: "Bitrate" },
];

export const DEFAULT_FOOBAR_WIDGETS: FoobarWidget[] = ["cover", "track", "spectrum", "seek", "transport", "volume"];
export const FOOBAR_WIDGETS_KEY = "musicx_mini_foobar_widgets";
export const FOOBAR_SPLIT_KEY = "musicx_mini_foobar_split";
export const FOOBAR_LAYOUT_KEY = "musicx_mini_foobar_layout";
export const MINI_FAVORITES_KEY = "musicx_mini_player_favorites";

export const MINI_PLAYER_TEMPLATES: { id: MiniPlayerTemplate; name: string; width: number; height: number }[] = [
  { id: "winamp", name: "Winamp clásico", width: 440, height: 190 },
  { id: "cover", name: "Portada grande", width: 420, height: 220 },
  { id: "spectrum", name: "Espectro", width: 500, height: 205 },
  { id: "slim", name: "Barra slim", width: 560, height: 150 },
  { id: "vinyl", name: "Vinilo", width: 390, height: 245 },
  { id: "foobar", name: "Foobar modular", width: 520, height: 230 },
];
