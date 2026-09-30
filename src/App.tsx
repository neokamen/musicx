import { useEffect, useRef, useState } from "react";
import { Check, Globe, Minimize2, Radio as RadioIcon, Settings, SlidersHorizontal } from "lucide-react";
import { LayoutManager } from "./components/layout/LayoutManager.tsx";
import { HiFiPlayerBar } from "./components/player/HiFiPlayerBar.tsx";
import { MINI_PLAYER_TEMPLATES, MiniPlayer, type MiniPlayerTemplate } from "./components/player/MiniPlayer.tsx";
import { SettingsModal } from "./components/settings/SettingsModal.tsx";
import { AudioEQModal } from "./components/audio/AudioEQModal.tsx";
import { RadioHubModal } from "./components/radio/RadioHubModal.tsx";
import { StreamMusicModal } from "./components/widgets/StreamMusicModal.tsx";
import { useMusicStore } from "./store/index.ts";
import { initTheme } from "./lib/theme.ts";
import { FIRST_RUN_PROFILE } from "./components/layout/defaultLayout.ts";
import whiteLogo from "../simple-white-logo.png";
import blackLogo from "../simple-black-logo.png";
import packageInfo from "../package.json";

const LAST_WINDOW_STATE_KEY = "musicx_last_window_state";
const NORMAL_WINDOW_SIZE_KEY = "musicx_normal_window_size";
const MINI_WINDOW_SIZE_KEY = "musicx_mini_window_size";
const LAST_WINDOW_MODE_KEY = "musicx_last_window_mode";

interface SavedWindowState {
  width: number;
  height: number;
  isMiniPlayer: boolean;
}

function readStoredWindowSize(key: string): { width: number; height: number } | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    if (
      parsed &&
      Number.isFinite(parsed.width) &&
      Number.isFinite(parsed.height) &&
      parsed.width >= 240 && parsed.width <= 10000 &&
      parsed.height >= 140 && parsed.height <= 10000
    ) {
      return { width: Math.round(parsed.width), height: Math.round(parsed.height) };
    }
  } catch {
    // Ignore invalid or unavailable local storage.
  }
  return null;
}

function readSavedWindowState(): SavedWindowState | null {
  try {
    const legacy = JSON.parse(localStorage.getItem(LAST_WINDOW_STATE_KEY) || "null");
    const storedMode = localStorage.getItem(LAST_WINDOW_MODE_KEY);
    const isMiniPlayer = storedMode ? storedMode === "mini" : Boolean(legacy?.isMiniPlayer);
    const storedSize = readStoredWindowSize(isMiniPlayer ? MINI_WINDOW_SIZE_KEY : NORMAL_WINDOW_SIZE_KEY);
    const matchingLegacySize = legacy?.isMiniPlayer === isMiniPlayer
      ? readStoredWindowSize(LAST_WINDOW_STATE_KEY)
      : null;
    const savedTemplate = MINI_PLAYER_TEMPLATES.find(
      (template) => template.id === localStorage.getItem("musicx_mini_player_template"),
    );
    const size = storedSize ?? matchingLegacySize ?? (isMiniPlayer ? savedTemplate ?? MINI_PLAYER_TEMPLATES[0] : null);
    return size ? { ...size, isMiniPlayer } : null;
  } catch {
    return null;
  }
}

function storeWindowState(width: number, height: number, isMiniPlayer: boolean) {
  try {
    localStorage.setItem(LAST_WINDOW_STATE_KEY, JSON.stringify({ width, height, isMiniPlayer }));
    localStorage.setItem(LAST_WINDOW_MODE_KEY, isMiniPlayer ? "mini" : "full");
    localStorage.setItem(
      isMiniPlayer ? MINI_WINDOW_SIZE_KEY : NORMAL_WINDOW_SIZE_KEY,
      JSON.stringify({ width, height }),
    );
  } catch {
    // Ignore unavailable local storage outside the desktop runtime.
  }
}

export default function App() {
  const {
    initListeners,
    appearance,
    playbackSettings,
    telemetry,
    isPlaying,
    activeRadioStation,
    isRadioPlaying,
    isRadioHubOpen,
    setRadioHubOpen,
    isStreamMusicOpen,
    setStreamMusicOpen,
    listeningStats,
    setSettingsOpen,
    addToQueue,
    play,
  } = useMusicStore();

  const [savedWindowState] = useState(readSavedWindowState);
  const [isAudioEqOpen, setIsAudioEqOpen] = useState(false);
  const [isLayoutEditing, setIsLayoutEditing] = useState(false);
  const [isMiniLayoutEditing, setIsMiniLayoutEditing] = useState(false);
  const [isMiniPlayer, setIsMiniPlayer] = useState(savedWindowState?.isMiniPlayer ?? false);
  const [miniPlayerTemplate, setMiniPlayerTemplate] = useState<MiniPlayerTemplate>(() => {
    const savedTemplate = localStorage.getItem("musicx_mini_player_template");
    return MINI_PLAYER_TEMPLATES.some((template) => template.id === savedTemplate)
      ? savedTemplate as MiniPlayerTemplate
      : "winamp";
  });
  const normalWindowSize = useRef(readStoredWindowSize(NORMAL_WINDOW_SIZE_KEY));
  const isMiniPlayerRef = useRef(isMiniPlayer);
  const isRestoringWindowSize = useRef(true);
  const [isLogoOverrideActive, setIsLogoOverrideActive] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const [playerBarHeightRatio, setPlayerBarHeightRatio] = useState(() => {
    const savedRatio = Number(localStorage.getItem("musicx_playerbar_height_ratio"));
    return Number.isFinite(savedRatio) && savedRatio >= 0.06 && savedRatio <= 0.42
      ? savedRatio
      : FIRST_RUN_PROFILE.playerBarHeightRatio;
  });
  const playerBarHeight = Math.max(88, Math.min(viewportHeight * 0.42, Math.round(viewportHeight * playerBarHeightRatio)));
  const handlePlayerBarHeightChange = (height: number, commit = false) => {
    const nextRatio = Math.max(0.06, Math.min(0.42, height / Math.max(1, viewportHeight)));
    setPlayerBarHeightRatio(nextRatio);
    if (commit) localStorage.setItem("musicx_playerbar_height_ratio", String(nextRatio));
  };
  const handleRestoreWindowSize = async (
    size: { width: number; height: number },
    footerRatio: number,
    isStartupRestore = false,
  ) => {
    const width = Math.max(800, Math.round(size.width || FIRST_RUN_PROFILE.windowSize.width));
    const height = Math.max(500, Math.round(size.height || FIRST_RUN_PROFILE.windowSize.height));
    const nextRatio = Math.max(0.06, Math.min(0.42, footerRatio));
    setPlayerBarHeightRatio(nextRatio);
    try {
      localStorage.setItem("musicx_playerbar_height_ratio", String(nextRatio));
    } catch {
      // Ignore unavailable storage outside the desktop runtime.
    }
    if (isStartupRestore && savedWindowState) return;

    try {
      const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
      const currentWindow = getCurrentWindow();
      await currentWindow.setMinSize(null);
      await currentWindow.setSize(new LogicalSize(width, height));
      await currentWindow.setMinSize(new LogicalSize(800, 500));
      const [innerSize, scaleFactor] = await Promise.all([currentWindow.innerSize(), currentWindow.scaleFactor()]);
      const actualSize = {
        width: Math.round(innerSize.width / scaleFactor),
        height: Math.round(innerSize.height / scaleFactor),
      };
      normalWindowSize.current = actualSize;
      storeWindowState(actualSize.width, actualSize.height, false);
    } catch (error) {
      console.error("No se pudo restaurar el tamaño guardado de la ventana:", error);
    }
  };
  const handleMiniPlayerToggle = async () => {
    const nextMiniMode = !isMiniPlayer;
    try {
      const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
      const currentWindow = getCurrentWindow();
      if (nextMiniMode) {
        const [physicalSize, scaleFactor] = await Promise.all([
          currentWindow.innerSize(),
          currentWindow.scaleFactor(),
        ]);
        normalWindowSize.current = {
          width: Math.round(physicalSize.width / scaleFactor),
          height: Math.round(physicalSize.height / scaleFactor),
        };
        localStorage.setItem(NORMAL_WINDOW_SIZE_KEY, JSON.stringify(normalWindowSize.current));
      }

      const targetSize = nextMiniMode
        ? readStoredWindowSize(MINI_WINDOW_SIZE_KEY)
          ?? MINI_PLAYER_TEMPLATES.find((template) => template.id === miniPlayerTemplate)!
        : normalWindowSize.current ?? FIRST_RUN_PROFILE.windowSize;
      isMiniPlayerRef.current = nextMiniMode;
      setIsMiniPlayer(nextMiniMode);
      await currentWindow.setMinSize(null);
      await currentWindow.setSize(new LogicalSize(targetSize.width, targetSize.height));
      if (!nextMiniMode) await currentWindow.setMinSize(new LogicalSize(800, 500));
      const [innerSize, scaleFactor] = await Promise.all([currentWindow.innerSize(), currentWindow.scaleFactor()]);
      storeWindowState(
        Math.round(innerSize.width / scaleFactor),
        Math.round(innerSize.height / scaleFactor),
        nextMiniMode,
      );
    } catch (error) {
      console.error("No se pudo cambiar el tamaño de la ventana:", error);
      isMiniPlayerRef.current = isMiniPlayer;
      setIsMiniPlayer(isMiniPlayer);
    }
  };
  const handleMiniTemplateChange = (template: MiniPlayerTemplate) => {
    setMiniPlayerTemplate(template);
    localStorage.setItem("musicx_mini_player_template", template);
    const size = MINI_PLAYER_TEMPLATES.find((option) => option.id === template)!;
    void import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow, LogicalSize }) => {
        const currentWindow = getCurrentWindow();
        await currentWindow.setSize(new LogicalSize(size.width, size.height));
        const [innerSize, scaleFactor] = await Promise.all([currentWindow.innerSize(), currentWindow.scaleFactor()]);
        storeWindowState(
          Math.round(innerSize.width / scaleFactor),
          Math.round(innerSize.height / scaleFactor),
          isMiniPlayerRef.current,
        );
      })
      .catch((error) => console.error("No se pudo aplicar el tamaño de la plantilla mini:", error));
  };
  const totalListenedSeconds = Math.max(0, Math.floor(listeningStats.totalSecondsListened));
  const listenedYears = Math.floor(totalListenedSeconds / 31_536_000);
  const listenedMonths = Math.floor((totalListenedSeconds % 31_536_000) / 2_592_000);
  const listenedDays = Math.floor((totalListenedSeconds % 2_592_000) / 86_400);
  const listenedClock = totalListenedSeconds % 86_400;
  const listenedTime = [
    Math.floor(listenedClock / 3600),
    Math.floor((listenedClock % 3600) / 60),
    listenedClock % 60,
  ].map((part) => String(part).padStart(2, "0")).join(":");
  const listenedDuration = [
    listenedYears > 0 ? `${listenedYears}y` : null,
    listenedMonths > 0 ? `${listenedMonths}m` : null,
    listenedDays > 0 ? `${listenedDays}d` : null,
    listenedTime,
  ].filter(Boolean).join(" ");
  const backgroundHex = appearance.bgColor.replace("#", "");
  const normalizedBackgroundHex = backgroundHex.length === 3
    ? [...backgroundHex].map((digit) => `${digit}${digit}`).join("")
    : backgroundHex;
  const backgroundRgb = normalizedBackgroundHex.match(/.{2}/g)?.slice(0, 3).map((channel) => parseInt(channel, 16) / 255);
  const backgroundLuminance = backgroundRgb?.length === 3
    ? backgroundRgb.reduce((sum, channel, index) => {
        const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        return sum + linear * [0.2126, 0.7152, 0.0722][index];
      }, 0)
    : 0;
  const automaticLogo = backgroundLuminance > 0.6 ? "black" : "white";
  const visibleLogo = isLogoOverrideActive
    ? automaticLogo === "white" ? "black" : "white"
    : automaticLogo;
  const bpm = telemetry.tempo_bpm || 120;
  const isRadioActive = Boolean(activeRadioStation && isRadioPlaying);

  useEffect(() => {
    initTheme();
    let cleanup: (() => void) | undefined;
    initListeners().then((unlisten: () => void) => {
      cleanup = unlisten;
    });

    return () => {
    cleanup?.();
    };
  }, [initListeners]);

  useEffect(() => {
    let unlistenResize: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;
    let cancelled = false;

    const initializeWindowSize = async () => {
      try {
        const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
        if (cancelled) return;
        const currentWindow = getCurrentWindow();
        unlistenResize = await currentWindow.onResized(({ payload: size }) => {
          if (isRestoringWindowSize.current) return;
          void currentWindow.scaleFactor().then((scaleFactor) => {
            storeWindowState(
              Math.round(size.width / scaleFactor),
              Math.round(size.height / scaleFactor),
              isMiniPlayerRef.current,
            );
          }).catch((error) => console.error("No se pudo guardar el tamaño de la ventana:", error));
        });
        unlistenClose = await currentWindow.onCloseRequested(async () => {
          try {
            const [innerSize, scaleFactor] = await Promise.all([currentWindow.innerSize(), currentWindow.scaleFactor()]);
            storeWindowState(
              Math.round(innerSize.width / scaleFactor),
              Math.round(innerSize.height / scaleFactor),
              isMiniPlayerRef.current,
            );
          } catch (error) {
            console.error("No se pudo guardar el tamaño al cerrar la ventana:", error);
          }
        });

        if (savedWindowState) {
          await currentWindow.setMinSize(null);
          await currentWindow.setSize(new LogicalSize(savedWindowState.width, savedWindowState.height));
          if (!savedWindowState.isMiniPlayer) await currentWindow.setMinSize(new LogicalSize(800, 500));
          const [innerSize, scaleFactor] = await Promise.all([currentWindow.innerSize(), currentWindow.scaleFactor()]);
          const actualSize = {
            width: Math.round(innerSize.width / scaleFactor),
            height: Math.round(innerSize.height / scaleFactor),
          };
          storeWindowState(actualSize.width, actualSize.height, savedWindowState.isMiniPlayer);
          if (!savedWindowState.isMiniPlayer) normalWindowSize.current = actualSize;
        }
      } catch (error) {
        console.error("No se pudo restaurar el último tamaño de la ventana:", error);
      } finally {
        if (!cancelled) isRestoringWindowSize.current = false;
      }
    };

    void initializeWindowSize();
    return () => {
      cancelled = true;
      unlistenResize?.();
      unlistenClose?.();
    };
  }, [savedWindowState]);

  useEffect(() => {
    const updateViewportHeight = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", updateViewportHeight);
    return () => window.removeEventListener("resize", updateViewportHeight);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      const audioFiles = files.filter((f) =>
        /\.(mp3|flac|wav|ogg|m4a|aac|opus|alac)$/i.test(f.name)
      );
      const newTracks = audioFiles.map((f, idx) => ({
          filepath: (f as { path?: string }).path || f.name,
          title: f.name.replace(/\.[^/.]+$/, ""),
          artist: "Archivo Arrastrado",
          album: "Cola Temporal",
          track_number: idx + 1,
          duration_seconds: 0,
          format: f.name.split(".").pop()?.toUpperCase() || "AUDIO",
          sample_rate: 44100,
          bit_depth: 16,
          bitrate_kbps: 1411,
          file_size: f.size,
          mtime: Date.now(),
        }));
        addToQueue(newTracks);
        if (playbackSettings?.autoPlayOnDrop && newTracks.length > 0) {
          play(newTracks[0]);
        }
    }
  };

  const customStyles: React.CSSProperties = {
    backgroundColor: "var(--app-bg)",
    color: "var(--app-text)",
    backdropFilter: appearance.glassmorphism
      ? `blur(${appearance.glassBlur}px)`
      : "none",
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="flex flex-col h-screen w-screen text-slate-100 select-none font-sans overflow-hidden transition-colors duration-300"
      style={customStyles}
    >
      {isMiniPlayer ? (
        <MiniPlayer
          template={miniPlayerTemplate}
          onTemplateChange={handleMiniTemplateChange}
          onExpand={() => void handleMiniPlayerToggle()}
          onOpenRadio={() => setRadioHubOpen(true)}
          onOpenEq={() => setIsAudioEqOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          isEditing={isMiniLayoutEditing}
          onToggleEditing={() => setIsMiniLayoutEditing((editing) => !editing)}
        />
      ) : <>
      <header className="h-11 border-b border-slate-800/80 bg-slate-950/90 flex items-center justify-between pl-[3px] pr-4 shrink-0 shadow-sm z-20">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-0">
            <button
              type="button"
              onClick={() => setIsLogoOverrideActive((active) => !active)}
              className="shrink-0 cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
              title={isLogoOverrideActive ? "Volver al logo automático" : "Cambiar logo blanco/negro"}
              aria-label={isLogoOverrideActive ? "Volver al logo automático" : "Cambiar logo blanco/negro"}
            >
              <img
                src={visibleLogo === "white" ? whiteLogo : blackLogo}
                alt="MusicX"
                className="h-[54px] w-[54px] object-contain"
              />
            </button>
            <div className="flex flex-col leading-none">
              <span className="text-[15px] font-bold font-mono text-white">
                Music<span style={{ color: appearance.accentColor || "#06b6d4" }}>x</span>
              </span>
              <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[8px] text-slate-500">
                <span>THE AUDIO PLAYER</span>
                <span
                  className="font-mono text-[8px] font-light tracking-widest select-none opacity-85"
                  style={{ color: appearance.accentColor || "#06b6d4" }}
                  title={`Versión actual: v${packageInfo.version}`}
                >
                  v{packageInfo.version}
                </span>
              </div>
            </div>
          </div>

          <span className="hidden lg:inline-flex self-end mb-[5px] -translate-y-[5px] items-center gap-1.5 whitespace-nowrap font-mono text-[10px] text-slate-400" title="Tiempo total de reproducción acumulado">
            <span
              className={`h-1.5 w-1.5 rounded-full ${isPlaying ? "bg-emerald-400" : "bg-slate-500"}`}
              style={isPlaying && appearance.inPlayBpmPulseEnabled && telemetry.tempo_bpm ? { animation: `bpm-beat-glow ${60 / bpm}s ease-in-out infinite` } : undefined}
            />
            <span style={{ color: appearance.accentColor || "#06b6d4" }}>In Play:</span>
            <span>{listenedDuration}</span>
          </span>
          <span className="hidden lg:inline-flex self-end mb-[5px] -translate-y-[5px] items-center whitespace-nowrap text-[10px] text-slate-500">
            {telemetry.is_bit_perfect ? "ALSA / BIT-PERFECT" : "PIPEWIRE / COMPARTIDO"}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-3 font-mono text-[11px] text-slate-400">
          <button
            onClick={() => setStreamMusicOpen(true)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border font-sans font-semibold transition cursor-pointer relative"
            style={{
              borderColor: `${appearance.accentColor || "#06b6d4"}50`,
              backgroundColor: `${appearance.accentColor || "#06b6d4"}15`,
              color: appearance.accentColor || "#06b6d4",
            }}
            title="Abrir Stream Music"
          >
            <Globe size={13} />
            <span>Stream Music</span>
          </button>

          <button
            onClick={() => setRadioHubOpen(true)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border font-sans font-semibold transition cursor-pointer relative"
            style={{
              borderColor: isRadioActive
                ? `${appearance.accentColor || "#06b6d4"}90`
                : `${appearance.accentColor || "#06b6d4"}50`,
              backgroundColor: isRadioActive
                ? `${appearance.accentColor || "#06b6d4"}25`
                : `${appearance.accentColor || "#06b6d4"}15`,
              color: appearance.accentColor || "#06b6d4",
              boxShadow: isRadioActive
                ? `0 0 12px ${appearance.accentColor || "#06b6d4"}40`
                : undefined,
            }}
            title="Abrir Radio Online (Neowave)"
          >
            <RadioIcon size={13} className={isRadioActive ? "animate-pulse" : ""} />
            <span>Radio</span>
            {isRadioActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
            )}
          </button>

          <button
            onClick={() => setIsAudioEqOpen(true)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border font-sans font-semibold transition cursor-pointer"
            style={{
              borderColor: `${appearance.accentColor || "#06b6d4"}50`,
              backgroundColor: `${appearance.accentColor || "#06b6d4"}15`,
              color: appearance.accentColor || "#06b6d4",
            }}
            title="Abrir Audio EQ PRO completo tipo Soundix"
          >
            <SlidersHorizontal size={13} />
            <span>Audio EQ PRO</span>
          </button>

          <button
            onClick={() => setIsLayoutEditing((editing) => !editing)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition cursor-pointer font-sans"
            style={{
              borderColor: `${appearance.accentColor || "#06b6d4"}50`,
              backgroundColor: isLayoutEditing ? `${appearance.accentColor || "#06b6d4"}25` : "transparent",
              color: appearance.accentColor || "#06b6d4",
            }}
            title={isLayoutEditing ? "Guardar distribución" : "Editar interfaz"}
          >
            {isLayoutEditing ? <Check size={13} /> : <SlidersHorizontal size={13} />}
            <span>{isLayoutEditing ? "Guardar Layout" : "Editar Interfaz"}</span>
          </button>

          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer font-sans"
          >
            <Settings size={13} />
            <span>Ajustes</span>
          </button>

          <button
            onClick={() => void handleMiniPlayerToggle()}
            className="flex items-center justify-center rounded-lg border border-slate-700 p-1.5 text-slate-300 transition hover:border-cyan-400 hover:text-cyan-300"
            title="Activar mini reproductor"
            aria-label="Activar mini reproductor"
          >
            <Minimize2 size={13} />
          </button>
        </div>
      </header>

      <main className="flex-1 w-full overflow-hidden">
        <LayoutManager isEditing={isLayoutEditing} onRestoreWindowSize={handleRestoreWindowSize} />
      </main>

      <HiFiPlayerBar
        height={playerBarHeight}
        isEditing={isLayoutEditing}
        onHeightChange={handlePlayerBarHeightChange}
      />

      </>}

      <AudioEQModal isOpen={isAudioEqOpen} onClose={() => setIsAudioEqOpen(false)} />
      <StreamMusicModal isOpen={isStreamMusicOpen} onClose={() => setStreamMusicOpen(false)} />
      <RadioHubModal isOpen={isRadioHubOpen} onClose={() => setRadioHubOpen(false)} />
      <SettingsModal />
    </div>
  );
}
