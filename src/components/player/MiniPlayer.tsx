import React from "react";
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
} from "lucide-react";
import { useState } from "react";
import { useMusicStore } from "../../store/index.ts";

export type MiniPlayerTemplate = "winamp" | "cover" | "spectrum" | "slim" | "vinyl" | "foobar";

interface MiniPlayerFavorite {
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

type FoobarWidget = "cover" | "track" | "spectrum" | "seek" | "transport" | "volume" | "format" | "bitrate";
type FoobarSplit = "single" | "columns-2" | "columns-3" | "rows-2";
type FoobarCell =
  | { id: string; type: "widget"; widget: FoobarWidget | null }
  | { id: string; type: "split"; direction: "horizontal" | "vertical"; children: FoobarCell[] };

const FOOBAR_WIDGETS: { id: FoobarWidget; name: string }[] = [
  { id: "cover", name: "Portada" },
  { id: "track", name: "Pista y artista" },
  { id: "spectrum", name: "Espectro" },
  { id: "seek", name: "Barra de progreso" },
  { id: "transport", name: "Controles de reproducción" },
  { id: "volume", name: "Volumen" },
  { id: "format", name: "Formato de audio" },
  { id: "bitrate", name: "Bitrate" },
];
const DEFAULT_FOOBAR_WIDGETS: FoobarWidget[] = ["cover", "track", "spectrum", "seek", "transport", "volume"];
const FOOBAR_WIDGETS_KEY = "musicx_mini_foobar_widgets";
const FOOBAR_SPLIT_KEY = "musicx_mini_foobar_split";
const FOOBAR_LAYOUT_KEY = "musicx_mini_foobar_layout";

const MINI_FAVORITES_KEY = "musicx_mini_player_favorites";

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

export const MINI_PLAYER_TEMPLATES: { id: MiniPlayerTemplate; name: string; width: number; height: number }[] = [
  { id: "winamp", name: "Winamp clásico", width: 440, height: 190 },
  { id: "cover", name: "Portada grande", width: 420, height: 220 },
  { id: "spectrum", name: "Espectro", width: 500, height: 205 },
  { id: "slim", name: "Barra slim", width: 560, height: 150 },
  { id: "vinyl", name: "Vinilo", width: 390, height: 245 },
  { id: "foobar", name: "Foobar modular", width: 520, height: 230 },
];

interface MiniPlayerProps {
  template: MiniPlayerTemplate;
  onTemplateChange: (template: MiniPlayerTemplate) => void;
  onExpand: () => void;
  onOpenRadio: () => void;
  onOpenEq: () => void;
  onOpenSettings: () => void;
  isEditing: boolean;
  onToggleEditing: () => void;
}

function formatTime(seconds: number): string {
  if (!seconds || Number.isNaN(seconds)) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({
  template,
  onTemplateChange,
  onExpand,
  onOpenRadio,
  onOpenEq,
  onOpenSettings,
  isEditing,
  onToggleEditing,
}) => {
  const [favorites, setFavorites] = useState<MiniPlayerFavorite[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(MINI_FAVORITES_KEY) || "[]");
      return Array.isArray(saved) ? saved.filter((item) => item?.id && item?.name && MINI_PLAYER_TEMPLATES.some((option) => option.id === item.template)) : [];
    } catch {
      return [];
    }
  });
  const [favoriteName, setFavoriteName] = useState("");
  const [showCover, setShowCover] = useState(template === "cover" || template === "vinyl" || template === "foobar");
  const [showSpectrum, setShowSpectrum] = useState(template === "spectrum" || template === "foobar");
  const [showSeekbar, setShowSeekbar] = useState(template !== "slim");
  const [showVolume, setShowVolume] = useState(template !== "slim");
  const [foobarLayout, setFoobarLayout] = useState(loadFoobarLayout);
  const foobarWidgets = getFoobarWidgets(foobarLayout);
  const {
    isPlaying,
    volume,
    currentTrack,
    currentCoverArt,
    telemetry,
    togglePlayPause,
    nextTrack,
    previousTrack,
    seek,
    setVolume,
    appearance,
  } = useMusicStore();

  const currentTime = telemetry.current_time || 0;
  const duration = telemetry.duration || currentTrack?.duration_seconds || 0;
  const title = telemetry.track_title || currentTrack?.title || "Musicx Hi-Fi Player";
  const artist = telemetry.track_artist || currentTrack?.artist || "Listo para reproducir";
  const audioFormat = currentTrack?.format || telemetry.filepath?.split(".").pop()?.toUpperCase() || "PCM";
  const bitrate = telemetry.bitrate || currentTrack?.bitrate_kbps || 0;
  const accent = template === "winamp" ? "#a3e635" : appearance.accentColor || "#06b6d4";
  const spectrum = telemetry.spectrum.slice(0, 36);
  const templateSurface = template === "winamp"
    ? "border-lime-400/50 bg-[#11180e] shadow-[inset_0_0_18px_rgba(163,230,53,0.08)]"
    : template === "cover"
      ? "border-white/15 bg-[#111217]"
      : template === "vinyl"
        ? "border-rose-300/30 bg-[#171014]"
        : template === "slim"
          ? "border-emerald-300/35 bg-[#0b1513]"
          : "border-cyan-400/40 bg-[#080e18]";
  const currentTemplate = MINI_PLAYER_TEMPLATES.find((option) => option.id === template)!;
  const changeTemplate = (nextTemplate: MiniPlayerTemplate) => {
    setShowCover(nextTemplate === "cover" || nextTemplate === "vinyl" || nextTemplate === "foobar");
    setShowSpectrum(nextTemplate === "spectrum" || nextTemplate === "foobar");
    setShowSeekbar(nextTemplate !== "slim");
    setShowVolume(nextTemplate !== "slim");
    onTemplateChange(nextTemplate);
  };

  const saveFoobarLayout = (layout: FoobarCell) => {
    setFoobarLayout(layout);
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
    setFavorites(nextFavorites);
    localStorage.setItem(MINI_FAVORITES_KEY, JSON.stringify(nextFavorites));
    setFavoriteName("");
  };

  const applyFavorite = (favorite: MiniPlayerFavorite) => {
    changeTemplate(favorite.template);
    setShowCover(favorite.showCover ?? false);
    setShowSpectrum(favorite.showSpectrum ?? false);
    setShowSeekbar(favorite.showSeekbar ?? true);
    setShowVolume(favorite.showVolume ?? true);
    const restoredFoobarLayout = favorite.foobarLayout
      ?? createLegacyFoobarLayout(favorite.foobarWidgets ?? [...DEFAULT_FOOBAR_WIDGETS], favorite.foobarSplit ?? "columns-2");
    saveFoobarLayout(restoredFoobarLayout);
  };

  const renderFoobarCell = (cell: FoobarCell): React.ReactNode => {
    if (cell.type === "split") {
      return (
        <div key={cell.id} className={`flex min-h-0 min-w-0 flex-1 gap-1 ${cell.direction === "horizontal" ? "flex-row" : "flex-col"}`}>
          {cell.children.map((child) => (
            <div key={child.id} className="flex min-h-0 min-w-0 flex-1 basis-0">
              {renderFoobarCell(child)}
            </div>
          ))}
        </div>
      );
    }

    if (cell.widget === null) {
      return (
        <div key={cell.id} className="flex h-full min-h-10 min-w-0 items-center justify-center border border-dashed border-white/15 bg-white/[0.02] p-1">
          {isEditing ? (
            <select defaultValue="" onChange={(event) => { if (event.target.value) addFoobarWidget(event.target.value as FoobarWidget, cell.id); }} aria-label="Añadir widget a esta casilla" className="max-w-full bg-black/40 px-1.5 py-1 text-[10px] text-white">
              <option value="" disabled>Añadir widget...</option>
              {FOOBAR_WIDGETS.filter((widget) => !foobarWidgets.includes(widget.id)).map((widget) => <option key={widget.id} value={widget.id} className="bg-slate-900">{widget.name}</option>)}
            </select>
          ) : <span className="text-[9px] text-white/30">Casilla vacía</span>}
        </div>
      );
    }

    const widget = cell.widget;
    return (
      <div key={cell.id} className={`relative flex h-full min-h-0 min-w-0 items-center justify-center overflow-hidden ${isEditing ? "border border-white/10 bg-white/[0.03] pt-6" : ""}`}>
        {isEditing && (
          <div className="absolute right-1 top-1 z-10 flex items-center gap-0.5">
            <button type="button" onClick={() => splitFoobarWidget(cell, "horizontal")} title="Dividir casilla en horizontal" aria-label="Dividir casilla en horizontal" className="flex h-5 w-5 items-center justify-center bg-black/70 text-white/65 hover:text-cyan-300"><Columns2 size={12} /></button>
            <button type="button" onClick={() => splitFoobarWidget(cell, "vertical")} title="Dividir casilla en vertical" aria-label="Dividir casilla en vertical" className="flex h-5 w-5 items-center justify-center bg-black/70 text-white/65 hover:text-cyan-300"><Rows2 size={12} /></button>
            <button type="button" onClick={() => removeFoobarWidget(cell.id)} title="Cerrar widget" aria-label="Cerrar widget" className="flex h-5 w-5 items-center justify-center bg-black/70 text-white/65 hover:text-rose-300"><X size={12} /></button>
          </div>
        )}
        <div className="flex h-full min-h-0 min-w-0 w-full items-center justify-center overflow-hidden p-2">
          {widget === "cover" && (currentCoverArt ? <img src={currentCoverArt} alt="Portada del álbum" className="h-full max-w-full object-contain" /> : <span className="text-[10px] text-white/40">Sin portada</span>)}
          {widget === "track" && <div className="min-w-0 flex-1 text-center"><div className="truncate text-[12px] font-bold" title={title}>{title}</div><div className="truncate text-[10px] text-white/55" title={artist}>{artist}</div></div>}
          {widget === "spectrum" && <div className="flex h-full max-h-14 w-full items-end gap-[2px] overflow-hidden" aria-label="Espectro de audio">{(spectrum.length ? spectrum : Array.from({ length: 36 }, () => 0.04)).map((value, index) => <span key={index} className="min-w-[2px] flex-1 bg-[var(--mini-accent)]" style={{ height: `${Math.max(8, Math.min(100, value * 100))}%` }} />)}</div>}
          {widget === "seek" && <div className="flex w-full min-w-0 items-center gap-1 text-[9px] text-white/55"><span>{formatTime(currentTime)}</span><input type="range" min={0} max={duration || 100} step={0.1} value={Math.min(currentTime, duration || 100)} disabled={!duration} onChange={(event) => seek(Number(event.target.value))} aria-label="Posición de reproducción" className="h-1 min-w-0 flex-1 accent-[var(--mini-accent)]" /><span>{formatTime(duration)}</span></div>}
          {widget === "transport" && <div className="flex items-center gap-3"><button type="button" onClick={previousTrack} title="Anterior" aria-label="Pista anterior" className="text-white/65 hover:text-[var(--mini-accent)]"><SkipBack size={14} /></button><button type="button" onClick={() => void togglePlayPause()} title={isPlaying ? "Pausar" : "Reproducir"} aria-label={isPlaying ? "Pausar" : "Reproducir"} className="flex h-7 w-7 items-center justify-center border border-[var(--mini-accent)] text-[var(--mini-accent)]">{isPlaying ? <Pause size={13} /> : <Play size={13} />}</button><button type="button" onClick={nextTrack} title="Siguiente" aria-label="Pista siguiente" className="text-white/65 hover:text-[var(--mini-accent)]"><SkipForward size={14} /></button></div>}
          {widget === "volume" && <div className="flex w-full items-center justify-center gap-2"><button type="button" onClick={() => void setVolume(volume > 0 ? 0 : 1)} title={volume > 0 ? "Silenciar" : "Activar sonido"} aria-label={volume > 0 ? "Silenciar" : "Activar sonido"} className="text-white/60 hover:text-[var(--mini-accent)]">{volume > 0 ? <Volume2 size={14} /> : <VolumeX size={14} />}</button><input type="range" min={0} max={1} step={0.01} value={Math.min(volume, 1)} onChange={(event) => void setVolume(Number(event.target.value))} aria-label="Volumen" className="w-20 accent-[var(--mini-accent)]" /></div>}
          {widget === "format" && <span className="text-[11px] font-bold text-[var(--mini-accent)]">{audioFormat}</span>}
          {widget === "bitrate" && <span className="text-[10px] text-white/65">{bitrate ? `${bitrate} kbps` : "Bitrate desconocido"}</span>}
        </div>
      </div>
    );
  };

  return (
    <section
      className={`mini-player mini-player-${template} flex h-full min-h-0 flex-col overflow-hidden border font-mono text-white ${templateSurface}`}
      style={{ "--mini-accent": accent } as React.CSSProperties}
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-2">
        <span className="shrink-0 text-[12px] font-bold text-white" aria-label="Musicx">
          Music<span className="text-[var(--mini-accent)]">x</span>
        </span>
        <div className="flex shrink-0 items-center justify-end gap-0.5">
          <MiniAction icon={<RadioIcon size={14} />} label="Abrir radio" onClick={onOpenRadio} />
          <MiniAction icon={<SlidersHorizontal size={14} />} label="Abrir ecualizador" onClick={onOpenEq} />
          <MiniAction
            icon={isEditing ? <Check size={14} /> : <Pencil size={14} />}
            label={isEditing ? "Cerrar editor de interfaz" : "Editar interfaz compacta"}
            active={isEditing}
            onClick={onToggleEditing}
          />
          <MiniAction icon={<Settings size={14} />} label="Abrir ajustes" onClick={onOpenSettings} />
          <MiniAction icon={<Maximize2 size={14} />} label="Volver a ventana completa" onClick={onExpand} />
        </div>
      </div>

      {isEditing && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-white/10 bg-black/20 px-2 py-1.5">
          <span className="text-[9px] uppercase text-white/50">Diseño</span>
          <select value={template} onChange={(event) => changeTemplate(event.target.value as MiniPlayerTemplate)} className="max-w-32 bg-black/30 px-1.5 py-1 text-[10px] text-white" aria-label="Diseño del reproductor compacto">
            {MINI_PLAYER_TEMPLATES.map((option) => <option key={option.id} value={option.id} className="bg-slate-900">{option.name}</option>)}
          </select>
          {template === "foobar" ? (
            <>
              <select defaultValue="" onChange={(event) => { if (event.target.value) addFoobarWidget(event.target.value as FoobarWidget); event.currentTarget.value = ""; }} aria-label="Añadir widget Foobar" className="max-w-40 bg-black/30 px-1.5 py-1 text-[10px] text-white">
                <option value="" disabled>Añadir widget...</option>
                {FOOBAR_WIDGETS.filter((widget) => !foobarWidgets.includes(widget.id)).map((widget) => <option key={widget.id} value={widget.id} className="bg-slate-900">{widget.name}</option>)}
              </select>
            </>
          ) : (
            <>
              <MiniToggle label="Portada" checked={showCover} onChange={setShowCover} />
              <MiniToggle label="Espectro" checked={showSpectrum} onChange={setShowSpectrum} />
              <MiniToggle label="Seek" checked={showSeekbar} onChange={setShowSeekbar} />
              <MiniToggle label="Volumen" checked={showVolume} onChange={setShowVolume} />
            </>
          )}
          <input value={favoriteName} onChange={(event) => setFavoriteName(event.target.value)} placeholder="Nombre de favorita" className="min-w-0 flex-1 bg-black/30 px-2 py-1 text-[10px] text-white placeholder:text-white/35" aria-label="Nombre de la plantilla favorita" />
          <button type="button" onClick={saveFavorite} disabled={!favoriteName.trim()} title="Guardar plantilla favorita" className="flex h-6 w-7 items-center justify-center border border-white/10 text-white/75 hover:text-[var(--mini-accent)] disabled:opacity-35"><BookmarkPlus size={13} /></button>
          {favorites.length > 0 && (
            <select defaultValue="" onChange={(event) => { const favorite = favorites.find((item) => item.id === event.target.value); if (favorite) applyFavorite(favorite); event.currentTarget.value = ""; }} aria-label="Aplicar plantilla favorita" className="max-w-32 bg-black/30 px-1 py-1 text-[10px] text-white">
              <option value="" disabled>Favoritas ({favorites.length})</option>
              {favorites.map((favorite) => <option key={favorite.id} value={favorite.id} className="bg-slate-900">{favorite.name}</option>)}
            </select>
          )}
        </div>
      )}

      {template === "foobar" ? (
        <div className="flex min-h-0 flex-1 overflow-hidden p-1">{renderFoobarCell(foobarLayout)}</div>
      ) : <>
      <div className={`flex min-h-0 flex-1 items-center gap-3 overflow-hidden px-3 py-2 ${showCover ? "gap-4" : ""} ${template === "slim" ? "py-1" : ""}`}>
        {showCover && (
          <div className={`${template === "vinyl" ? "h-[108px] w-[108px] rounded-full" : "h-[92px] w-[92px]"} relative shrink-0 overflow-hidden border border-white/10 bg-black/40`}>
            {currentCoverArt ? <img src={currentCoverArt} alt="Portada del álbum" className="h-full w-full object-cover" /> : (
              <div className="flex h-full items-center justify-center text-[10px] text-white/40">{template === "vinyl" ? <Disc3 size={32} /> : "MUSICX"}</div>
            )}
            {template === "vinyl" && <span className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40 bg-black/70" />}
          </div>
        )}

        <div className="min-w-0 flex-1">
          {showSpectrum && (
            <div className="mb-2 flex h-8 items-end gap-[2px] overflow-hidden" aria-hidden="true">
              {(spectrum.length ? spectrum : Array.from({ length: 36 }, () => 0.04)).map((value, index) => (
                <span
                  key={index}
                  className="min-w-[2px] flex-1 bg-[var(--mini-accent)] opacity-90"
                  style={{ height: `${Math.max(8, Math.min(100, value * 100))}%` }}
                />
              ))}
            </div>
          )}
          <div className="truncate text-[13px] font-bold" title={title}>{title}</div>
          <div className="mt-0.5 truncate text-[11px] text-white/55" title={artist}>{artist}</div>
          {showSeekbar && <div className="mt-3 flex items-center gap-2 text-[9px] text-white/50">
            <span className="w-8 text-right">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={Math.min(currentTime, duration || 100)}
              disabled={!duration}
              onChange={(event) => seek(Number(event.target.value))}
              aria-label="Posición de reproducción"
              className="h-1 min-w-0 flex-1 cursor-pointer accent-[var(--mini-accent)] disabled:cursor-default"
            />
            <span className="w-8">{formatTime(duration)}</span>
          </div>}
        </div>
        {template === "slim" && (
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={previousTrack} title="Anterior" aria-label="Pista anterior" className="text-white/65 hover:text-[var(--mini-accent)]"><SkipBack size={14} /></button>
            <button type="button" onClick={() => void togglePlayPause()} title={isPlaying ? "Pausar" : "Reproducir"} aria-label={isPlaying ? "Pausar" : "Reproducir"} className="flex h-7 w-7 items-center justify-center border border-[var(--mini-accent)] text-[var(--mini-accent)]">{isPlaying ? <Pause size={13} /> : <Play size={13} />}</button>
            <button type="button" onClick={nextTrack} title="Siguiente" aria-label="Siguiente" className="text-white/65 hover:text-[var(--mini-accent)]"><SkipForward size={14} /></button>
            {showVolume && <button type="button" onClick={() => void setVolume(volume > 0 ? 0 : 1)} title="Silenciar/activar sonido" aria-label="Silenciar o activar sonido" className="ml-1 text-white/60 hover:text-[var(--mini-accent)]">{volume > 0 ? <Volume2 size={14} /> : <VolumeX size={14} />}</button>}
          </div>
        )}
      </div>

      {template !== "slim" && <div className="flex h-11 shrink-0 items-center justify-center gap-4 border-t border-white/10 px-3">
        <button type="button" onClick={previousTrack} title="Anterior" aria-label="Pista anterior" className="text-white/65 hover:text-[var(--mini-accent)]">
          <SkipBack size={16} />
        </button>
        <button
          type="button"
          onClick={() => void togglePlayPause()}
          title={isPlaying ? "Pausar" : "Reproducir"}
          aria-label={isPlaying ? "Pausar" : "Reproducir"}
          className="flex h-8 w-8 items-center justify-center border border-[var(--mini-accent)] text-[var(--mini-accent)] transition hover:bg-[var(--mini-accent)] hover:text-black"
        >
          {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        </button>
        <button type="button" onClick={nextTrack} title="Siguiente" aria-label="Pista siguiente" className="text-white/65 hover:text-[var(--mini-accent)]">
          <SkipForward size={16} />
        </button>
        {showVolume && <div className="ml-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void setVolume(volume > 0 ? 0 : 1)}
            title={volume > 0 ? "Silenciar" : "Activar sonido"}
            aria-label={volume > 0 ? "Silenciar" : "Activar sonido"}
            className="text-white/60 hover:text-[var(--mini-accent)]"
          >
            {volume > 0 ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={Math.min(volume, 1)}
            onChange={(event) => void setVolume(Number(event.target.value))}
            aria-label="Volumen"
            className="w-14 cursor-pointer accent-[var(--mini-accent)]"
          />
        </div>}
      </div>}
      </>}
    </section>
  );
};

function MiniAction({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-7 w-7 items-center justify-center border border-transparent transition hover:border-white/15 hover:text-[var(--mini-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--mini-accent)] ${active ? "text-[var(--mini-accent)]" : "text-white/70"}`}
    >
      {icon}
    </button>
  );
}

function MiniToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-1 text-[9px] text-white/65">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-[var(--mini-accent)]" />
      {label}
    </label>
  );
}