<script lang="ts">
  import { onMount } from "svelte";
  import { Check, Globe, Minimize2, Radio as RadioIcon, Settings, SlidersHorizontal, Tag } from "@lucide/svelte";
  import LayoutManager from "./components/layout/LayoutManager.svelte";
  import HiFiPlayerBar from "./components/player/HiFiPlayerBar.svelte";
  import MiniPlayer from "./components/player/MiniPlayer.svelte";
  import { MINI_PLAYER_TEMPLATES, type MiniPlayerTemplate } from "./types/miniPlayer";
  import SettingsModal from "./components/settings/SettingsModal.svelte";
  import AudioEQModal from "./components/audio/AudioEQModal.svelte";
  import RadioHubModal from "./components/radio/RadioHubModal.svelte";
  import StreamMusicModal from "./components/widgets/StreamMusicModal.svelte";
  import TagAndCoverEditorModal from "./components/tagger/TagAndCoverEditorModal.svelte";
  import {
    useMusicStore,
    AUDIO_ENGINES,
    appearanceStore,
    audioSettingsStore,
    playbackSettingsStore,
    listeningStatsStore,
    isPlayingStore,
    activeRadioStationStore,
    isRadioPlayingStore,
    languageStore,
    isStreamMusicOpenStore,
    isRadioHubOpenStore,
    isTagEditorOpenStore,
    bitPerfectModeStore,
    triggerFullBackupSync,
  } from "./store/index";
  import * as api from "./services/api";
  import { initTheme } from "./lib/theme";
  import { FIRST_RUN_PROFILE } from "./components/layout/defaultLayout";
  import whiteLogo from "../simple-white-logo.png";
  import blackLogo from "../simple-black-logo.png";
  import packageInfo from "../package.json";
  import { t } from "./i18n/translations";

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
        return { width: Number(parsed.width), height: Number(parsed.height) };
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
      const isMini = storedMode ? storedMode === "mini" : Boolean(legacy?.isMiniPlayer);
      const storedSize = readStoredWindowSize(isMini ? MINI_WINDOW_SIZE_KEY : NORMAL_WINDOW_SIZE_KEY);
      const matchingLegacySize = legacy?.isMiniPlayer === isMini
        ? readStoredWindowSize(LAST_WINDOW_STATE_KEY)
        : null;
      const savedTemplate = MINI_PLAYER_TEMPLATES.find(
        (template) => template.id === localStorage.getItem("musicx_mini_player_template"),
      );
      const size = storedSize ?? matchingLegacySize ?? (isMini ? savedTemplate ?? MINI_PLAYER_TEMPLATES[0] : null);
      return size ? { ...size, isMiniPlayer: isMini } : null;
    } catch {
      return null;
    }
  }

  function storeWindowState(width: number, height: number, isMini: boolean, isMaximized = false) {
    try {
      localStorage.setItem(LAST_WINDOW_STATE_KEY, JSON.stringify({ width, height, isMiniPlayer: isMini, isMaximized }));
      localStorage.setItem(LAST_WINDOW_MODE_KEY, isMini ? "mini" : "full");
      if (!isMaximized) {
        localStorage.setItem(
          isMini ? MINI_WINDOW_SIZE_KEY : NORMAL_WINDOW_SIZE_KEY,
          JSON.stringify({ width, height }),
        );
      }
      triggerFullBackupSync();
      void api.saveWindowState({
        width,
        height,
        is_maximized: isMaximized,
        is_mini_player: isMini,
      });
    } catch {
      // Ignore unavailable local storage outside the desktop runtime.
    }
  }

  const savedWindowState = readSavedWindowState();
  let isAudioEqOpen = $state(false);
  let isLayoutEditing = $state(false);
  let isMiniLayoutEditing = $state(false);
  let isMiniPlayer = $state(savedWindowState?.isMiniPlayer ?? false);

  const initialTemplate = (() => {
    const saved = localStorage.getItem("musicx_mini_player_template");
    return MINI_PLAYER_TEMPLATES.some((t) => t.id === saved)
      ? (saved as MiniPlayerTemplate)
      : "winamp";
  })();
  let miniPlayerTemplate = $state<MiniPlayerTemplate>(initialTemplate);

  let normalWindowSize = readStoredWindowSize(NORMAL_WINDOW_SIZE_KEY);
  let isMiniPlayerCurrent = savedWindowState?.isMiniPlayer ?? false;

  let isRestoringWindowSize = true;
  let resizeSaveTimer: number | undefined = undefined;
  let isLogoOverrideActive = $state(false);
  let viewportHeight = $state(typeof window !== "undefined" ? window.innerHeight : 800);

  const initialRatio = (() => {
    const savedRatio = Number(localStorage.getItem("musicx_playerbar_height_ratio"));
    return Number.isFinite(savedRatio) && savedRatio >= 0.06 && savedRatio <= 0.42
      ? savedRatio
      : FIRST_RUN_PROFILE.playerBarHeightRatio;
  })();
  let playerBarHeightRatio = $state(initialRatio);

  const playerBarHeight = $derived(
    Math.max(88, Math.min(viewportHeight * 0.42, Math.round(viewportHeight * playerBarHeightRatio)))
  );

  function handlePlayerBarHeightChange(height: number, commit = false) {
    const nextRatio = Math.max(0.06, Math.min(0.42, height / Math.max(1, viewportHeight)));
    playerBarHeightRatio = nextRatio;
    if (commit) localStorage.setItem("musicx_playerbar_height_ratio", String(nextRatio));
  }

  async function handleRestoreWindowSize(
    size: { width: number; height: number },
    footerRatio: number,
    isStartupRestore = false,
  ) {
    const width = Math.max(800, Math.round(size.width || FIRST_RUN_PROFILE.windowSize.width));
    const height = Math.max(500, Math.round(size.height || FIRST_RUN_PROFILE.windowSize.height));
    const nextRatio = Math.max(0.06, Math.min(0.42, footerRatio));
    playerBarHeightRatio = nextRatio;
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
      normalWindowSize = { width, height };
      storeWindowState(width, height, false);
    } catch (error) {
      console.error("No se pudo restaurar el tamaño guardado de la ventana:", error);
    }
  }

  async function handleMiniPlayerToggle() {
    const nextMiniMode = !isMiniPlayer;
    try {
      const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
      const currentWindow = getCurrentWindow();
      if (nextMiniMode) {
        const [physicalSize, scaleFactor] = await Promise.all([
          currentWindow.innerSize(),
          currentWindow.scaleFactor(),
        ]);
        normalWindowSize = {
          width: Math.round(physicalSize.width / scaleFactor),
          height: Math.round(physicalSize.height / scaleFactor),
        };
        localStorage.setItem(NORMAL_WINDOW_SIZE_KEY, JSON.stringify(normalWindowSize));
      }

      const targetSize = nextMiniMode
        ? readStoredWindowSize(MINI_WINDOW_SIZE_KEY)
          ?? MINI_PLAYER_TEMPLATES.find((template) => template.id === miniPlayerTemplate)!
        : normalWindowSize ?? FIRST_RUN_PROFILE.windowSize;
      isMiniPlayerCurrent = nextMiniMode;
      isMiniPlayer = nextMiniMode;
      await currentWindow.setMinSize(null);
      await currentWindow.setSize(new LogicalSize(targetSize.width, targetSize.height));
      if (!nextMiniMode) await currentWindow.setMinSize(new LogicalSize(800, 500));
      storeWindowState(targetSize.width, targetSize.height, nextMiniMode);
    } catch (error) {
      console.error("No se pudo cambiar el tamaño de la ventana:", error);
      isMiniPlayerCurrent = isMiniPlayer;
      isMiniPlayer = isMiniPlayer;
    }
  }

  function handleMiniTemplateChange(template: MiniPlayerTemplate) {
    miniPlayerTemplate = template;
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
          isMiniPlayerCurrent,
        );
      })
      .catch((error) => console.error("No se pudo aplicar el tamaño de la plantilla mini:", error));
  }

  let appearance = $derived($appearanceStore);
  let audioSettings = $derived($audioSettingsStore);
  let playbackSettings = $derived($playbackSettingsStore);
  let listeningStats = $derived($listeningStatsStore);
  let isPlaying = $derived($isPlayingStore);
  let activeRadioStation = $derived($activeRadioStationStore);
  let isRadioPlaying = $derived($isRadioPlayingStore);
  let lang = $derived($languageStore);
  let isStreamMusicOpen = $derived($isStreamMusicOpenStore);
  let isRadioHubOpen = $derived($isRadioHubOpenStore);
  let bitPerfectMode = $derived($bitPerfectModeStore);

  const totalListenedSeconds = $derived(Math.max(0, Math.floor(listeningStats.totalSecondsListened)));
  const listenedYears = $derived(Math.floor(totalListenedSeconds / 31_536_000));
  const listenedMonths = $derived(Math.floor((totalListenedSeconds % 31_536_000) / 2_592_000));
  const listenedDays = $derived(Math.floor((totalListenedSeconds % 2_592_000) / 86_400));
  const listenedClock = $derived(totalListenedSeconds % 86_400);
  const listenedTime = $derived(
    [
      Math.floor(listenedClock / 3600),
      Math.floor((listenedClock % 3600) / 60),
      listenedClock % 60,
    ].map((part) => String(part).padStart(2, "0")).join(":")
  );
  const listenedDuration = $derived(
    [
      listenedYears > 0 ? `${listenedYears}y` : null,
      listenedMonths > 0 ? `${listenedMonths}m` : null,
      listenedDays > 0 ? `${listenedDays}d` : null,
      listenedTime,
    ].filter(Boolean).join(" ")
  );

  const backgroundHex = $derived((appearance.bgColor || "#000000").replace("#", ""));
  const normalizedBackgroundHex = $derived(
    backgroundHex.length === 3
      ? [...backgroundHex].map((digit) => `${digit}${digit}`).join("")
      : backgroundHex
  );
  const backgroundRgb = $derived(
    normalizedBackgroundHex.match(/.{2}/g)?.slice(0, 3).map((channel) => parseInt(channel, 16) / 255)
  );
  const backgroundLuminance = $derived(
    backgroundRgb?.length === 3
      ? backgroundRgb.reduce((sum, channel, index) => {
          const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          return sum + linear * [0.2126, 0.7152, 0.0722][index];
        }, 0)
      : 0
  );
  const automaticLogo = $derived(backgroundLuminance > 0.6 ? "black" : "white");
  const visibleLogo = $derived(
    isLogoOverrideActive
      ? automaticLogo === "white" ? "black" : "white"
      : automaticLogo
  );
  const bpm = $derived(useMusicStore.getState().telemetry.tempo_bpm || 120);
  const isRadioActive = $derived(Boolean(activeRadioStation && isRadioPlaying));

  $effect(() => {
    if (typeof document === "undefined") return;
    const color = appearance.accentColor;
    if (color && color.startsWith("#")) {
      const clean = color.replace("#", "");
      let r = 6, g = 182, b = 212;
      if (clean.length === 3) {
        r = parseInt(clean[0] + clean[0], 16) || 6;
        g = parseInt(clean[1] + clean[1], 16) || 182;
        b = parseInt(clean[2] + clean[2], 16) || 212;
      } else if (clean.length >= 6) {
        r = parseInt(clean.slice(0, 2), 16) || 6;
        g = parseInt(clean.slice(2, 4), 16) || 182;
        b = parseInt(clean.slice(4, 6), 16) || 212;
      }
      document.documentElement.style.setProperty("--app-accent", color);
      document.documentElement.style.setProperty("--app-accent-rgb", `${r}, ${g}, ${b}`);
      document.documentElement.style.setProperty("--color-olive", color);
    }
  });

  onMount(() => {
    initTheme();
    let cleanupListeners: (() => void) | undefined;
    useMusicStore.getState().initListeners().then((unlisten) => {
      cleanupListeners = unlisten;
    });

    let unlistenResize: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;
    let cancelled = false;

    const initializeWindowSize = async () => {
      try {
        const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
        if (cancelled) return;
        const currentWindow = getCurrentWindow();

        // Check native saved window state from Rust backend
        const nativeState = await api.getSavedWindowState();
        let targetSize = savedWindowState;
        if (nativeState && nativeState.width >= 300 && nativeState.height >= 200) {
          targetSize = {
            width: nativeState.width,
            height: nativeState.height,
            isMiniPlayer: nativeState.is_mini_player,
          };
          if (!nativeState.is_mini_player) {
            normalWindowSize = { width: nativeState.width, height: nativeState.height };
          }
        }

        if (targetSize) {
          if (nativeState?.is_maximized) {
            await currentWindow.maximize().catch(() => {});
          } else {
            await currentWindow.setMinSize(null).catch(() => {});
            await currentWindow.setSize(new LogicalSize(targetSize.width, targetSize.height)).catch(() => {});
            if (!targetSize.isMiniPlayer) {
              await currentWindow.setMinSize(new LogicalSize(800, 500)).catch(() => {});
              normalWindowSize = { width: targetSize.width, height: targetSize.height };
            }
          }
        }

        unlistenResize = await currentWindow.onResized(async ({ payload: size }) => {
          if (isRestoringWindowSize) return;
          const isMax = await currentWindow.isMaximized().catch(() => false);
          if (isMax) {
            storeWindowState(normalWindowSize?.width || 1100, normalWindowSize?.height || 720, isMiniPlayerCurrent, true);
            return;
          }
          window.clearTimeout(resizeSaveTimer);
          resizeSaveTimer = window.setTimeout(async () => {
            try {
              const scaleFactor = await currentWindow.scaleFactor();
              const w = Math.round(size.width / scaleFactor);
              const h = Math.round(size.height / scaleFactor);
              if (w >= 300 && h >= 200) {
                if (!isMiniPlayerCurrent) {
                  normalWindowSize = { width: w, height: h };
                }
                storeWindowState(w, h, isMiniPlayerCurrent, false);
              }
            } catch (error) {
              console.error("No se pudo guardar el tamaño de la ventana:", error);
            }
          }, 180);
        });

        unlistenClose = await currentWindow.onCloseRequested(async () => {
          try {
            const isMax = await currentWindow.isMaximized().catch(() => false);
            if (!isMax) {
              const [innerSize, scaleFactor] = await Promise.all([currentWindow.innerSize(), currentWindow.scaleFactor()]);
              const w = Math.round(innerSize.width / scaleFactor);
              const h = Math.round(innerSize.height / scaleFactor);
              if (w >= 300 && h >= 200) {
                storeWindowState(w, h, isMiniPlayerCurrent, false);
              }
            } else {
              storeWindowState(normalWindowSize?.width || 1100, normalWindowSize?.height || 720, isMiniPlayerCurrent, true);
            }
          } catch (error) {
            console.error("No se pudo guardar el tamaño al cerrar la ventana:", error);
          }
        });
      } catch (error) {
        console.error("No se pudo restaurar el último tamaño de la ventana:", error);
      } finally {
        window.setTimeout(() => {
          if (!cancelled) isRestoringWindowSize = false;
        }, 500);
      }
    };

    void initializeWindowSize();

    const handleWindowResize = () => {
      viewportHeight = window.innerHeight;
    };
    window.addEventListener("resize", handleWindowResize);

    const handleLayoutRestored = () => {
      const stored = readSavedWindowState();
      if (stored && !stored.isMiniPlayer) {
        normalWindowSize = { width: stored.width, height: stored.height };
        void import("@tauri-apps/api/window").then(async ({ getCurrentWindow, LogicalSize }) => {
          const currentWindow = getCurrentWindow();
          await currentWindow.setSize(new LogicalSize(stored.width, stored.height));
        }).catch(() => {});
      }
    };
    window.addEventListener("musicx-layout-restored", handleLayoutRestored);

    return () => {
      cancelled = true;
      window.clearTimeout(resizeSaveTimer);
      unlistenResize?.();
      unlistenClose?.();
      cleanupListeners?.();
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("musicx-layout-restored", handleLayoutRestored);
    };
  });

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
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
      useMusicStore.getState().addToQueue(newTracks);
      if (playbackSettings?.autoPlayOnDrop && newTracks.length > 0) {
        useMusicStore.getState().play(newTracks[0]);
      }
    }
  }

  const customStyles = $derived(
    `background-color: var(--app-bg); color: var(--app-text); backdrop-filter: ${appearance.glassmorphism ? `blur(${appearance.glassBlur}px)` : "none"};`
  );
</script>

<div
  role="region"
  aria-label="MusicX Application"
  ondragover={handleDragOver}
  ondrop={handleDrop}
  class="flex flex-col h-screen w-screen text-slate-100 select-none font-sans overflow-hidden transition-colors duration-300"
  style={customStyles}
>
  {#if isMiniPlayer}
    <MiniPlayer
      template={miniPlayerTemplate}
      onTemplateChange={handleMiniTemplateChange}
      onExpand={() => void handleMiniPlayerToggle()}
      onOpenRadio={() => useMusicStore.getState().setRadioHubOpen(true)}
      onOpenEq={() => { isAudioEqOpen = true; }}
      onOpenSettings={() => useMusicStore.getState().setSettingsOpen(true)}
      isEditing={isMiniLayoutEditing}
      onToggleEditing={() => { isMiniLayoutEditing = !isMiniLayoutEditing; }}
    />
  {:else}
    <header class="h-11 border-b border-slate-800/80 bg-slate-950/90 flex items-center justify-between pl-[3px] pr-4 shrink-0 shadow-sm z-20">
      <div class="flex min-w-0 items-center gap-3">
        <div class="flex items-center gap-0">
          <button
            type="button"
            onclick={() => { isLogoOverrideActive = !isLogoOverrideActive; }}
            class="shrink-0 cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
            title={isLogoOverrideActive ? "Volver al logo automático" : "Cambiar logo blanco/negro"}
            aria-label={isLogoOverrideActive ? "Volver al logo automático" : "Cambiar logo blanco/negro"}
          >
            <img
              src={visibleLogo === "white" ? whiteLogo : blackLogo}
              alt="MusicX"
              class="h-[54px] w-[54px] object-contain"
            />
          </button>
          <div class="flex flex-col leading-none">
            <span class="text-[15px] font-bold font-mono text-white">
              Music<span style="color: {appearance.accentColor || '#06b6d4'};">x</span>
            </span>
            <div class="mt-0.5 flex items-center gap-1.5 font-mono text-[8px] text-slate-500">
              <span>{t('theAudioPlayer', lang)}</span>
              <span
                class="font-mono text-[8px] font-light tracking-widest select-none opacity-85"
                style="color: {appearance.accentColor || '#06b6d4'};"
                title={`Versión actual: v${packageInfo.version}`}
              >
                v{packageInfo.version}
              </span>
            </div>
          </div>
        </div>

        <span class="hidden lg:inline-flex self-end mb-[5px] -translate-y-[5px] items-center gap-1.5 whitespace-nowrap font-mono text-[10px] text-slate-400" title="Tiempo total de reproducción acumulado">
          <span
            class="h-1.5 w-1.5 rounded-full {isPlaying ? 'bg-emerald-400' : 'bg-slate-500'}"
            style={isPlaying && appearance.inPlayBpmPulseEnabled ? `animation: bpm-beat-glow ${60 / bpm}s ease-in-out infinite` : undefined}
          ></span>
          <span style="color: {appearance.accentColor || '#06b6d4'};">{t('inPlay', lang)}</span>
          <span>{listenedDuration}</span>
        </span>
        <span class="hidden lg:inline-flex self-end mb-[5px] -translate-y-[5px] items-center gap-1.5 whitespace-nowrap text-[10px] font-mono">
          <span
            class="h-1.5 w-1.5 rounded-full transition-all duration-300"
            style="background: {(AUDIO_ENGINES.find((e) => e.id === audioSettings.resamplingQuality) || AUDIO_ENGINES[0]).color}; {audioSettings.resamplingQuality === 'float32' ? '' : `box-shadow: 0 0 8px ${(AUDIO_ENGINES.find((e) => e.id === audioSettings.resamplingQuality) || AUDIO_ENGINES[0]).color};`}"
          ></span>
          <span class="text-slate-400 font-medium">
            {#if audioSettings.resamplingQuality === 'bit_perfect' || bitPerfectMode}
              {t('bitPerfectAlsa', lang)}
            {:else if audioSettings.resamplingQuality === 'float32'}
              {t('sharedPipewire', lang)}
            {:else}
              {(AUDIO_ENGINES.find((e) => e.id === audioSettings.resamplingQuality) || AUDIO_ENGINES[0]).name.split(' (')[0]}
            {/if}
          </span>
        </span>
      </div>

      <div class="flex shrink-0 items-center gap-3 font-mono text-[11px] text-slate-400">
        <button
          onclick={() => useMusicStore.getState().setStreamMusicOpen(true)}
          class="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border font-sans font-semibold transition cursor-pointer relative"
          style="border-color: {appearance.accentColor || '#06b6d4'}50; background-color: {appearance.accentColor || '#06b6d4'}15; color: {appearance.accentColor || '#06b6d4'};"
          title="Stream Music"
        >
          <Globe size={13} />
          <span>{t('streamMusic', lang)}</span>
        </button>

        <button
          onclick={() => useMusicStore.getState().setRadioHubOpen(true)}
          class="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border font-sans font-semibold transition cursor-pointer relative"
          style="border-color: {isRadioActive ? `${appearance.accentColor || '#06b6d4'}90` : `${appearance.accentColor || '#06b6d4'}50`}; background-color: {isRadioActive ? `${appearance.accentColor || '#06b6d4'}25` : `${appearance.accentColor || '#06b6d4'}15`}; color: {appearance.accentColor || '#06b6d4'}; {isRadioActive ? `box-shadow: 0 0 12px ${appearance.accentColor || '#06b6d4'}40;` : ''}"
          title="Radio Online (Neowave)"
        >
          <RadioIcon size={13} class={isRadioActive ? "animate-pulse" : ""} />
          <span>{t('radio', lang)}</span>
          {#if isRadioActive}
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block"></span>
          {/if}
        </button>

        <button
          onclick={() => useMusicStore.getState().setTagEditorOpen(true)}
          class="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border font-sans font-semibold transition cursor-pointer relative"
          style="border-color: {appearance.accentColor || '#06b6d4'}50; background-color: {appearance.accentColor || '#06b6d4'}15; color: {appearance.accentColor || '#06b6d4'};"
          title="Editor de Tags ID3 & Carátulas (Soundix)"
        >
          <Tag size={13} />
          <span>{t('tagEditor', lang)}</span>
        </button>

        <button
          onclick={() => { isAudioEqOpen = true; }}
          class="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border font-sans font-semibold transition cursor-pointer"
          style="border-color: {appearance.accentColor || '#06b6d4'}50; background-color: {appearance.accentColor || '#06b6d4'}15; color: {appearance.accentColor || '#06b6d4'};"
          title="Audio EQ PRO"
        >
          <SlidersHorizontal size={13} />
          <span>{t('audioEqPro', lang)}</span>
        </button>

        <button
          onclick={() => { isLayoutEditing = !isLayoutEditing; }}
          class="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition cursor-pointer font-sans"
          style="border-color: {appearance.accentColor || '#06b6d4'}50; background-color: {isLayoutEditing ? `${appearance.accentColor || '#06b6d4'}25` : 'transparent'}; color: {appearance.accentColor || '#06b6d4'};"
          title={isLayoutEditing ? t('saveLayout', lang) : t('editLayout', lang)}
        >
          {#if isLayoutEditing}
            <Check size={13} />
          {:else}
            <SlidersHorizontal size={13} />
          {/if}
          <span>{isLayoutEditing ? t('saveLayout', lang) : t('editLayout', lang)}</span>
        </button>

        <button
          onclick={() => useMusicStore.getState().setSettingsOpen(true)}
          class="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer font-sans"
        >
          <Settings size={13} />
          <span>{t('settings', lang)}</span>
        </button>

        <button
          onclick={() => void handleMiniPlayerToggle()}
          class="flex items-center justify-center rounded-lg border border-slate-700 p-1.5 text-slate-300 transition hover:border-cyan-400 hover:text-cyan-300 cursor-pointer"
          title={t('miniPlayer', lang)}
          aria-label={t('miniPlayer', lang)}
        >
          <Minimize2 size={13} />
        </button>
      </div>
    </header>

    <main class="flex-1 w-full overflow-hidden">
      <LayoutManager isEditing={isLayoutEditing} onRestoreWindowSize={handleRestoreWindowSize} />
    </main>

    <HiFiPlayerBar
      height={playerBarHeight}
      isEditing={isLayoutEditing}
      onHeightChange={handlePlayerBarHeightChange}
    />
  {/if}

  <StreamMusicModal isOpen={isStreamMusicOpen} onClose={() => useMusicStore.getState().setStreamMusicOpen(false)} />
  <RadioHubModal isOpen={isRadioHubOpen} onClose={() => useMusicStore.getState().setRadioHubOpen(false)} />
  <SettingsModal />
  <AudioEQModal isOpen={isAudioEqOpen} onClose={() => { isAudioEqOpen = false; }} />
  <TagAndCoverEditorModal isOpen={$isTagEditorOpenStore} onClose={() => useMusicStore.getState().setTagEditorOpen(false)} />
</div>
