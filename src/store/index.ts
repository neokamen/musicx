import { create } from "zustand";
import { homeDir } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AudioTelemetry, FileNode, PlaybackState, RepeatMode, ScanStatus, Track } from "../types/index.ts";
import * as api from "../services/api.ts";
import type { Language } from "../i18n/translations.ts";
import type { SpectrumStyle } from "../components/widgets/SpectrumVisualizer.tsx";
import type { TransportStyle } from "../lib/transportStyles.ts";
import type { RadioStation } from "../types/radio.ts";
import { radioAudioService } from "../services/radioAudioService.ts";
import { addRecentStation } from "../services/radioStorage.ts";
import { getSavedMarqueeSpeed, saveMarqueeSpeed, getSavedMarqueeDelay, saveMarqueeDelay } from "../lib/theme.ts";

let statsCloseInProgress = false;

export interface ExplorerState {
  currentPath: string;
  entries: FileNode[];
  isLoading: boolean;
  error: string | null;
  history: string[];
  historyIndex: number;
}

export interface AppearanceState {
  accentColor: string;
  accentPreset: string;
  bgColor: string;
  bgPreset: string;
  glassmorphism: boolean;
  glassBlur: number;
  neonGlow: boolean;
  neonIntensity: number;
  inPlayBpmPulseEnabled: boolean;
  playButtonBpmPulseEnabled: boolean;
  borderEffect: boolean;
  borderOpacity: number;
  borderRadius: number;
  borderGlow: boolean;
  spectrumFps: 30 | 60 | 120 | 144;
  spectrumSensitivity: number;
  spectrumStyle: SpectrumStyle;
  cavaStyle: "fluid" | "waves" | "dots" | "lines" | "bars" | "radial" | "prism" | "embers" | "scope";
  cavaFps: 30 | 60 | 120 | 144;
  cavaBars: number;
  cavaSensitivity: number;
  cavaGravity: "monstercat" | "studio" | "instant";
  cavaOfflineFallback: boolean;
  cavaSmoothing: number;
  cavaPeakHold: boolean;
  cavaMirrored: boolean;
  cavaPalette: "accent" | "aurora" | "fire" | "mono" | "ocean" | "sunset" | "forest" | "candy" | "ice" | "custom";
  cavaCustomPalette: [string, string, string];
  marqueeSpeed: number;
  marqueeDelay: number;
}

export interface AudioSettingsState {
  allowExtraVolumeBoost: boolean;
  resamplingQuality: "bit_perfect" | "symphonia_96k" | "float32";
  bufferLatency: "ultra_low" | "low" | "stable";
  crossfadeMs: number;
  ditherEngine: "tpdf" | "none";
  isEqEnabled: boolean;
  isNormalizerEnabled: boolean;
  isXdssEnabled: boolean;
  isXtsProEnabled: boolean;
  tubeWarmth: boolean;
  eqGains: number[];
  eqSubBoost: number;
  eqBassBoost: number;
  eqHighpass: number;
  eqLowpass: number;
}

export interface PlaybackSettingsState {
  crossfadeDurationSec: number;
  gaplessPlayback: boolean;
  replayGainMode: "track" | "album" | "off";
  autoPlayOnDrop: boolean;
  playerBarStyle: "classic" | "spectrum" | "hybrid" | "aurora" | "segments" | "ribbon";
  transportStyle: TransportStyle;
  showBpmInPlayer: boolean;
  playerBarWidth: number;
  playerInfoWidth: number;
  diffuseAlbumArt: boolean;
  diffuseAlbumArtOpacity: number;
}

export interface ListeningStatsState {
  totalTracksPlayed: number;
  totalSecondsListened: number;
  totalSessions: number;
}

export interface LibrarySettings {
  musicFolder: string;
  explorerHomeFolder: string;
  autoScanOnStartup: boolean;
  totalHoursOverride?: number;
  radioRecordingFolder?: string;
  radioMaxStoredTracks?: number;
  // When enabled, a new recording starts/stops automatically each time the station announces a new song
  radioAutoRecordEnabled?: boolean;
  // "manual" = export/import JSON on demand; "sync" = auto read/write a chosen file (e.g. a cloud-synced folder)
  statsBackupMode: "manual" | "sync";
  statsSyncFilePath: string;
  // How often the sync file gets written: every 10s of playback (current default), every X minutes, or only on app close
  statsSyncFrequency: "interval10s" | "intervalMinutes" | "onClose";
  statsSyncIntervalMinutes: number;
}

export interface MusicPlayerStore {
  isPlaying: boolean;
  volume: number;
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
  activeRadioStation: RadioStation | null;
  isRadioPlaying: boolean;
  isRadioHubOpen: boolean;

  telemetry: AudioTelemetry;
  availableDevices: string[];
  selectedDevice: string;
  bitPerfectMode: boolean;

  libraryTracks: Track[];
  scanStatus: ScanStatus;
  librarySearchQuery: string;

  explorer: ExplorerState;

  // Settings & Customizations
  language: Language;
  appearance: AppearanceState;
  audioSettings: AudioSettingsState;
  playbackSettings: PlaybackSettingsState;
  listeningStats: ListeningStatsState;
  librarySettings: LibrarySettings;
  isSettingsOpen: boolean;
  currentCoverArt: string | null;
  coverArtCache: Record<string, string>;

  // Actions
  setAudioSettings: (settings: Partial<AudioSettingsState>) => void;
  setPlaybackSettings: (settings: Partial<PlaybackSettingsState>) => void;
  resetStats: () => void;
  setListeningStats: (stats: Partial<ListeningStatsState>, options?: { syncFile?: boolean }) => void;
  loadListeningStatsFromSyncFile: () => Promise<void>;
  resetSettings: () => void;
  clearCacheAndResidues: () => void;
  play: (track?: Track) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  setVolume: (vol: number) => Promise<void>;
  nextTrack: () => Promise<void>;
  previousTrack: () => Promise<void>;
  setQueue: (tracks: Track[], startIndex?: number) => Promise<void>;
  addToQueue: (track: Track | Track[]) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  playRadioStation: (station: RadioStation) => Promise<void>;
  stopRadio: () => void;
  setRadioHubOpen: (open: boolean) => void;

  setBitPerfectMode: (enabled: boolean) => Promise<void>;
  setOutputDevice: (deviceName: string) => Promise<void>;
  refreshAudioDevices: () => Promise<void>;

  fetchLibraryTracks: (query?: string) => Promise<void>;
  startDirectoryScan: (path: string, force?: boolean) => Promise<void>;

  browseDirectory: (path: string) => Promise<void>;
  navigateBack: () => Promise<void>;
  navigateForward: () => Promise<void>;
  navigateUp: () => Promise<void>;

  // Settings actions
  setLanguage: (lang: Language) => void;
  setAppearance: (appearance: Partial<AppearanceState>) => void;
  setLibrarySettings: (settings: Partial<LibrarySettings>, options?: { syncFile?: boolean }) => void;
  setSettingsOpen: (open: boolean) => void;
  fetchTrackCoverArt: (filepath: string) => Promise<string | null>;

  updateTelemetry: (telemetry: AudioTelemetry) => void;
  updateScanStatus: (status: ScanStatus) => void;
  handleTrackEnded: (filepath: string) => Promise<void>;
  initListeners: () => Promise<() => void>;
}

const SETTINGS_STORAGE_KEY = "musicx_settings_v5";
const EXPLORER_PATH_STORAGE_KEY = "musicx_explorer_last_path_v1";

const defaultAppearance: AppearanceState = {
  accentColor: "#06b6d4", // Cyan
  accentPreset: "cyan",
  bgColor: "#090d16",
  bgPreset: "obsidian",
  glassmorphism: true,
  glassBlur: 10,
  neonGlow: true,
  neonIntensity: 50,
  inPlayBpmPulseEnabled: true,
  playButtonBpmPulseEnabled: true,
  borderEffect: true,
  borderOpacity: 40,
  borderRadius: 8,
  borderGlow: true,
  spectrumFps: 60,
  spectrumSensitivity: 150,
  spectrumStyle: "bars",
  cavaStyle: "fluid",
  cavaFps: 60,
  cavaBars: 64,
  cavaSensitivity: 100,
  cavaGravity: "monstercat",
  cavaOfflineFallback: true,
  cavaSmoothing: 65,
  cavaPeakHold: true,
  cavaMirrored: true,
  cavaPalette: "aurora",
  cavaCustomPalette: ["#00d1ff", "#4f46e5", "#ff4fd8"],
  marqueeSpeed: 10,
  marqueeDelay: 2,
};

const defaultAudioSettings: AudioSettingsState = {
  allowExtraVolumeBoost: true,
  resamplingQuality: "bit_perfect",
  bufferLatency: "ultra_low",
  crossfadeMs: 0,
  ditherEngine: "tpdf",
  isEqEnabled: false,
  isNormalizerEnabled: true,
  isXdssEnabled: false,
  isXtsProEnabled: false,
  tubeWarmth: false,
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  eqSubBoost: 0,
  eqBassBoost: 0,
  eqHighpass: 0,
  eqLowpass: 0,
};

const defaultPlaybackSettings: PlaybackSettingsState = {
  crossfadeDurationSec: 0,
  gaplessPlayback: true,
  replayGainMode: "track",
  autoPlayOnDrop: true,
  playerBarStyle: "hybrid",
  transportStyle: "studio",
  showBpmInPlayer: true,
  playerBarWidth: 100,
  playerInfoWidth: 204,
  diffuseAlbumArt: true,
  diffuseAlbumArtOpacity: 25,
};

const defaultListeningStats: ListeningStatsState = {
  totalTracksPlayed: 0,
  totalSecondsListened: 0,
  totalSessions: 0,
};

const defaultLibrarySettings: LibrarySettings = {
  musicFolder: "",
  explorerHomeFolder: "",
  autoScanOnStartup: true,
  totalHoursOverride: 7.9,
  radioRecordingFolder: "",
  radioMaxStoredTracks: 20,
  radioAutoRecordEnabled: false,
  statsBackupMode: "manual",
  statsSyncFilePath: "",
  statsSyncFrequency: "interval10s",
  statsSyncIntervalMinutes: 5,
};

function loadStoredSettings(): {
  language: Language;
  appearance: AppearanceState;
  audioSettings: AudioSettingsState;
  playbackSettings: PlaybackSettingsState;
  listeningStats: ListeningStatsState;
  librarySettings: LibrarySettings;
} {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const savedStats = parsed.listeningStats || {};
      const listeningStats =
        savedStats.totalTracksPlayed === 142 &&
        savedStats.totalSecondsListened === 28540 &&
        savedStats.totalSessions === 18
          ? defaultListeningStats
          : { ...defaultListeningStats, ...savedStats };
      const savedAppearance = parsed.appearance || {};
      const {
        bpmPulseEnabled: legacyInPlayBpmPulseEnabled,
        playButtonBpmPulseEnabled: legacyPlayButtonBpmPulseEnabled,
        ...savedPlaybackSettings
      } = parsed.playbackSettings || {};
      return {
        language: parsed.language || "es",
        appearance: {
          ...defaultAppearance,
          ...savedAppearance,
          inPlayBpmPulseEnabled:
            savedAppearance.inPlayBpmPulseEnabled ?? legacyInPlayBpmPulseEnabled ?? defaultAppearance.inPlayBpmPulseEnabled,
          playButtonBpmPulseEnabled:
            savedAppearance.playButtonBpmPulseEnabled ?? legacyPlayButtonBpmPulseEnabled ?? defaultAppearance.playButtonBpmPulseEnabled,
          marqueeSpeed:
            savedAppearance.marqueeSpeed ?? getSavedMarqueeSpeed() ?? defaultAppearance.marqueeSpeed,
          marqueeDelay:
            savedAppearance.marqueeDelay ?? getSavedMarqueeDelay() ?? defaultAppearance.marqueeDelay,
        },
        audioSettings: { ...defaultAudioSettings, ...(parsed.audioSettings || {}) },
        playbackSettings: { ...defaultPlaybackSettings, ...savedPlaybackSettings },
        listeningStats,
        librarySettings: { ...defaultLibrarySettings, ...(parsed.librarySettings || {}) },
      };
    }
  } catch {
    // Fallback on parse failure
  }
  return {
    language: "es",
    appearance: defaultAppearance,
    audioSettings: defaultAudioSettings,
    playbackSettings: defaultPlaybackSettings,
    listeningStats: defaultListeningStats,
    librarySettings: defaultLibrarySettings,
  };
}

function saveStoredSettings(
  state: {
    language: Language;
    appearance: AppearanceState;
    audioSettings: AudioSettingsState;
    playbackSettings: PlaybackSettingsState;
    listeningStats: ListeningStatsState;
    librarySettings: LibrarySettings;
  },
  options: { syncFile?: boolean } = {}
) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore write failure
  }
  if (options.syncFile !== false) {
    syncListeningStatsToFile(state.librarySettings, state.listeningStats);
  }
}

// Decides whether accumulated playback seconds should trigger a sync-file write, per the chosen frequency
function shouldSyncStatsNow(librarySettings: LibrarySettings, accumulatedSeconds: number): boolean {
  if (librarySettings.statsBackupMode !== "sync" || !librarySettings.statsSyncFilePath) {
    return false;
  }
  if (librarySettings.statsSyncFrequency === "onClose") {
    return false;
  }
  const intervalSeconds =
    librarySettings.statsSyncFrequency === "intervalMinutes"
      ? Math.max(1, librarySettings.statsSyncIntervalMinutes) * 60
      : 10;
  return Math.floor(accumulatedSeconds) % intervalSeconds === 0;
}

async function flushListeningStatsToFile(librarySettings: LibrarySettings, listeningStats: ListeningStatsState): Promise<void> {
  if (librarySettings.statsBackupMode !== "sync" || !librarySettings.statsSyncFilePath) {
    return;
  }
  const payload = JSON.stringify(
    {
      format: "musicx-listening-stats-v1",
      exportedAt: new Date().toISOString(),
      listeningStats,
    },
    null,
    2
  );
  try {
    await api.writeTextFile(librarySettings.statsSyncFilePath, payload);
  } catch {
    // Ignore sync write failure (e.g. path temporarily unavailable, cloud folder offline)
  }
}

function syncListeningStatsToFile(librarySettings: LibrarySettings, listeningStats: ListeningStatsState) {
  void flushListeningStatsToFile(librarySettings, listeningStats);
}

const stored = loadStoredSettings();

const initialTelemetry: AudioTelemetry = {
  state: "Stopped" as PlaybackState,
  current_time: 0,
  duration: 0,
  sample_rate: 44100,
  bits_per_sample: 16,
  bitrate: 1411,
  channels: 2,
  volume: 1.0,
  is_bit_perfect: true, // Bit-perfect exclusive mode on by default
  output_device: "ALSA (Bit-Perfect Direct)",
  track_title: null,
  track_artist: null,
  track_album: null,
  filepath: null,
  spectrum: [],
  spectrum_left: [],
  spectrum_right: [],
  seekbar_spectrum: [],
  tempo_bpm: null,
  tempo_confidence: 0,
};

const defaultHomePath = (() => {
  try {
    return localStorage.getItem(EXPLORER_PATH_STORAGE_KEY) || stored.librarySettings.explorerHomeFolder;
  } catch {
    return stored.librarySettings.explorerHomeFolder;
  }
})();

export const useMusicStore = create<MusicPlayerStore>((set, get) => ({
  isPlaying: false,
  volume: 1.0,
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  shuffle: false,
  repeat: "off",
  activeRadioStation: null,
  isRadioPlaying: false,
  isRadioHubOpen: false,

  telemetry: initialTelemetry,
  availableDevices: [],
  selectedDevice: "Default",
  bitPerfectMode: true, // Bit-perfect exclusive by default

  libraryTracks: [],
  scanStatus: {
    is_scanning: false,
    current: 0,
    total: 0,
  },
  librarySearchQuery: "",

  explorer: {
    currentPath: defaultHomePath,
    entries: [],
    isLoading: false,
    error: null,
    history: defaultHomePath ? [defaultHomePath] : [],
    historyIndex: 0,
  },

  language: stored.language,
  appearance: stored.appearance,
  audioSettings: stored.audioSettings,
  playbackSettings: stored.playbackSettings,
  listeningStats: stored.listeningStats,
  librarySettings: stored.librarySettings,
  isSettingsOpen: false,
  currentCoverArt: null,
  coverArtCache: {},

  play: async (track?: Track) => {
    if (get().activeRadioStation) {
      radioAudioService.stop();
      set({ activeRadioStation: null, isRadioPlaying: false });
    }

    const targetTrack = track ?? get().currentTrack;
    if (!targetTrack) return;

    const { bitPerfectMode, selectedDevice, fetchTrackCoverArt, listeningStats } = get();

    await api.playTrack(
      targetTrack.filepath,
      bitPerfectMode,
      selectedDevice === "Default" ? undefined : selectedDevice
    );

    // Fetch cover art concurrently
    fetchTrackCoverArt(targetTrack.filepath);

    // Update listening stats
    const nextStats = {
      ...listeningStats,
      totalTracksPlayed: listeningStats.totalTracksPlayed + 1,
      totalSessions: listeningStats.totalSessions + 1,
    };

    set((state) => {
      const idx = state.queue.findIndex((t) => t.filepath === targetTrack.filepath);
      let newQueue = state.queue;
      let newIdx = idx;

      if (idx === -1) {
        newQueue = [...state.queue, targetTrack];
        newIdx = newQueue.length - 1;
      }

      saveStoredSettings({
        language: state.language,
        appearance: state.appearance,
        audioSettings: state.audioSettings,
        playbackSettings: state.playbackSettings,
        listeningStats: nextStats,
        librarySettings: state.librarySettings,
      });

      return {
        currentTrack: targetTrack,
        isPlaying: true,
        queue: newQueue,
        queueIndex: newIdx,
        listeningStats: nextStats,
      };
    });
  },

  pause: async () => {
    if (get().activeRadioStation) {
      radioAudioService.pause();
      set({ isPlaying: false, isRadioPlaying: false });
    } else {
      await api.pauseAudio();
      set({ isPlaying: false });
    }
  },

  resume: async () => {
    if (get().activeRadioStation) {
      await radioAudioService.resume();
      set({ isPlaying: true, isRadioPlaying: true });
    } else {
      await api.resumeAudio();
      set({ isPlaying: true });
    }
  },

  stop: async () => {
    if (get().activeRadioStation) {
      radioAudioService.stop();
      set({ activeRadioStation: null, isRadioPlaying: false, isPlaying: false });
    }
    await api.stopAudio();
    set({ isPlaying: false });
  },

  togglePlayPause: async () => {
    const { isPlaying, activeRadioStation, currentTrack, queue, telemetry, play, pause, resume } = get();
    if (activeRadioStation) {
      if (isPlaying) {
        await pause();
      } else {
        await resume();
      }
      return;
    }

    if (isPlaying) {
      await pause();
    } else if (currentTrack) {
      const duration = telemetry.duration || currentTrack.duration_seconds;
      const endTolerance = Math.min(0.5, duration * 0.1);
      const hasFinished = telemetry.state === "Stopped" ||
        (duration > 0 && telemetry.current_time >= duration - endTolerance);
      if (hasFinished) await play(currentTrack);
      else await resume();
    } else if (queue.length > 0) {
      await play(queue[0]);
    }
  },

  seek: async (seconds: number) => {
    if (get().activeRadioStation) return;
    await api.seekAudio(seconds);
    set((state) => ({
      telemetry: { ...state.telemetry, current_time: seconds },
    }));
  },

  setVolume: async (vol: number) => {
    radioAudioService.setVolume(vol);
    await api.setVolume(vol);
    set({ volume: vol });
  },

  playRadioStation: async (station: RadioStation) => {
    await api.stopAudio().catch(() => {});

    const currentVolume = get().volume;
    const streamUrl = station.url_resolved || station.url;

    const radioTrack: Track = {
      filepath: streamUrl,
      title: station.name,
      artist: station.country
        ? `${station.country} • ${station.tags || "Radio"}`
        : (station.tags || "Emisora Online"),
      album: "Radio Online (Neowave)",
      track_number: 1,
      duration_seconds: 0,
      format: station.codec || "RADIO",
      sample_rate: 44100,
      bit_depth: 16,
      bitrate_kbps: station.bitrate || 128,
      file_size: 0,
      mtime: Date.now(),
    };

    set({
      activeRadioStation: station,
      isRadioPlaying: true,
      isPlaying: true,
      currentTrack: radioTrack,
      currentCoverArt: station.favicon || null,
      telemetry: {
        ...get().telemetry,
        state: "Playing",
        track_title: radioTrack.title,
        track_artist: radioTrack.artist,
        track_album: radioTrack.album,
        filepath: radioTrack.filepath,
        current_time: 0,
        duration: 0,
        bitrate: station.bitrate || 128,
        sample_rate: 44100,
        bits_per_sample: 16,
      },
    });

    await radioAudioService.playStation(station, currentVolume);
    addRecentStation(station);
  },

  stopRadio: () => {
    radioAudioService.stop();
    set({
      activeRadioStation: null,
      isRadioPlaying: false,
      isPlaying: false,
    });
  },

  setRadioHubOpen: (open: boolean) => set({ isRadioHubOpen: open }),

  nextTrack: async () => {
    const { queue, queueIndex, shuffle, repeat, play } = get();
    if (queue.length === 0) return;

    let nextIndex = queueIndex + 1;

    if (shuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else if (nextIndex >= queue.length) {
      if (repeat === "all") {
        nextIndex = 0;
      } else {
        return;
      }
    }

    const nextTrk = queue[nextIndex];
    if (nextTrk) {
      await play(nextTrk);
    }
  },

  previousTrack: async () => {
    const { queue, queueIndex, telemetry, seek, play } = get();
    if (queue.length === 0) return;

    if (telemetry.current_time > 3) {
      await seek(0);
      return;
    }

    let prevIndex = queueIndex - 1;
    if (prevIndex < 0) {
      prevIndex = queue.length - 1;
    }

    const prevTrk = queue[prevIndex];
    if (prevTrk) {
      await play(prevTrk);
    }
  },

  setQueue: async (tracks: Track[], startIndex = 0) => {
    set({
      queue: tracks,
      queueIndex: startIndex,
    });
    if (tracks.length > 0 && startIndex >= 0 && startIndex < tracks.length) {
      await get().play(tracks[startIndex]);
    }
  },

  addToQueue: (track: Track | Track[]) => {
    set((state) => {
      const toAdd = Array.isArray(track) ? track : [track];
      return { queue: [...state.queue, ...toAdd] };
    });
  },

  removeFromQueue: (index: number) => {
    set((state) => {
      const nextQueue = [...state.queue];
      nextQueue.splice(index, 1);
      let nextIndex = state.queueIndex;
      if (index < state.queueIndex) {
        nextIndex--;
      } else if (index === state.queueIndex) {
        if (nextIndex >= nextQueue.length) {
          nextIndex = nextQueue.length - 1;
        }
      }
      return { queue: nextQueue, queueIndex: nextIndex };
    });
  },

  clearQueue: () => {
    set({ queue: [], queueIndex: -1 });
  },

  toggleShuffle: () => {
    set((state) => ({ shuffle: !state.shuffle }));
  },

  cycleRepeat: () => {
    set((state) => {
      const modes: RepeatMode[] = ["off", "all", "one"];
      const currentIdx = modes.indexOf(state.repeat);
      const nextIdx = (currentIdx + 1) % modes.length;
      return { repeat: modes[nextIdx] };
    });
  },

  setBitPerfectMode: async (enabled: boolean) => {
    await api.setBitPerfect(enabled);
    set({ bitPerfectMode: enabled });
  },

  setOutputDevice: async (deviceName: string) => {
    await api.setOutputDevice(deviceName);
    set({ selectedDevice: deviceName });
  },

  refreshAudioDevices: async () => {
    try {
      const devices = await api.getAudioDevices();
      set({ availableDevices: devices });
    } catch {
      // Ignore
    }
  },

  fetchLibraryTracks: async (query?: string) => {
    try {
      const tracks = await api.searchTracks(query || "");
      set({
        libraryTracks: tracks,
        librarySearchQuery: query || "",
      });
    } catch {
      // Ignore
    }
  },

  startDirectoryScan: async (path: string, force = false) => {
    try {
      await api.scanDirectory(path, force);
    } catch {
      // Ignore
    }
  },

  browseDirectory: async (path: string) => {
    set((state) => ({
      explorer: { ...state.explorer, isLoading: true, error: null },
    }));
    try {
      const entries = await api.readDirectory(path);
      set((state) => {
        const history = [...state.explorer.history];
        if (history[history.length - 1] !== path) {
          history.push(path);
        }
        try {
          localStorage.setItem(EXPLORER_PATH_STORAGE_KEY, path);
        } catch {
          // Ignore write failure
        }
        return {
          explorer: {
            currentPath: path,
            entries,
            isLoading: false,
            error: null,
            history,
            historyIndex: history.length - 1,
          },
        };
      });
    } catch (err: unknown) {
      set((state) => ({
        explorer: {
          ...state.explorer,
          isLoading: false,
          error: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  },

  navigateBack: async () => {
    const { explorer, browseDirectory } = get();
    if (explorer.historyIndex > 0) {
      const targetIdx = explorer.historyIndex - 1;
      const targetPath = explorer.history[targetIdx];
      await browseDirectory(targetPath);
      set((state) => ({
        explorer: { ...state.explorer, historyIndex: targetIdx },
      }));
    }
  },

  navigateForward: async () => {
    const { explorer, browseDirectory } = get();
    if (explorer.historyIndex < explorer.history.length - 1) {
      const targetIdx = explorer.historyIndex + 1;
      const targetPath = explorer.history[targetIdx];
      await browseDirectory(targetPath);
      set((state) => ({
        explorer: { ...state.explorer, historyIndex: targetIdx },
      }));
    }
  },

  navigateUp: async () => {
    const { explorer, browseDirectory } = get();
    const parts = explorer.currentPath.split("/").filter(Boolean);
    if (parts.length > 0) {
      parts.pop();
      const parentPath = "/" + parts.join("/");
      await browseDirectory(parentPath || "/");
    }
  },

  setAudioSettings: (patch: Partial<AudioSettingsState>) => {
    set((state) => {
      const next = { ...state.audioSettings, ...patch };
      saveStoredSettings({
        language: state.language,
        appearance: state.appearance,
        audioSettings: next,
        playbackSettings: state.playbackSettings,
        listeningStats: state.listeningStats,
        librarySettings: state.librarySettings,
      });
      // Synchronize DSP with Rust backend
      api.setDspSettings({
        is_eq_enabled: next.isEqEnabled,
        eq_gains: next.eqGains,
        is_normalizer_enabled: next.isNormalizerEnabled,
        is_xdss_enabled: next.isXdssEnabled,
        is_xts_pro_enabled: next.isXtsProEnabled,
        tube_warmth: next.tubeWarmth,
      }).catch(() => {});
      radioAudioService.setDspSettings({
        isEqEnabled: next.isEqEnabled,
        eqGains: next.eqGains,
        subBoost: next.eqSubBoost,
        bassBoost: next.eqBassBoost,
        highpass: next.eqHighpass,
        lowpass: next.eqLowpass,
        isNormalizerEnabled: next.isNormalizerEnabled,
        isXdssEnabled: next.isXdssEnabled,
        isXtsProEnabled: next.isXtsProEnabled,
      });
      return { audioSettings: next };
    });
  },

  setPlaybackSettings: (patch: Partial<PlaybackSettingsState>) => {
    set((state) => {
      const next = { ...state.playbackSettings, ...patch };
      saveStoredSettings({
        language: state.language,
        appearance: state.appearance,
        audioSettings: state.audioSettings,
        playbackSettings: next,
        listeningStats: state.listeningStats,
        librarySettings: state.librarySettings,
      });
      return { playbackSettings: next };
    });
  },

  resetStats: () => {
    const freshStats: ListeningStatsState = {
      totalTracksPlayed: 0,
      totalSecondsListened: 0,
      totalSessions: 0,
    };
    set((state) => {
      // Never touch the manual/sync backup files here: only clears the local counter
      saveStoredSettings(
        {
          language: state.language,
          appearance: state.appearance,
          audioSettings: state.audioSettings,
          playbackSettings: state.playbackSettings,
          listeningStats: freshStats,
          librarySettings: state.librarySettings,
        },
        { syncFile: false }
      );
      return { listeningStats: freshStats };
    });
  },

  setListeningStats: (patch: Partial<ListeningStatsState>, options: { syncFile?: boolean } = {}) => {
    set((state) => {
      const next = { ...state.listeningStats, ...patch };
      saveStoredSettings({
        language: state.language,
        appearance: state.appearance,
        audioSettings: state.audioSettings,
        playbackSettings: state.playbackSettings,
        listeningStats: next,
        librarySettings: state.librarySettings,
      }, options);
      return { listeningStats: next };
    });
  },

  loadListeningStatsFromSyncFile: async () => {
    const { statsBackupMode, statsSyncFilePath } = get().librarySettings;
    if (statsBackupMode !== "sync" || !statsSyncFilePath) {
      return;
    }
    try {
      const raw = await api.readTextFile(statsSyncFilePath);
      const current = get();
      if (
        current.librarySettings.statsBackupMode !== "sync" ||
        current.librarySettings.statsSyncFilePath !== statsSyncFilePath
      ) {
        return;
      }
      if (!raw) {
        // Nothing on disk yet: seed the sync file with the current local stats
        syncListeningStatsToFile(current.librarySettings, current.listeningStats);
        return;
      }
      const backup = JSON.parse(raw);
      const fileStats = backup?.listeningStats;
      if (!fileStats || !Number.isFinite(fileStats.totalSecondsListened)) {
        return;
      }
      const fileStatsAreAuthoritative: ListeningStatsState = {
        totalSecondsListened: Math.max(0, fileStats.totalSecondsListened),
        totalTracksPlayed: Math.max(0, Number(fileStats.totalTracksPlayed) || 0),
        totalSessions: Math.max(0, Number(fileStats.totalSessions) || 0),
      };
      set((latest) => {
        if (
          latest.librarySettings.statsBackupMode !== "sync" ||
          latest.librarySettings.statsSyncFilePath !== statsSyncFilePath
        ) {
          return latest;
        }
        saveStoredSettings({
          language: latest.language,
          appearance: latest.appearance,
          audioSettings: latest.audioSettings,
          playbackSettings: latest.playbackSettings,
          listeningStats: fileStatsAreAuthoritative,
          librarySettings: latest.librarySettings,
        }, { syncFile: false });
        return { listeningStats: fileStatsAreAuthoritative };
      });
    } catch {
      // Ignore sync read failure (invalid JSON, unavailable path, etc.)
    }
  },

  resetSettings: () => {
    set((state) => {
      const resetLang: Language = "es";
      const resetApp = { ...defaultAppearance };
      const resetAud = { ...defaultAudioSettings };
      const resetPlay = { ...defaultPlaybackSettings };
      const resetLib = { ...defaultLibrarySettings };
      saveStoredSettings({
        language: resetLang,
        appearance: resetApp,
        audioSettings: resetAud,
        playbackSettings: resetPlay,
        listeningStats: state.listeningStats,
        librarySettings: resetLib,
      });
      return {
        language: resetLang,
        appearance: resetApp,
        audioSettings: resetAud,
        playbackSettings: resetPlay,
        librarySettings: resetLib,
      };
    });
  },

  clearCacheAndResidues: () => {
    try {
      localStorage.removeItem(SETTINGS_STORAGE_KEY);
    } catch {
      // Ignore
    }
    set({
      coverArtCache: {},
      currentCoverArt: null,
      queue: [],
      queueIndex: -1,
    });
  },

  setLanguage: (lang: Language) => {
    set((state) => {
      saveStoredSettings({
        language: lang,
        appearance: state.appearance,
        audioSettings: state.audioSettings,
        playbackSettings: state.playbackSettings,
        listeningStats: state.listeningStats,
        librarySettings: state.librarySettings,
      });
      return { language: lang };
    });
  },

  setAppearance: (patch: Partial<AppearanceState>) => {
    if (patch.marqueeSpeed !== undefined) {
      saveMarqueeSpeed(patch.marqueeSpeed);
    }
    if (patch.marqueeDelay !== undefined) {
      saveMarqueeDelay(patch.marqueeDelay);
    }
    set((state) => {
      const next = { ...state.appearance, ...patch };
      saveStoredSettings({
        language: state.language,
        appearance: next,
        audioSettings: state.audioSettings,
        playbackSettings: state.playbackSettings,
        listeningStats: state.listeningStats,
        librarySettings: state.librarySettings,
      });
      return { appearance: next };
    });
  },

  setLibrarySettings: (patch: Partial<LibrarySettings>, options: { syncFile?: boolean } = {}) => {
    set((state) => {
      const next = { ...state.librarySettings, ...patch };
      saveStoredSettings({
        language: state.language,
        appearance: state.appearance,
        audioSettings: state.audioSettings,
        playbackSettings: state.playbackSettings,
        listeningStats: state.listeningStats,
        librarySettings: next,
      }, options);
      return { librarySettings: next };
    });
  },

  setSettingsOpen: (open: boolean) => {
    set({ isSettingsOpen: open });
  },

  fetchTrackCoverArt: async (filepath: string) => {
    const cache = get().coverArtCache;
    if (cache[filepath]) {
      set({ currentCoverArt: cache[filepath] });
      return cache[filepath];
    }
    try {
      const cover = await api.getTrackCoverArt(filepath);
      if (cover) {
        set((state) => ({
          currentCoverArt: cover,
          coverArtCache: { ...state.coverArtCache, [filepath]: cover },
        }));
        return cover;
      }
    } catch {
      // Ignore
    }
    set({ currentCoverArt: null });
    return null;
  },

  updateTelemetry: (telemetry: AudioTelemetry) => {
    set((state) => {
      // If a radio station is active, don't overwrite with backend stopped state
      if (state.activeRadioStation) {
        return state;
      }

      // Auto fetch cover art when track changes
      if (telemetry.filepath && telemetry.filepath !== state.telemetry.filepath) {
        get().fetchTrackCoverArt(telemetry.filepath);
      }

      // Calculate time delta for active listening telemetry
      let updatedStats = state.listeningStats;
      if (telemetry.state === "Playing" && telemetry.current_time > state.telemetry.current_time) {
        const delta = Math.min(2, Math.max(0, telemetry.current_time - state.telemetry.current_time));
        if (delta > 0) {
          const nextSecs = state.listeningStats.totalSecondsListened + delta;
          updatedStats = { ...state.listeningStats, totalSecondsListened: nextSecs };
          // Cache to localStorage periodically
          if (Math.floor(nextSecs) % 10 === 0) {
            saveStoredSettings(
              {
                language: state.language,
                appearance: state.appearance,
                audioSettings: state.audioSettings,
                playbackSettings: state.playbackSettings,
                listeningStats: updatedStats,
                librarySettings: state.librarySettings,
              },
              { syncFile: shouldSyncStatsNow(state.librarySettings, nextSecs) }
            );
          }
        }
      }

      // Check for track completion in playback queue:
      // If current track was playing and finishes (current_time reaches duration or telemetry switches from Playing to Stopped)
      const currentTrack = state.currentTrack && state.currentTrack.filepath === telemetry.filepath
        ? {
            ...state.currentTrack,
            sample_rate: telemetry.sample_rate || state.currentTrack.sample_rate,
            bit_depth: telemetry.bits_per_sample || state.currentTrack.bit_depth,
            bitrate_kbps: telemetry.bitrate || state.currentTrack.bitrate_kbps,
          }
        : state.currentTrack;

      const wasPlaying = state.isPlaying && state.telemetry.state === "Playing";
      const duration = telemetry.duration || currentTrack?.duration_seconds || 0;
      const endTolerance = Math.min(0.5, duration > 0 ? duration * 0.05 : 0.5);
      const isNearEnd = duration > 0 && telemetry.current_time >= duration - endTolerance;
      const justStoppedAfterPlay = wasPlaying && telemetry.state === "Stopped";

      if ((isNearEnd || justStoppedAfterPlay) && state.queue.length > 0 && currentTrack) {
        // Trigger handleTrackEnded asynchronously to prevent state re-entrance
        setTimeout(() => {
          const currentState = get();
          if (currentState.currentTrack?.filepath === currentTrack.filepath) {
            void currentState.handleTrackEnded(currentTrack.filepath);
          }
        }, 100);
      }

      return {
        telemetry,
        isPlaying: telemetry.state === "Playing",
        volume: telemetry.volume,
        bitPerfectMode: telemetry.is_bit_perfect,
        selectedDevice: telemetry.output_device,
        listeningStats: updatedStats,
        currentTrack,
      };
    });
  },

  updateScanStatus: (status: ScanStatus) => {
    set({ scanStatus: status });
    if (!status.is_scanning) {
      get().fetchLibraryTracks(get().librarySearchQuery);
    }
  },

  handleTrackEnded: async (_filepath: string) => {
    const { repeat, currentTrack, play, nextTrack } = get();
    if (repeat === "one" && currentTrack) {
      await play(currentTrack);
    } else {
      await nextTrack();
    }
  },

  initListeners: async () => {
    await get().loadListeningStatsFromSyncFile();

    // Ensure the sync file gets a final flush on exit, regardless of the chosen frequency
    const appWindow = getCurrentWindow();
    const unlistenClose = await appWindow.onCloseRequested(async (event) => {
      const state = get();
      if (state.librarySettings.statsBackupMode === "sync" && state.librarySettings.statsSyncFilePath) {
        event.preventDefault();
        if (statsCloseInProgress) return;
        statsCloseInProgress = true;
        try {
          await Promise.race([
            flushListeningStatsToFile(state.librarySettings, state.listeningStats),
            new Promise<void>((resolve) => window.setTimeout(resolve, 1200)),
          ]);
        } finally {
          await appWindow.destroy().catch(() => {});
        }
      }
    });

    const unlistenTele = await api.onAudioTelemetry((tele: AudioTelemetry) => {
      get().updateTelemetry(tele);
    });

    const unlistenScan = await api.onScanProgress((status: ScanStatus) => {
      get().updateScanStatus(status);
    });

    const unlistenEnded = await api.onTrackEnded((filepath: string) => {
      get().handleTrackEnded(filepath);
    });

    radioAudioService.setSpectrumCallback((spectrum, left, right) => {
      const state = get();
      if (state.activeRadioStation && state.isRadioPlaying) {
        set((s) => ({
          telemetry: {
            ...s.telemetry,
            spectrum,
            spectrum_left: left,
            spectrum_right: right,
          },
        }));
      }
    });

    const unlistenRadio = radioAudioService.subscribe((radioState) => {
      const current = get();
      if (!current.activeRadioStation) return;
      const isPlaying = radioState.status === "playing";

      let updatedStats = current.listeningStats;
      if (isPlaying && radioState.elapsedSeconds > current.telemetry.current_time) {
        const delta = Math.min(2, Math.max(0, radioState.elapsedSeconds - current.telemetry.current_time));
        if (delta > 0) {
          const nextSecs = current.listeningStats.totalSecondsListened + delta;
          updatedStats = { ...current.listeningStats, totalSecondsListened: nextSecs };
          if (Math.floor(nextSecs) % 10 === 0) {
            saveStoredSettings(
              {
                language: current.language,
                appearance: current.appearance,
                audioSettings: current.audioSettings,
                playbackSettings: current.playbackSettings,
                listeningStats: updatedStats,
                librarySettings: current.librarySettings,
              },
              { syncFile: shouldSyncStatsNow(current.librarySettings, nextSecs) }
            );
          }
        }
      }

      set((s) => ({
        isRadioPlaying: isPlaying,
        isPlaying: isPlaying,
        listeningStats: updatedStats,
        telemetry: {
          ...s.telemetry,
          state: isPlaying ? "Playing" : radioState.status === "paused" ? "Paused" : "Stopped",
          current_time: radioState.elapsedSeconds,
          duration: 0,
        },
      }));
    });

    await get().refreshAudioDevices();
    await get().fetchLibraryTracks();

    let systemMusicFolder = "/home/Música";
    try {
      systemMusicFolder = `${(await homeDir()).replace(/\/+$/, "")}/Música`;
    } catch {
      // Use the Linux default if the Tauri path API is unavailable.
    }

    const currentSettings = get().librarySettings;
    const settingsPatch: Partial<LibrarySettings> = {};
    if (!currentSettings.musicFolder || currentSettings.musicFolder === "/home") {
      settingsPatch.musicFolder = systemMusicFolder;
    }
    if (!currentSettings.explorerHomeFolder) {
      settingsPatch.explorerHomeFolder = systemMusicFolder;
    }
    if (Object.keys(settingsPatch).length > 0) {
      get().setLibrarySettings(settingsPatch);
    }

    let lastExplorerPath: string | null = null;
    try {
      lastExplorerPath = localStorage.getItem(EXPLORER_PATH_STORAGE_KEY);
    } catch {
      // Ignore read failure
    }
    const librarySettings = get().librarySettings;
    await get().browseDirectory(lastExplorerPath || librarySettings.explorerHomeFolder || systemMusicFolder);
    if (librarySettings.autoScanOnStartup && librarySettings.musicFolder) {
      void get().startDirectoryScan(librarySettings.musicFolder);
    }

    return () => {
      unlistenTele();
      unlistenScan();
      unlistenEnded();
      unlistenRadio();
      unlistenClose();
    };
  },
}));

export const useAppStore = useMusicStore;
