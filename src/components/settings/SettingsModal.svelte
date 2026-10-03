<script lang="ts">
  import { onMount } from 'svelte';
  import {
    useMusicStore,
    AUDIO_ENGINES,
    isSettingsOpenStore,
    languageStore,
    appearanceStore,
    audioSettingsStore,
    playbackSettingsStore,
    listeningStatsStore,
    librarySettingsStore,
    scanStatusStore,
    libraryTracksStore,
    triggerFullBackupSync,
    getDefaultFullBackupPath,
    getDefaultStatsBackupPath,
  } from '../../store/index.ts';
  import {
    RotateCcw,
    Trash2,
    Sliders,
    Sparkles,
    Palette,
    Activity,
    Music,
    Info,
    Check,
    Plus,
    Volume2,
    ShieldCheck,
    ChevronLeft,
    ChevronRight,
    Download,
    Upload,
    FolderOpen,
    Database,
    RefreshCw,
    Shuffle,
    SkipBack,
    Play,
    SkipForward,
    Repeat,
    Radio,
    Link,
    Unlink,
  } from '@lucide/svelte';
  import { open, save } from '@tauri-apps/plugin-dialog';
  import { readTextFile, writeTextFile, getRuntimeDepsStatus, installOrUpdateRuntimeDeps, type RuntimeDepsStatus } from '../../services/api.ts';
  import packageInfo from '../../../package.json';
  import { FIRST_RUN_PROFILE } from '../layout/defaultLayout.ts';
  import { SPECTRUM_STYLES, CAVA_STYLES } from '../../types/spectrum.ts';
  import { t } from '../../i18n/translations.ts';
  import { TRANSPORT_STYLES, type TransportStyle } from '../../lib/transportStyles.ts';
  import {
    ACCENT_OPTIONS,
    THEME_OPTIONS,
    getSavedAccent,
    getSavedTheme,
    getCustomAccentColor,
    setCustomAccentColor,
    getCustomThemeColor,
    setCustomThemeColor,
    getSavedBgOpacity,
    getSavedNeonGlow,
    getSavedNeonGlowIntensity,
    getSavedTintedBorders,
    getSavedTintedBordersRatio,
    getSavedCornerRadius,
    getSavedAmbientGlow,
    getSavedMinimalScrollbars,
    getSavedMarqueeSpeed,
    saveMarqueeSpeed,
    getSavedMarqueeDelay,
    saveMarqueeDelay,
    applyTheme,
    type AccentColor,
    type BackgroundTheme,
    type CornerRadius,
  } from '../../lib/theme.ts';

  type SettingsTab = 'general' | 'appearance' | 'cava' | 'playback' | 'audio' | 'library' | 'about';
  type VisualizerSettingsPanel = 'cava' | 'spectrum';

  const SEEK_BAR_STYLES = [
    { id: 'spectrum', label: 'Espectro de la canción' },
    { id: 'classic', label: 'Clásico' },
    { id: 'hybrid', label: 'Forma de onda' },
    { id: 'aurora', label: 'Aurora' },
    { id: 'segments', label: 'Segmentos' },
    { id: 'ribbon', label: 'Ribbon' },
  ] as const;

  let isSettingsOpen = $derived($isSettingsOpenStore);
  let language = $derived($languageStore);
  let appearance = $derived($appearanceStore);
  let audioSettings = $derived($audioSettingsStore);
  let playbackSettings = $derived($playbackSettingsStore);
  let listeningStats = $derived($listeningStatsStore);
  let librarySettings = $derived($librarySettingsStore);
  let scanStatus = $derived($scanStatusStore);
  let libraryTracks = $derived($libraryTracksStore);

  let activeTab = $state<SettingsTab>('general');
  let activeVisualizerPanel = $state<VisualizerSettingsPanel>('cava');
  let tabsRef = $state<HTMLDivElement | null>(null);
  let savedMessage = $state<string | null>(null);
  let runtimeDeps = $state<RuntimeDepsStatus | null>(null);
  let runtimeDepsBusy = $state(false);
  let runtimeDepsLog = $state<string | null>(null);

  let accent = $state<AccentColor>(getSavedAccent());
  let bgTheme = $state<BackgroundTheme>(getSavedTheme());
  let customAccentHex = $state<string>(getCustomAccentColor());
  let customThemeHex = $state<string>(getCustomThemeColor());
  let bgOpacity = $state<number>(getSavedBgOpacity());
  let neonGlow = $state<boolean>(getSavedNeonGlow());
  let neonIntensity = $state<number>(getSavedNeonGlowIntensity());
  let tintedBorders = $state<boolean>(getSavedTintedBorders());
  let tintedBordersRatio = $state<number>(getSavedTintedBordersRatio());
  let cornerRadius = $state<CornerRadius>(getSavedCornerRadius());
  let ambientGlow = $state<boolean>(getSavedAmbientGlow());
  let minimalScrollbars = $state<boolean>(getSavedMinimalScrollbars());
  let marqueeSpeed = $state<number>(getSavedMarqueeSpeed());
  let marqueeDelay = $state<number>(getSavedMarqueeDelay());
  let defaultFullBackupPath = $state<string>('');
  let defaultStatsBackupPath = $state<string>('');

  onMount(() => {
    marqueeSpeed = appearance.marqueeSpeed || getSavedMarqueeSpeed();
    marqueeDelay = appearance.marqueeDelay || getSavedMarqueeDelay();
    getDefaultFullBackupPath().then((p) => { defaultFullBackupPath = p; });
    getDefaultStatsBackupPath().then((p) => { defaultStatsBackupPath = p; });
  });

  $effect(() => {
    if (appearance.accentPreset && appearance.accentPreset !== accent) {
      accent = appearance.accentPreset as AccentColor;
    }
    if (appearance.accentPreset === 'custom' && appearance.accentColor && appearance.accentColor !== customAccentHex) {
      customAccentHex = appearance.accentColor;
    }
  });

  $effect(() => {
    if (!isSettingsOpen || activeTab !== 'general') return;
    let cancelled = false;
    getRuntimeDepsStatus()
      .then((status) => {
        if (!cancelled) runtimeDeps = status;
      })
      .catch((error) => {
        if (!cancelled) runtimeDepsLog = String(error);
      });
    return () => {
      cancelled = true;
    };
  });

  let totalTracks = $derived(isSettingsOpen ? libraryTracks.length : 0);
  let totalLibrarySeconds = $derived(isSettingsOpen ? libraryTracks.reduce((acc, trk) => acc + (trk.duration_seconds || 0), 0) : 0);
  let totalLibraryHours = $derived((totalLibrarySeconds / 3600).toFixed(1));
  let listenedHours = $derived(isSettingsOpen ? Math.floor(listeningStats.totalSecondsListened / 3600) : 0);
  let listenedMinutes = $derived(isSettingsOpen ? Math.floor((listeningStats.totalSecondsListened % 3600) / 60) : 0);

  const triggerApplyTheme = (
    newAccent = accent,
    newBg = bgTheme,
    newCustomAccent = customAccentHex,
    newCustomTheme = customThemeHex,
    newOpacity = bgOpacity,
    newGlow = neonGlow,
    newIntensity = neonIntensity,
    newTinted = tintedBorders,
    newTintedRatio = tintedBordersRatio,
    newRadius = cornerRadius,
    newAmbient = ambientGlow,
    newScrollbars = minimalScrollbars,
  ) => {
    applyTheme(
      newAccent,
      newBg,
      newCustomAccent,
      newCustomTheme,
      newOpacity,
      newGlow,
      newIntensity,
      newTinted,
      newTintedRatio,
      newRadius,
      newAmbient,
      newScrollbars,
    );
  };

  const handleSelectAccent = (newAccent: AccentColor) => {
    accent = newAccent;
    const opt = ACCENT_OPTIONS.find((a) => a.id === newAccent);
    if (newAccent === 'custom') {
      const hex = customAccentHex || appearance.accentColor || '#06b6d4';
      triggerApplyTheme('custom', bgTheme, hex);
      useMusicStore.getState().setAppearance({ accentColor: hex, accentPreset: 'custom' });
    } else if (opt) {
      triggerApplyTheme(newAccent, bgTheme);
      if (!opt.isRgb) {
        useMusicStore.getState().setAppearance({ accentColor: opt.color, accentPreset: newAccent });
      } else {
        useMusicStore.getState().setAppearance({ accentPreset: 'rgb' });
      }
    }
  };

  const handleCustomAccentChange = (hex: string) => {
    customAccentHex = hex;
    setCustomAccentColor(hex);
    accent = 'custom';
    triggerApplyTheme('custom', bgTheme, hex);
    useMusicStore.getState().setAppearance({ accentColor: hex, accentPreset: 'custom' });
  };

  const handleSelectTheme = (newTheme: BackgroundTheme) => {
    bgTheme = newTheme;
    triggerApplyTheme(accent, newTheme);
    const opt = THEME_OPTIONS.find((t) => t.id === newTheme);
    if (opt && !opt.isCustom) {
      useMusicStore.getState().setAppearance({ bgColor: opt.charcoal, bgPreset: newTheme });
    }
  };

  const handleCustomThemeChange = (hex: string) => {
    customThemeHex = hex;
    setCustomThemeColor(hex);
    bgTheme = 'custom';
    triggerApplyTheme(accent, 'custom', customAccentHex, hex);
    useMusicStore.getState().setAppearance({ bgColor: hex, bgPreset: 'custom' });
  };

  const handleResetSettings = () => {
    if (window.confirm('¿Restablecer todos los ajustes, disposiciones de widgets, espectros y tamaño de ventana a los parámetros por defecto de fábrica?')) {
      const EXCLUDED_KEYS = ['musicx_listening_stats', 'musicx_stats_backup'];

      const preservedStats: Record<string, string | null> = {};
      for (const k of EXCLUDED_KEYS) {
        preservedStats[k] = localStorage.getItem(k);
      }

      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && !EXCLUDED_KEYS.includes(key)) {
          localStorage.removeItem(key);
        }
      }

      for (const [k, v] of Object.entries(preservedStats)) {
        if (v !== null) localStorage.setItem(k, v);
      }

      useMusicStore.getState().resetSettings();

      localStorage.setItem('musicx_playerbar_height_ratio', String(FIRST_RUN_PROFILE.playerBarHeightRatio));
      localStorage.setItem('normal_window_size_v1', JSON.stringify(FIRST_RUN_PROFILE.windowSize));
      localStorage.setItem('musicx_normal_window_size', JSON.stringify(FIRST_RUN_PROFILE.windowSize));
      localStorage.setItem('musicx_last_window_state', JSON.stringify({ ...FIRST_RUN_PROFILE.windowSize, isMiniPlayer: false }));
      localStorage.setItem('musicx_last_window_mode', 'full');
      localStorage.setItem('musicx_layout_config_v16', JSON.stringify(FIRST_RUN_PROFILE.layout));

      applyTheme('blue', 'dark_gray');

      savedMessage = 'Ajustes restablecidos a valores por defecto de fábrica. Recargando...';
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  const handleClearCache = () => {
    if (window.confirm('¿Borrar caché temporal, carátulas almacenadas y residuos?')) {
      useMusicStore.getState().clearCacheAndResidues();
      savedMessage = 'Caché y residuos eliminados.';
      setTimeout(() => { savedMessage = null; }, 2500);
    }
  };

  const chooseLibraryFolder = async (setting: 'musicFolder' | 'explorerHomeFolder' | 'radioRecordingFolder') => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: librarySettings[setting] || undefined,
        title:
          setting === 'musicFolder'
            ? 'Carpeta principal de la biblioteca'
            : setting === 'explorerHomeFolder'
            ? 'Inicio del explorador'
            : 'Carpeta de grabaciones de radio',
      });
      if (typeof selected === 'string') {
        useMusicStore.getState().setLibrarySettings({ [setting]: selected });
      }
    } catch {
      savedMessage = 'No se pudo abrir el selector de carpetas.';
    }
  };

  const exportFullAppBackup = async () => {
    try {
      const defaultName = `musicx-full-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const selected = await save({
        title: 'Guardar copia de seguridad completa',
        defaultPath: defaultName,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (typeof selected !== 'string' || !selected.trim()) return;

      const currentStoreState = {
        language,
        appearance,
        audioSettings,
        playbackSettings,
        listeningStats,
        librarySettings,
      };
      localStorage.setItem('musicx_settings_v5', JSON.stringify(currentStoreState));

      if (appearance.accentPreset) localStorage.setItem('musicx_accent_preset', appearance.accentPreset);
      if (appearance.accentColor) localStorage.setItem('musicx_accent_color', appearance.accentColor);
      if (appearance.bgPreset) localStorage.setItem('musicx_theme_preset', appearance.bgPreset);
      if (appearance.bgColor) localStorage.setItem('musicx_theme_color', appearance.bgColor);
      if (bgOpacity !== undefined) localStorage.setItem('musicx_bg_opacity', String(bgOpacity));
      if (appearance.neonGlow !== undefined) localStorage.setItem('musicx_neon_glow', String(appearance.neonGlow));
      if (appearance.neonIntensity !== undefined) localStorage.setItem('musicx_neon_glow_intensity', String(appearance.neonIntensity));
      if (appearance.borderRadius !== undefined) localStorage.setItem('musicx_corner_radius', String(appearance.borderRadius));

      const data: Record<string, string> = {};
      const EXCLUDED_KEYS = ['musicx_listening_stats', 'musicx_stats_backup'];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !EXCLUDED_KEYS.includes(key)) {
          const value = localStorage.getItem(key);
          if (value !== null) data[key] = value;
        }
      }

      const backup = {
        format: 'musicx-full-backup-v1',
        exportedAt: new Date().toISOString(),
        data,
      };

      await writeTextFile(selected.trim(), JSON.stringify(backup, null, 2));
      savedMessage = 'Copia de seguridad guardada con éxito.';
      setTimeout(() => { savedMessage = null; }, 2500);
    } catch {
      savedMessage = 'No se pudo guardar la copia de seguridad.';
      setTimeout(() => { savedMessage = null; }, 2500);
    }
  };

  const restoreFullBackupData = async (backupData: Record<string, unknown>, userPath?: string) => {
    const EXCLUDED_KEYS = ['musicx_listening_stats', 'musicx_stats_backup'];

    const preservedStats: Record<string, string | null> = {};
    for (const k of EXCLUDED_KEYS) {
      preservedStats[k] = localStorage.getItem(k);
    }

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && !EXCLUDED_KEYS.includes(key)) {
        localStorage.removeItem(key);
      }
    }

    for (const [key, value] of Object.entries<unknown>(backupData)) {
      if (typeof value === 'string' && !EXCLUDED_KEYS.includes(key)) {
        localStorage.setItem(key, value);
      }
    }

    for (const [k, v] of Object.entries(preservedStats)) {
      if (v !== null) localStorage.setItem(k, v);
    }

    if (userPath !== undefined) {
      if (userPath.trim()) {
        localStorage.setItem('musicx_full_backup_path', userPath.trim());
      } else {
        localStorage.removeItem('musicx_full_backup_path');
      }
    }

    const settingsRaw = localStorage.getItem('musicx_settings_v5');
    if (settingsRaw) {
      try {
        const parsed = JSON.parse(settingsRaw);
        if (userPath !== undefined) {
          parsed.librarySettings = { ...(parsed.librarySettings || {}), fullBackupFilePath: userPath.trim() };
          localStorage.setItem('musicx_settings_v5', JSON.stringify(parsed));
        }
        if (parsed.appearance) {
          const app = parsed.appearance;
          if (app.accentPreset) localStorage.setItem('musicx_accent_preset', app.accentPreset);
          if (app.accentColor) localStorage.setItem('musicx_accent_color', app.accentColor);
          if (app.bgPreset) localStorage.setItem('musicx_theme_preset', app.bgPreset);
          if (app.bgColor) localStorage.setItem('musicx_theme_color', app.bgColor);
          if (app.bgOpacity !== undefined) localStorage.setItem('musicx_bg_opacity', String(app.bgOpacity));
          if (app.neonGlow !== undefined) localStorage.setItem('musicx_neon_glow', String(app.neonGlow));
          if (app.neonIntensity !== undefined) localStorage.setItem('musicx_neon_glow_intensity', String(app.neonIntensity));
          if (app.borderRadius !== undefined) localStorage.setItem('musicx_corner_radius', String(app.borderRadius));

          applyTheme(
            app.accentPreset || 'cyan',
            app.bgPreset || 'dark_slate',
            app.accentColor || '#06b6d4',
            app.bgColor || '#0f172a',
            app.bgOpacity ?? 0.85,
            app.neonGlow ?? true,
            app.neonIntensity ?? 0.5,
          );
        }
      } catch {
        // Ignore
      }
    }
  };

  const importFullAppBackup = async () => {
    try {
      const selected = await open({
        multiple: false,
        title: 'Restaurar copia de seguridad completa',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (typeof selected !== 'string' || !selected.trim()) return;

      const content = await readTextFile(selected.trim());
      if (!content) throw new Error('El archivo está vacío');

      const backup = JSON.parse(content);
      if (backup?.format !== 'musicx-full-backup-v1' || typeof backup?.data !== 'object' || backup.data === null) {
        throw new Error('Formato de copia de seguridad no válido');
      }

      await restoreFullBackupData(backup.data);
      savedMessage = 'Copia de seguridad restaurada con éxito. Recargando app...';
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch {
      savedMessage = 'No se pudo restaurar la copia de seguridad.';
      setTimeout(() => { savedMessage = null; }, 3000);
    }
  };

  const linkFullBackupFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        title: 'Vincular archivo de copia de seguridad completa',
        defaultPath: librarySettings.fullBackupFilePath || defaultFullBackupPath || undefined,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (typeof selected !== 'string' || !selected.trim()) return;

      const path = selected.trim();
      const content = await readTextFile(path).catch(() => null);
      if (content) {
        try {
          const backup = JSON.parse(content);
          if (backup?.format === 'musicx-full-backup-v1' && backup.data && typeof backup.data === 'object') {
            useMusicStore.getState().setLibrarySettings({ fullBackupFilePath: path });
            await restoreFullBackupData(backup.data, path);
            savedMessage = 'Archivo vinculado y configuración restaurada con éxito.';
            setTimeout(() => { window.location.reload(); }, 1000);
            return;
          }
        } catch {
          // File not JSON or not full backup; link and save current state into it
        }
      }
      useMusicStore.getState().setLibrarySettings({ fullBackupFilePath: path });
      triggerFullBackupSync(true);
      savedMessage = 'Archivo vinculado como copia de seguridad activa.';
      setTimeout(() => { savedMessage = null; }, 2500);
    } catch {
      savedMessage = 'No se pudo vincular el archivo.';
      setTimeout(() => { savedMessage = null; }, 2500);
    }
  };

  const unlinkFullBackupFile = () => {
    useMusicStore.getState().setLibrarySettings({ fullBackupFilePath: '' });
    triggerFullBackupSync(true);
    savedMessage = 'Ruta personalizada eliminada. Se usará la ruta por defecto.';
    setTimeout(() => { savedMessage = null; }, 2500);
  };

  const exportStatsBackup = async () => {
    try {
      const defaultName = `musicx-listening-stats-${new Date().toISOString().slice(0, 10)}.json`;
      const selected = await save({
        title: 'Guardar copia de estadísticas',
        defaultPath: defaultName,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (typeof selected !== 'string' || !selected.trim()) return;

      await writeTextFile(selected.trim(), JSON.stringify({
        format: 'musicx-listening-stats-v1',
        exportedAt: new Date().toISOString(),
        listeningStats,
      }, null, 2));
      savedMessage = 'Copia de estadísticas guardada con éxito.';
      setTimeout(() => { savedMessage = null; }, 2500);
    } catch {
      savedMessage = 'No se pudo guardar la copia de estadísticas.';
      setTimeout(() => { savedMessage = null; }, 2500);
    }
  };

  const importStatsBackup = async () => {
    try {
      const selected = await open({
        multiple: false,
        title: 'Restaurar copia de estadísticas',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (typeof selected !== 'string' || !selected.trim()) return;

      const raw = await readTextFile(selected.trim());
      if (!raw) throw new Error('El archivo está vacío.');
      const backup = JSON.parse(raw);
      const fileStats = backup?.listeningStats;
      if (!fileStats || !Number.isFinite(fileStats.totalSecondsListened)) {
        throw new Error('El archivo no contiene estadísticas válidas.');
      }
      useMusicStore.getState().setListeningStats({
        totalSecondsListened: Math.max(0, fileStats.totalSecondsListened),
        totalTracksPlayed: Math.max(0, Number(fileStats.totalTracksPlayed) || 0),
        totalSessions: Math.max(0, Number(fileStats.totalSessions) || 0),
      });
      savedMessage = 'Copia de estadísticas restaurada con éxito.';
      setTimeout(() => { savedMessage = null; }, 2500);
    } catch {
      savedMessage = 'No se pudo restaurar la copia de estadísticas.';
      setTimeout(() => { savedMessage = null; }, 2500);
    }
  };

  const linkStatsBackupFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        title: 'Vincular archivo de estadísticas',
        defaultPath: librarySettings.statsSyncFilePath || defaultStatsBackupPath || undefined,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (typeof selected !== 'string' || !selected.trim()) return;

      const path = selected.trim();
      useMusicStore.getState().setLibrarySettings({ statsSyncFilePath: path, statsBackupMode: 'sync' }, { syncFile: false });
      await useMusicStore.getState().loadListeningStatsFromSyncFile();
      savedMessage = 'Archivo vinculado para estadísticas.';
      setTimeout(() => { savedMessage = null; }, 2500);
    } catch {
      savedMessage = 'No se pudo vincular el archivo de estadísticas.';
      setTimeout(() => { savedMessage = null; }, 2500);
    }
  };

  const unlinkStatsBackupFile = async () => {
    useMusicStore.getState().setLibrarySettings({ statsSyncFilePath: '' }, { syncFile: false });
    await useMusicStore.getState().loadListeningStatsFromSyncFile();
    savedMessage = 'Ruta personalizada eliminada. Se usará la ruta por defecto.';
    setTimeout(() => { savedMessage = null; }, 2500);
  };
</script>

{#if isSettingsOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-fade-in select-none">
    <div
      class="w-[840px] max-w-[95vw] h-[640px] max-h-[92vh] flex flex-col rounded-2xl border border-slate-700/70 bg-slate-950/95 text-slate-100 shadow-2xl overflow-hidden transition-all duration-200"
      style={neonGlow ? `box-shadow: 0 0 35px var(--app-accent, #06b6d4)33;` : undefined}
    >
      <div class="flex items-center justify-between px-6 py-3.5 border-b border-slate-800 bg-slate-900/70 shrink-0">
        <div class="flex items-center gap-3">
          <div
            class="w-3 h-3 rounded-full"
            style="background-color: {appearance.accentColor || '#06b6d4'}; box-shadow: {neonGlow ? `0 0 8px ${appearance.accentColor || '#06b6d4'}` : 'none'};"
          ></div>
          <h2 class="text-base font-bold tracking-wide font-mono" style="color: {appearance.accentColor || '#06b6d4'};">
            {t('settings', language)} &bull; Musicx
          </h2>
        </div>

        <button
          onclick={() => useMusicStore.getState().setSettingsOpen(false)}
          class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
        >
          ✕
        </button>
      </div>

      <div class="flex items-center border-b border-slate-800 bg-slate-900/50 shrink-0">
        <button
          onclick={() => tabsRef?.scrollBy({ left: -220, behavior: 'smooth' })}
          class="h-11 w-8 shrink-0 flex items-center justify-center text-slate-400 hover:text-white border-r border-slate-800"
          title="Pestañas anteriores"
          aria-label="Desplazar pestañas a la izquierda"
        >
          <ChevronLeft size={16} />
        </button>
        <div bind:this={tabsRef} class="flex min-w-0 flex-1 px-2 gap-2 overflow-x-auto settings-tabs-scroll">
          {#each [
            { id: 'general', label: t('general', language), icon: Sliders },
            { id: 'appearance', label: t('appearance', language), icon: Palette },
            { id: 'cava', label: language === 'ca' ? 'Visualització en viu' : language === 'en' ? 'Live Visualizer' : 'Visualización en vivo', icon: Activity },
            { id: 'playback', label: t('playback', language), icon: Music },
            { id: 'audio', label: t('audio', language) + ' & DSP', icon: Volume2 },
            { id: 'library', label: t('library', language), icon: FolderOpen },
            { id: 'about', label: language === 'ca' ? 'Quant a' : language === 'en' ? 'About' : 'Acerca de', icon: Info },
          ] as tab (tab.id)}
            {@const Icon = tab.icon}
            {@const isActive = activeTab === tab.id}
            <button
              onclick={() => { activeTab = tab.id as SettingsTab; }}
              class="py-3 px-3.5 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer {isActive ? 'border-cyan-400 text-cyan-300 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200'}"
              style={isActive ? `border-color: ${appearance.accentColor}; color: ${appearance.accentColor};` : undefined}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          {/each}
        </div>
        <button
          onclick={() => tabsRef?.scrollBy({ left: 220, behavior: 'smooth' })}
          class="h-11 w-8 shrink-0 flex items-center justify-center text-slate-400 hover:text-white border-l border-slate-800"
          title="Pestañas siguientes"
          aria-label="Desplazar pestañas a la derecha"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div class="p-6 overflow-y-auto flex-1 space-y-6">
        {#if savedMessage}
          <div class="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/50 text-xs text-emerald-300 flex items-center gap-2">
            <ShieldCheck size={16} />
            <span>{savedMessage}</span>
          </div>
        {/if}

        {#if activeTab === 'general'}
          <div class="space-y-6">
            <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <div class="text-xs font-bold uppercase tracking-wider text-slate-300">
                {t('appLanguage', language)}
              </div>
              <div class="grid grid-cols-3 gap-3">
                {#each [
                  { id: 'es' as const, name: 'Español' },
                  { id: 'ca' as const, name: 'Català' },
                  { id: 'en' as const, name: 'English' },
                ] as l (l.id)}
                  <button
                    onclick={() => useMusicStore.getState().setLanguage(l.id)}
                    class="py-2 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer text-center {language === l.id ? 'border-cyan-500 bg-cyan-950/30 text-cyan-300 font-bold' : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:text-slate-200'}"
                    style={language === l.id ? `border-color: ${appearance.accentColor}; color: ${appearance.accentColor};` : undefined}
                  >
                    {l.name}
                  </button>
                {/each}
              </div>
            </div>

            <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <div>
                <div class="text-xs font-bold text-slate-200 uppercase tracking-wider">Copia de Seguridad Completa</div>
                <div class="text-[11px] text-slate-400">Guarda y sincroniza toda la configuración (apariencia, ajustes, widgets, tamaños y disposiciones) en un único archivo.</div>
              </div>

              <div class="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                <FolderOpen size={14} class="shrink-0 text-slate-400" />
                <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-200" title={librarySettings.fullBackupFilePath || defaultFullBackupPath}>
                  {librarySettings.fullBackupFilePath || defaultFullBackupPath || "musicx-full-backup-default.json"}
                </span>
                {#if librarySettings.fullBackupFilePath}
                  <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-950/70 text-cyan-300 border border-cyan-700/50 shrink-0">
                    Ruta vinculada
                  </span>
                {:else}
                  <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                    Por defecto (fallback)
                  </span>
                {/if}
              </div>

              <div class="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onclick={exportFullAppBackup}
                  class="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 cursor-pointer"
                >
                  <Download size={13} style="color: {appearance.accentColor || '#06b6d4'};" />
                  <span>Guardar copia</span>
                </button>
                <button
                  type="button"
                  onclick={importFullAppBackup}
                  class="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 cursor-pointer"
                >
                  <Upload size={13} style="color: {appearance.accentColor || '#06b6d4'};" />
                  <span>Restaurar copia</span>
                </button>
                <button
                  type="button"
                  onclick={linkFullBackupFile}
                  class="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 cursor-pointer"
                >
                  <Link size={13} style="color: {appearance.accentColor || '#06b6d4'};" />
                  <span>Vincular archivo</span>
                </button>
                {#if librarySettings.fullBackupFilePath}
                  <button
                    type="button"
                    onclick={unlinkFullBackupFile}
                    class="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-950/30 hover:border-rose-800/50 transition cursor-pointer"
                  >
                    <Unlink size={13} />
                    <span>Quitar ruta</span>
                  </button>
                {/if}
              </div>

              <div class="space-y-2 pt-2 border-t border-slate-800/60">
                <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Frecuencia de guardado</div>
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onclick={() => useMusicStore.getState().setLibrarySettings({ fullBackupFrequency: 'onChange' })}
                    class="px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer {librarySettings.fullBackupFrequency === 'onChange' ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-300' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}"
                    style={librarySettings.fullBackupFrequency === 'onChange' && appearance.accentColor ? `border-color: ${appearance.accentColor}; color: ${appearance.accentColor};` : undefined}
                  >
                    A cada cambio
                  </button>
                  <button
                    type="button"
                    onclick={() => useMusicStore.getState().setLibrarySettings({ fullBackupFrequency: 'intervalMinutes' })}
                    class="px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer {librarySettings.fullBackupFrequency === 'intervalMinutes' ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-300' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}"
                    style={librarySettings.fullBackupFrequency === 'intervalMinutes' && appearance.accentColor ? `border-color: ${appearance.accentColor}; color: ${appearance.accentColor};` : undefined}
                  >
                    Cada X minutos
                  </button>
                  <button
                    type="button"
                    onclick={() => useMusicStore.getState().setLibrarySettings({ fullBackupFrequency: 'onClose' })}
                    class="px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer {librarySettings.fullBackupFrequency === 'onClose' ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-300' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}"
                    style={librarySettings.fullBackupFrequency === 'onClose' && appearance.accentColor ? `border-color: ${appearance.accentColor}; color: ${appearance.accentColor};` : undefined}
                  >
                    Al cerrar la app
                  </button>
                </div>
                {#if librarySettings.fullBackupFrequency === 'intervalMinutes'}
                  <div class="flex items-center gap-2 pt-1">
                    <span class="text-xs text-slate-300">Minutos entre cada guardado:</span>
                    <input
                      type="number"
                      min="1"
                      value={librarySettings.fullBackupIntervalMinutes || 5}
                      oninput={(e) => useMusicStore.getState().setLibrarySettings({ fullBackupIntervalMinutes: Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1) })}
                      class="w-20 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-slate-100"
                    />
                  </div>
                {/if}
              </div>
            </div>

            <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <div>
                <div class="text-xs font-bold text-slate-200 uppercase tracking-wider">Dependencias de Stream y descargas</div>
                <div class="text-[11px] text-slate-400 mt-1">
                  {runtimeDeps
                    ? `${runtimeDeps.osLabel}${runtimeDeps.distroId ? ` · ${runtimeDeps.packageFamily}/${runtimeDeps.packageManager}` : ""}`
                    : "Detectando sistema..."}
                </div>
                {#if runtimeDeps?.hint}
                  <p class="text-[11px] leading-5 text-slate-400 mt-2">{runtimeDeps.hint}</p>
                {/if}
              </div>
              <div class="grid gap-2">
                {#each (runtimeDeps
                  ? [runtimeDeps.ytdlp, runtimeDeps.ffmpeg]
                  : [
                      { name: "yt-dlp", installed: false, version: "Comprobando...", path: "", source: "" },
                      { name: "ffmpeg", installed: false, version: "Comprobando...", path: "", source: "" },
                    ]
                ) as tool (tool.name)}
                  <div class="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-xs font-semibold text-slate-200">{tool.name}</span>
                      <span class="text-[10px] uppercase tracking-wider {tool.installed ? 'text-emerald-400' : 'text-rose-300'}">
                        {tool.installed ? tool.source : "falta"}
                      </span>
                    </div>
                    <div class="mt-1 font-mono text-[11px] text-slate-400 truncate" title={tool.path}>
                      {tool.version}{tool.path ? ` · ${tool.path}` : ""}
                    </div>
                  </div>
                {/each}
              </div>
              {#if runtimeDeps}
                <div class="text-[11px] text-slate-500">
                  Node.js para yt-dlp: {runtimeDeps.nodeAvailable ? "detectado" : "no detectado (opcional)"}
                </div>
              {/if}
              {#if runtimeDepsLog}
                <pre class="whitespace-pre-wrap rounded-lg border border-slate-800 bg-black/40 p-2 font-mono text-[11px] text-slate-300">{runtimeDepsLog}</pre>
              {/if}
              <button
                type="button"
                disabled={runtimeDepsBusy}
                onclick={async () => {
                  runtimeDepsBusy = true;
                  runtimeDepsLog = "Descargando e instalando. ffmpeg puede tardar porque el paquete es grande...";
                  try {
                    const result = await installOrUpdateRuntimeDeps();
                    runtimeDepsLog = result;
                    runtimeDeps = await getRuntimeDepsStatus();
                  } catch (error) {
                    runtimeDepsLog = String(error);
                  } finally {
                    runtimeDepsBusy = false;
                  }
                }}
                class="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
              >
                <Download size={14} style="color: {appearance.accentColor || '#06b6d4'};" />
                <span>{runtimeDepsBusy ? "Instalando..." : "Descargar / actualizar yt-dlp y ffmpeg"}</span>
              </button>
            </div>

            <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <div class="text-xs font-bold uppercase tracking-wider text-slate-300">
                Mantenimiento y Restablecimiento
              </div>
              <div class="flex flex-col gap-2.5">
                <button
                  onclick={handleClearCache}
                  class="w-full py-2.5 px-3 rounded-xl border border-rose-900/60 bg-rose-950/30 hover:bg-rose-900/40 text-xs font-semibold text-rose-300 flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Trash2 size={14} />
                  <span>Borrar Caché y Residuos</span>
                </button>

                <button
                  onclick={handleResetSettings}
                  class="w-full py-2.5 px-3 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-semibold text-slate-300 flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <RotateCcw size={14} />
                  <span>Restablecer Ajustes de Fábrica</span>
                </button>
              </div>
            </div>
          </div>
        {/if}

        {#if activeTab === 'appearance'}
          <div class="space-y-6">
            <div class="flex flex-col gap-2.5">
              <div class="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Sparkles size={14} style="color: {appearance.accentColor};" />
                Color de Acento Predominante
              </div>
              <p class="text-xs text-slate-400">
                Selecciona el color para botones, deslizadores, carátulas y telemetría:
              </p>

              <div class="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2">
                {#each ACCENT_OPTIONS as opt (opt.id)}
                  {@const isSelected = accent === opt.id}
                  {@const swatchBackground = opt.isRgb ? opt.color : opt.isCustom ? customAccentHex : opt.color}

                  <button
                    onclick={() => handleSelectAccent(opt.id)}
                    title={opt.label}
                    class="h-14 rounded-xl border flex flex-col items-center justify-center transition cursor-pointer {isSelected ? 'bg-slate-800 border-cyan-400 ring-2 ring-cyan-400/40' : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'}"
                  >
                    <div
                      class="w-7 h-7 rounded-full shadow flex items-center justify-center shrink-0"
                      style="background: {swatchBackground};"
                    >
                      {#if opt.isCustom}
                        {#if isSelected}
                          <Check size={14} class="text-white stroke-[3]" />
                        {:else}
                          <Plus size={15} class="text-white stroke-[2.5]" />
                        {/if}
                      {:else if isSelected}
                        <Check size={14} class="text-white stroke-[3]" />
                      {/if}
                    </div>
                  </button>
                {/each}
              </div>

              <div class="flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 mt-1">
                <span class="text-xs text-slate-300 font-medium">Color de acento personalizado:</span>
                <div
                  class="relative w-7 h-7 rounded-lg border border-slate-700 flex items-center justify-center overflow-hidden cursor-pointer"
                  style="background-color: {customAccentHex};"
                >
                  <Plus size={14} class="text-white stroke-[2.5] pointer-events-none" />
                  <input
                    type="color"
                    value={customAccentHex}
                    oninput={(e) => handleCustomAccentChange((e.target as HTMLInputElement).value)}
                    class="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                </div>
                <input
                  type="text"
                  value={customAccentHex}
                  oninput={(e) => handleCustomAccentChange((e.target as HTMLInputElement).value)}
                  placeholder="#8b5cf6"
                  class="w-24 px-2 py-1 text-xs font-mono uppercase bg-slate-950 rounded-lg border border-slate-800 text-slate-200 focus:outline-none"
                />
              </div>
            </div>

            <div class="flex flex-col gap-2.5 pt-4 border-t border-slate-800">
              <div class="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Palette size={14} style="color: {appearance.accentColor};" />
                Fondo y Contraste
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {#each THEME_OPTIONS as opt (opt.id)}
                  {@const isSelected = bgTheme === opt.id}
                  {@const swatchBg = opt.isCustom
                    ? customThemeHex
                    : opt.id === 'gray_gradient'
                    ? 'linear-gradient(135deg, #161719 0%, #4a4d52 100%)'
                    : opt.charcoal}

                  <button
                    onclick={() => handleSelectTheme(opt.id)}
                    class="flex items-center justify-between p-2 rounded-xl border transition cursor-pointer {isSelected ? 'bg-slate-800 border-cyan-400 ring-2 ring-cyan-400/30' : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'}"
                  >
                    <div class="flex items-center gap-2 min-w-0">
                      <div
                        class="w-5 h-5 rounded-md border border-white/20 flex items-center justify-center shrink-0"
                        style="background: {swatchBg};"
                      ></div>
                      <span class="text-xs font-semibold text-slate-200 truncate">
                        {opt.label}
                      </span>
                    </div>
                    {#if isSelected}<Check size={12} class="text-cyan-400 stroke-[3]" />{/if}
                  </button>
                {/each}
              </div>

              <div class="flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 mt-1">
                <span class="text-xs text-slate-300 font-medium">Color de fondo personalizado:</span>
                <div
                  class="relative w-7 h-7 rounded-lg border border-slate-700 flex items-center justify-center overflow-hidden cursor-pointer"
                  style="background-color: {customThemeHex};"
                >
                  <Plus size={14} class="text-white stroke-[2.5] pointer-events-none" />
                  <input
                    type="color"
                    value={customThemeHex}
                    oninput={(e) => handleCustomThemeChange((e.target as HTMLInputElement).value)}
                    class="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                </div>
                <input
                  type="text"
                  value={customThemeHex}
                  oninput={(e) => handleCustomThemeChange((e.target as HTMLInputElement).value)}
                  placeholder="#0f172a"
                  class="w-24 px-2 py-1 text-xs font-mono uppercase bg-slate-950 rounded-lg border border-slate-800 text-slate-200 focus:outline-none"
                />
              </div>
            </div>

            <div class="flex flex-col gap-2 pt-4 border-t border-slate-800">
              <div class="flex items-center justify-between text-xs">
                <span class="font-bold text-slate-300">Transparencia y Glassmorphism</span>
                <span class="font-mono text-cyan-400 font-bold">{Math.round(bgOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.10"
                max="1.0"
                step="0.05"
                value={bgOpacity}
                oninput={(e) => {
                  const val = parseFloat((e.target as HTMLInputElement).value);
                  bgOpacity = val;
                  triggerApplyTheme(accent, bgTheme, customAccentHex, customThemeHex, val);
                }}
                class="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div class="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-xs font-bold text-slate-200">Resplandor Neón Activo</div>
                  <div class="text-[11px] text-slate-400">Iluminación externa en bordes y botones de control</div>
                </div>
                <button
                  type="button"
                  aria-label="Alternar Resplandor Neón Activo"
                  onclick={() => {
                    const next = !neonGlow;
                    neonGlow = next;
                    triggerApplyTheme(accent, bgTheme, customAccentHex, customThemeHex, bgOpacity, next);
                  }}
                  class="w-10 h-5 rounded-full transition-colors relative cursor-pointer {neonGlow ? 'bg-cyan-500' : 'bg-slate-800'}"
                >
                  <div class="w-4 h-4 rounded-full bg-white transition-transform absolute top-0.5 {neonGlow ? 'left-5' : 'left-0.5'}"></div>
                </button>
              </div>
              {#if neonGlow}
                <div class="flex items-center gap-3 pt-2 border-t border-slate-800">
                  <span class="text-xs text-slate-400">Intensidad:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={neonIntensity}
                    oninput={(e) => {
                      const val = parseFloat((e.target as HTMLInputElement).value);
                      neonIntensity = val;
                      triggerApplyTheme(accent, bgTheme, customAccentHex, customThemeHex, bgOpacity, neonGlow, val);
                    }}
                    class="flex-1 accent-cyan-400 cursor-pointer"
                  />
                  <span class="text-xs font-mono text-cyan-400">{Math.round(neonIntensity * 100)}%</span>
                </div>
              {/if}
            </div>

            <div class="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-xs font-bold text-slate-200">Bordes Tintados con Acento</div>
                  <div class="text-[11px] text-slate-400">Marcos de ventanas ligeramente pigmentados con el color de acento</div>
                </div>
                <button
                  type="button"
                  aria-label="Alternar Bordes Tintados con Acento"
                  onclick={() => {
                    const next = !tintedBorders;
                    tintedBorders = next;
                    triggerApplyTheme(accent, bgTheme, customAccentHex, customThemeHex, bgOpacity, neonGlow, neonIntensity, next);
                  }}
                  class="w-10 h-5 rounded-full transition-colors relative cursor-pointer {tintedBorders ? 'bg-cyan-500' : 'bg-slate-800'}"
                >
                  <div class="w-4 h-4 rounded-full bg-white transition-transform absolute top-0.5 {tintedBorders ? 'left-5' : 'left-0.5'}"></div>
                </button>
              </div>
              {#if tintedBorders}
                <div class="flex items-center gap-3 pt-2 border-t border-slate-800">
                  <span class="text-xs text-slate-400">Tinte:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={tintedBordersRatio}
                    oninput={(e) => {
                      const val = parseFloat((e.target as HTMLInputElement).value);
                      tintedBordersRatio = val;
                      triggerApplyTheme(accent, bgTheme, customAccentHex, customThemeHex, bgOpacity, neonGlow, neonIntensity, tintedBorders, val);
                    }}
                    class="flex-1 accent-cyan-400 cursor-pointer"
                  />
                  <span class="text-xs font-mono text-cyan-400">{Math.round(tintedBordersRatio * 100)}%</span>
                </div>
              {/if}
            </div>

            <div class="flex flex-col gap-2 pt-2">
              <div class="text-xs font-bold uppercase tracking-wider text-slate-300">
                Curvatura de Esquinas
              </div>
              <div class="grid grid-cols-4 gap-2.5">
                {#each [
                  { id: 'square' as CornerRadius, label: 'Recto', px: '0px', r: 0 },
                  { id: 'industrial' as CornerRadius, label: 'DAW', px: '4px', r: 4 },
                  { id: 'modern' as CornerRadius, label: 'Moderno', px: '8px', r: 8 },
                  { id: 'smooth' as CornerRadius, label: 'Suave', px: '14px', r: 14 },
                ] as r (r.id)}
                  <button
                    onclick={() => {
                      cornerRadius = r.id;
                      triggerApplyTheme(accent, bgTheme, customAccentHex, customThemeHex, bgOpacity, neonGlow, neonIntensity, tintedBorders, tintedBordersRatio, r.id);
                    }}
                    class="h-14 p-2 border text-xs font-semibold transition-all cursor-pointer text-center flex flex-col items-center justify-center gap-0.5 {cornerRadius === r.id ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300' : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'}"
                    style="border-radius: {r.r}px; {cornerRadius === r.id ? `border-color: ${appearance.accentColor}; color: ${appearance.accentColor}; box-shadow: 0 0 14px ${appearance.accentColor}33;` : ''}"
                  >
                    <span class="font-bold">{r.label}</span>
                    <span class="text-[10px] font-mono opacity-70">({r.px})</span>
                  </button>
                {/each}
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 pt-2">
              <div class="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-200">Resplandor Ambiental de Estudio</span>
                <input
                  type="checkbox"
                  checked={ambientGlow}
                  onchange={(e) => {
                    const next = (e.target as HTMLInputElement).checked;
                    ambientGlow = next;
                    triggerApplyTheme(accent, bgTheme, customAccentHex, customThemeHex, bgOpacity, neonGlow, neonIntensity, tintedBorders, tintedBordersRatio, cornerRadius, next);
                  }}
                  class="accent-cyan-400 cursor-pointer"
                />
              </div>
              <div class="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-200">Barras de Desplazamiento Mínimas</span>
                <input
                  type="checkbox"
                  checked={minimalScrollbars}
                  onchange={(e) => {
                    const next = (e.target as HTMLInputElement).checked;
                    minimalScrollbars = next;
                    triggerApplyTheme(accent, bgTheme, customAccentHex, customThemeHex, bgOpacity, neonGlow, neonIntensity, tintedBorders, tintedBordersRatio, cornerRadius, ambientGlow, next);
                  }}
                  class="accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <label class="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3 text-xs font-semibold text-slate-200">
                Pulso BPM en el botón Play
                <input
                  type="checkbox"
                  checked={appearance.playButtonBpmPulseEnabled}
                  onchange={(e) => useMusicStore.getState().setAppearance({ playButtonBpmPulseEnabled: (e.target as HTMLInputElement).checked })}
                  class="accent-cyan-400 shrink-0"
                />
              </label>
              <label class="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3 text-xs font-semibold text-slate-200">
                Luz BPM en In Play
                <input
                  type="checkbox"
                  checked={appearance.inPlayBpmPulseEnabled}
                  onchange={(e) => useMusicStore.getState().setAppearance({ inPlayBpmPulseEnabled: (e.target as HTMLInputElement).checked })}
                  class="accent-cyan-400 shrink-0"
                />
              </label>
            </div>

            <!-- Velocidad y tiempo de espera de la marquesina -->
            <div class="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 pt-2">
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="text-xs font-bold text-slate-200">Velocidad de la letra al pasar el ratón</div>
                    <div class="text-[11px] text-slate-400">
                      Duración del recorrido en pistas con títulos largos (menor tiempo = más rápido)
                    </div>
                  </div>
                  <span class="text-xs font-mono font-bold text-cyan-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                    {marqueeSpeed <= 6 ? 'Rápido' : marqueeSpeed <= 12 ? 'Normal' : marqueeSpeed <= 18 ? 'Lento' : 'Muy lento'} ({marqueeSpeed}s)
                  </span>
                </div>

                <div class="flex items-center gap-3">
                  <span class="text-[11px] text-slate-400 shrink-0">Rápido (4s)</span>
                  <input
                    type="range"
                    min="4"
                    max="24"
                    step="1"
                    value={marqueeSpeed}
                    oninput={(e) => {
                      const val = parseInt((e.target as HTMLInputElement).value, 10);
                      marqueeSpeed = val;
                      saveMarqueeSpeed(val);
                      useMusicStore.getState().setAppearance({ marqueeSpeed: val });
                    }}
                    class="flex-1 accent-cyan-400 cursor-pointer"
                  />
                  <span class="text-[11px] text-slate-400 shrink-0">Lento (24s)</span>
                </div>
              </div>

              <div class="space-y-2 pt-2 border-t border-slate-800/80">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="text-xs font-bold text-slate-200">Tiempo de espera encima antes de moverse</div>
                    <div class="text-[11px] text-slate-400">
                      Segundos con el ratón encima de la pista para iniciar el desplazamiento
                    </div>
                  </div>
                  <span class="text-xs font-mono font-bold text-cyan-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                    {marqueeDelay.toFixed(1)}s
                  </span>
                </div>

                <div class="flex items-center gap-3">
                  <span class="text-[11px] text-slate-400 shrink-0">Rápido (0.5s)</span>
                  <input
                    type="range"
                    min="0.5"
                    max="5.0"
                    step="0.25"
                    value={marqueeDelay}
                    oninput={(e) => {
                      const val = parseFloat((e.target as HTMLInputElement).value);
                      marqueeDelay = val;
                      saveMarqueeDelay(val);
                      useMusicStore.getState().setAppearance({ marqueeDelay: val });
                    }}
                    class="flex-1 accent-cyan-400 cursor-pointer"
                  />
                  <span class="text-[11px] text-slate-400 shrink-0">Pausado (5s)</span>
                </div>
              </div>

              <div class="space-y-1 pt-1">
                <span class="text-[10px] uppercase font-mono text-slate-400">Demostración en vivo</span>
                <div class="p-2 rounded bg-slate-950/70 border border-slate-850 overflow-hidden whitespace-nowrap">
                  <span
                    class="inline-block text-xs font-mono text-slate-300"
                    style="animation: marquee-delayed {marqueeSpeed}s linear infinite; animation-delay: {marqueeDelay}s;"
                  >
                    Demostración de velocidad de desplazamiento de pista musical • Artista Hi-Fi • Formato FLAC 24-bit 96kHz
                  </span>
                </div>
              </div>
            </div>
          </div>
        {/if}

        {#if activeTab === 'cava'}
          <div class="space-y-6">
            <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <Activity size={15} class="text-cyan-400" />
                {activeVisualizerPanel === 'cava' ? 'Motor CAVA' : 'Espectro en vivo'}
              </h3>
              <p class="text-xs text-slate-400">
                {activeVisualizerPanel === 'cava'
                  ? 'Visualizador interno (FFT en Rust y canvas). No usa el binario cava de Linux ni PulseAudio, así que funciona igual en Windows.'
                  : 'Ajustes independientes para los estilos y la fluidez del espectro.'}
              </p>
            </div>

            <div role="tablist" aria-label="Visualizadores" class="grid grid-cols-2 rounded-lg border border-slate-800 bg-slate-950 p-1">
              {#each [
                { id: 'cava' as const, label: 'Motor CAVA', icon: Activity },
                { id: 'spectrum' as const, label: 'Espectro en vivo', icon: Music },
              ] as panel (panel.id)}
                {@const Icon = panel.icon}
                {@const isSelected = activeVisualizerPanel === panel.id}
                <button
                  role="tab"
                  aria-selected={isSelected}
                  onclick={() => { activeVisualizerPanel = panel.id; }}
                  class="flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition {isSelected ? 'bg-cyan-950/60 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}"
                >
                  <Icon size={14} />
                  {panel.label}
                </button>
              {/each}
            </div>

            {#if activeVisualizerPanel === 'cava'}
              <div class="space-y-6">
                <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                  <div class="text-xs font-bold text-slate-300">Estilo visual CAVA</div>
                  <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {#each CAVA_STYLES as style (style.id)}
                      <button
                        onclick={() => useMusicStore.getState().setAppearance({ cavaStyle: style.id })}
                        class="rounded-lg border px-3 py-2 text-xs font-semibold transition {appearance.cavaStyle === style.id ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300' : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'}"
                      >
                        {style.label}
                      </button>
                    {/each}
                  </div>
                </div>

                <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                  <div class="text-xs font-bold text-slate-300">Frecuencia del motor</div>
                  <div class="grid grid-cols-4 gap-2">
                    {#each [30, 60, 120, 144] as fps (fps)}
                      <button
                        onclick={() => useMusicStore.getState().setAppearance({ cavaFps: fps as 30 | 60 | 120 | 144 })}
                        class="p-2 rounded-xl border text-xs font-mono font-bold transition cursor-pointer text-center {appearance.cavaFps === fps ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300' : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'}"
                      >
                        {fps} FPS
                      </button>
                    {/each}
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
                    <div class="flex justify-between text-xs">
                      <span class="font-bold text-slate-300">Número de Barras FFT</span>
                      <span class="font-mono text-cyan-400 font-bold">{appearance.cavaBars}</span>
                    </div>
                    <input
                      type="range"
                      min="32"
                      max="128"
                      step="16"
                      value={appearance.cavaBars}
                      oninput={(e) => useMusicStore.getState().setAppearance({ cavaBars: parseInt((e.target as HTMLInputElement).value) })}
                      class="w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>

                  <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
                    <div class="flex justify-between text-xs">
                      <span class="font-bold text-slate-300">Sensibilidad de Ganancia</span>
                      <span class="font-mono text-cyan-400 font-bold">{appearance.cavaSensitivity}%</span>
                    </div>
                    <input
                      type="range"
                      min="25"
                      max="200"
                      step="5"
                      value={appearance.cavaSensitivity}
                      oninput={(e) => useMusicStore.getState().setAppearance({ cavaSensitivity: parseInt((e.target as HTMLInputElement).value) })}
                      class="w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
                    <div class="flex justify-between text-xs">
                      <span class="font-bold text-slate-300">Suavizado de caída</span>
                      <span class="font-mono text-cyan-400">{appearance.cavaSmoothing}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="95"
                      step="5"
                      value={appearance.cavaSmoothing}
                      oninput={(e) => useMusicStore.getState().setAppearance({ cavaSmoothing: parseInt((e.target as HTMLInputElement).value) })}
                      class="w-full accent-cyan-400"
                    />
                  </div>
                </div>

                <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                  <div class="text-xs font-bold text-slate-300">Paleta de CAVA</div>
                  <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {#each [
                      { id: 'aurora', label: 'Aurora', colors: ['#4ade80', '#22d3ee', '#a78bfa'] },
                      { id: 'fire', label: 'Fuego', colors: ['#ffd166', '#f94144', '#7209b7'] },
                      { id: 'ocean', label: 'Océano', colors: ['#80ffdb', '#00b4d8', '#3a0ca3'] },
                      { id: 'sunset', label: 'Atardecer', colors: ['#f9c74f', '#f3722c', '#f72585'] },
                      { id: 'forest', label: 'Bosque', colors: ['#d9ed92', '#52b788', '#1b4332'] },
                      { id: 'candy', label: 'Neón', colors: ['#ff70a6', '#c77dff', '#72ddf7'] },
                      { id: 'ice', label: 'Hielo', colors: ['#e0fbfc', '#98c1d9', '#3d5a80'] },
                      { id: 'accent', label: 'Acento', colors: [appearance.accentColor, appearance.accentColor, '#ffffff'] },
                      { id: 'mono', label: 'Monocromo', colors: ['#64748b', '#cbd5e1', '#ffffff'] },
                      { id: 'custom', label: 'Personalizada', colors: appearance.cavaCustomPalette },
                    ] as palette (palette.id)}
                      <button
                        onclick={() => useMusicStore.getState().setAppearance({ cavaPalette: palette.id as typeof appearance.cavaPalette })}
                        class="min-h-14 rounded-lg border p-2 text-left text-[10px] font-semibold transition {appearance.cavaPalette === palette.id ? 'border-cyan-400 text-white' : 'border-slate-800 text-slate-400 hover:border-slate-600'}"
                        title={palette.label}
                      >
                        <span class="mb-1.5 flex h-3 overflow-hidden rounded-sm">
                          {#each palette.colors as color, index (`${palette.id}-${index}`)}
                            <span class="flex-1" style="background-color: {color};"></span>
                          {/each}
                        </span>
                        {palette.label}
                      </button>
                    {/each}
                  </div>
                  {#if appearance.cavaPalette === 'custom'}
                    <div class="grid grid-cols-3 gap-3 border-t border-slate-800 pt-3">
                      {#each (['Inicio', 'Centro', 'Final'] as const) as label, index}
                        <label class="flex items-center gap-2 text-[10px] text-slate-400">
                          <input
                            type="color"
                            value={appearance.cavaCustomPalette[index]}
                            oninput={(e) => {
                              const colors = [...appearance.cavaCustomPalette] as [string, string, string];
                              colors[index] = (e.target as HTMLInputElement).value;
                              useMusicStore.getState().setAppearance({ cavaCustomPalette: colors });
                            }}
                            class="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
                          />
                          {label}
                        </label>
                      {/each}
                    </div>
                  {/if}
                </div>

                <div class="grid grid-cols-2 gap-3">
                  {#each [
                    { key: 'cavaPeakHold' as const, label: 'Retener picos' },
                    { key: 'cavaMirrored' as const, label: 'Onda simétrica' },
                  ] as option (option.key)}
                    <label class="p-3 rounded-xl bg-slate-900/50 border border-slate-800 flex items-center justify-between text-xs text-slate-200">
                      {option.label}
                      <input
                        type="checkbox"
                        checked={appearance[option.key]}
                        onchange={(e) => useMusicStore.getState().setAppearance({ [option.key]: (e.target as HTMLInputElement).checked })}
                        class="accent-cyan-400"
                      />
                    </label>
                  {/each}
                </div>

                <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
                  <div class="text-xs font-bold text-slate-300">Física de Caída / Gravedad</div>
                  <div class="grid grid-cols-3 gap-2">
                    {#each [
                      { id: 'monstercat', label: 'Monstercat (Fluido)' },
                      { id: 'studio', label: 'Estudio Lineal' },
                      { id: 'instant', label: 'Respuesta Instantánea' },
                    ] as m (m.id)}
                      <button
                        onclick={() => useMusicStore.getState().setAppearance({ cavaGravity: m.id as 'monstercat' | 'studio' | 'instant' })}
                        class="p-2 rounded-xl border text-xs font-semibold transition cursor-pointer text-center {appearance.cavaGravity === m.id ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300' : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'}"
                      >
                        {m.label}
                      </button>
                    {/each}
                  </div>
                </div>

                <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-center justify-between">
                  <div>
                    <div class="text-xs font-bold text-slate-200">Fallback Anti-pérdida Espectral Offline</div>
                    <div class="text-[11px] text-slate-400">Mantiene el buffer local para restaurar la física FFT en caso de saturación o desconexión</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={appearance.cavaOfflineFallback}
                    onchange={(e) => useMusicStore.getState().setAppearance({ cavaOfflineFallback: (e.target as HTMLInputElement).checked })}
                    class="accent-cyan-400 w-4 h-4 cursor-pointer"
                  />
                </div>
              </div>
            {:else}
              <div class="space-y-6">
                <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
                  <h3 class="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                    <Music size={15} class="text-cyan-400" />
                    Espectro en vivo
                  </h3>
                  <p class="text-xs text-slate-400">Selecciona el formato y la fluidez del visualizador de espectro, independientes del motor CAVA.</p>
                </div>

                <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
                  <div class="flex items-center justify-between gap-3 text-xs">
                    <label for="spectrum-sensitivity" class="font-bold text-slate-300">Intensidad del espectro</label>
                    <span class="font-mono font-bold text-cyan-400">{Math.min(125, Math.round(appearance.spectrumSensitivity / 8))}%</span>
                  </div>
                  <input
                    id="spectrum-sensitivity"
                    type="range"
                    min="0"
                    max="125"
                    step="1"
                    value={Math.min(125, appearance.spectrumSensitivity / 8)}
                    oninput={(e) => useMusicStore.getState().setAppearance({ spectrumSensitivity: Number((e.target as HTMLInputElement).value) * 8 })}
                    class="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                  <div class="text-xs font-bold text-slate-300">Estilo del espectro</div>
                  <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {#each SPECTRUM_STYLES as style (style.id)}
                      <button
                        onclick={() => useMusicStore.getState().setAppearance({ spectrumStyle: style.id })}
                        class="p-2 rounded-lg border text-[11px] font-semibold {appearance.spectrumStyle === style.id ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300' : 'border-slate-800 bg-slate-900/60 text-slate-400'}"
                      >
                        {style.name}
                      </button>
                    {/each}
                  </div>
                </div>

                <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                  <div class="text-xs font-bold text-slate-300">Fluidez del espectro</div>
                  <div class="grid grid-cols-4 gap-2">
                    {#each [30, 60, 120, 144] as fps (fps)}
                      <button
                        onclick={() => useMusicStore.getState().setAppearance({ spectrumFps: fps as 30 | 60 | 120 | 144 })}
                        class="p-2 rounded-xl border text-xs font-mono font-bold transition cursor-pointer text-center {appearance.spectrumFps === fps ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300' : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'}"
                      >
                        {fps} FPS
                      </button>
                    {/each}
                  </div>
                </div>
              </div>
            {/if}
          </div>
        {/if}

        {#if activeTab === 'playback'}
          <div class="space-y-6">
            <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <div class="text-xs font-bold uppercase tracking-wider text-slate-300">
                Estilo de Barra de Reproducción
              </div>
              <div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {#each SEEK_BAR_STYLES as style (style.id)}
                  <button
                    onclick={() => useMusicStore.getState().setPlaybackSettings({ playerBarStyle: style.id })}
                    class="flex min-h-[108px] flex-col justify-between rounded-xl border p-2.5 text-xs font-semibold transition cursor-pointer text-center {playbackSettings.playerBarStyle === style.id ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300' : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'}"
                  >
                    <span>{style.label}</span>
                    <span class="mt-2 flex h-7 w-full items-center overflow-hidden rounded border border-slate-700 bg-slate-950 px-1.5">
                      {#if style.id === 'spectrum'}
                        {#each [25, 44, 66, 35, 82, 54, 30, 70, 42, 22, 64, 48, 75, 33, 58, 27] as h, index}
                          <span class="mx-px flex-1 rounded-sm" style="height: {h}%; background: {index < 9 ? 'var(--app-accent, #22d3ee)' : '#475569'};"></span>
                        {/each}
                      {:else if style.id === 'classic'}
                        <span class="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                          <span class="block h-full w-2/3 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></span>
                        </span>
                      {:else if style.id === 'hybrid'}
                        <svg viewBox="0 0 160 28" preserveAspectRatio="none" class="h-full w-full">
                          <path d="M0 15 Q10 4 20 14 T40 15 T60 7 T80 17 T100 13 T120 6 T140 16 T160 12" fill="none" stroke="#64748b" stroke-width="2" />
                          <path d="M0 15 Q10 4 20 14 T40 15 T60 7 T80 17 T100 13 T120 6 T140 16 T160 12" fill="none" stroke="#22d3ee" stroke-width="2" stroke-dasharray="105 160" />
                        </svg>
                      {:else if style.id === 'aurora'}
                        <span class="relative h-full w-full">
                          <span class="absolute inset-0 opacity-40" style="background: linear-gradient(90deg,#06b6d4,#818cf8,#f472b6);"></span>
                          <svg viewBox="0 0 160 28" preserveAspectRatio="none" class="absolute inset-0 h-full w-full">
                            <path d="M0 14 Q15 4 30 14 T60 14 T90 8 T120 14 T160 10" fill="none" stroke="white" stroke-width="2" />
                          </svg>
                          <span class="absolute inset-y-0 left-2/3 w-px bg-white shadow-[0_0_8px_2px_white]"></span>
                        </span>
                      {:else if style.id === 'segments'}
                        {#each Array.from({ length: 22 }) as _, index}
                          <span class="mx-px flex-1 rounded-[1px]" style="height: {25 + ((index * 37) % 75)}%; background: {index < 14 ? '#34d399' : '#334155'};"></span>
                        {/each}
                      {:else if style.id === 'ribbon'}
                        <span class="relative h-full w-full overflow-hidden" style="background: repeating-linear-gradient(135deg,#22d3ee22 0px,#22d3ee22 3px,transparent 3px,transparent 7px);">
                          <span class="absolute inset-y-0 left-0 w-3/5" style="background: repeating-linear-gradient(135deg,#22d3ee 0px,#22d3ee 3px,#67e8f9 3px,#67e8f9 7px);"></span>
                          <span class="absolute inset-y-0 left-3/5 w-0.5 bg-white shadow-[0_0_8px_2px_white]"></span>
                        </span>
                      {/if}
                    </span>
                  </button>
                {/each}
              </div>
            </div>

            <label class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-center justify-between text-xs font-bold text-slate-200">
              Mostrar BPM durante la reproducción
              <input
                type="checkbox"
                checked={playbackSettings.showBpmInPlayer}
                onchange={(e) => useMusicStore.getState().setPlaybackSettings({ showBpmInPlayer: (e.target as HTMLInputElement).checked })}
                class="accent-cyan-400 shrink-0"
              />
            </label>

            <div class="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div>
                <div class="text-xs font-bold text-slate-200">Efecto al pulsar Play</div>
                <div class="text-[11px] text-slate-400">Animación del icono cuando cambias entre play y pausa</div>
              </div>
              <div class="grid grid-cols-3 gap-2">
                {#each ([
                  { id: "none", label: "Ninguno" },
                  { id: "pulse", label: "Pulso" },
                  { id: "pop", label: "Pop" },
                  { id: "spin", label: "Giro" },
                  { id: "bounce", label: "Rebote" },
                  { id: "flip", label: "Volteo" },
                ] as const) as effect (effect.id)}
                  <button
                    type="button"
                    onclick={() => useMusicStore.getState().setAppearance({ playButtonClickEffect: effect.id })}
                    class="rounded-lg border px-2 py-1.5 text-[11px] font-semibold {(appearance.playButtonClickEffect || 'pulse') === effect.id ? 'border-cyan-500 bg-cyan-950/40 text-cyan-300' : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200'}"
                  >
                    {effect.label}
                  </button>
                {/each}
              </div>
            </div>

            <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <div class="text-xs font-bold text-slate-300">Plantilla de botones de reproducción</div>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {#each (Object.entries(TRANSPORT_STYLES) as [TransportStyle, typeof TRANSPORT_STYLES[TransportStyle]][]) as [id, style] (id)}
                  <button
                    onclick={() => useMusicStore.getState().setPlaybackSettings({ transportStyle: id })}
                    class="flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border p-2 transition {playbackSettings.transportStyle === id ? 'border-cyan-400 bg-cyan-950/30 text-white' : 'border-slate-800 text-slate-400 hover:border-slate-600'}"
                  >
                    <span class="flex items-center gap-1 p-1 {style.preview}">
                      <Shuffle size={9} />
                      <SkipBack size={9} />
                      <span class="flex h-5 w-5 items-center justify-center bg-cyan-400 text-slate-950 {style.primary}"><Play size={9} fill="currentColor" /></span>
                      <SkipForward size={9} />
                      <Repeat size={9} />
                    </span>
                    <span class="text-[10px] font-semibold">{style.label}</span>
                  </button>
                {/each}
              </div>
            </div>

            <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-xs font-bold text-slate-200">Toque de carátula en barra de reproducción</div>
                  <div class="text-[11px] text-slate-400">Colorea todo el bloque inferior (seek, botones y volumen) con la portada actual</div>
                </div>
                <input
                  type="checkbox"
                  checked={playbackSettings.diffusePlayerBar}
                  onchange={(e) => useMusicStore.getState().setPlaybackSettings({ diffusePlayerBar: (e.target as HTMLInputElement).checked })}
                  class="accent-cyan-400 w-4 h-4 cursor-pointer"
                />
              </div>
              {#if playbackSettings.diffusePlayerBar}
                <div class="flex items-center gap-3 pt-2 border-t border-slate-800">
                  <span class="text-xs text-slate-400">Transparencia:</span>
                  <input
                    type="range"
                    min="5"
                    max="60"
                    step="5"
                    value={playbackSettings.diffusePlayerBarOpacity}
                    oninput={(e) => useMusicStore.getState().setPlaybackSettings({ diffusePlayerBarOpacity: parseInt((e.target as HTMLInputElement).value) })}
                    class="flex-1 accent-cyan-400 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <span class="text-xs font-mono text-cyan-400">{playbackSettings.diffusePlayerBarOpacity}%</span>
                </div>
              {/if}
            </div>

            <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-xs font-bold text-slate-200">Difuminado de Carátula en Fondo de Lista</div>
                  <div class="text-[11px] text-slate-400">Muestra la portada de la canción actual con desenfoque artístico en la biblioteca</div>
                </div>
                <input
                  type="checkbox"
                  checked={playbackSettings.diffuseAlbumArt}
                  onchange={(e) => useMusicStore.getState().setPlaybackSettings({ diffuseAlbumArt: (e.target as HTMLInputElement).checked })}
                  class="accent-cyan-400 w-4 h-4 cursor-pointer"
                />
              </div>
              {#if playbackSettings.diffuseAlbumArt}
                <div class="flex items-center gap-3 pt-2 border-t border-slate-800">
                  <span class="text-xs text-slate-400">Transparencia:</span>
                  <input
                    type="range"
                    min="5"
                    max="60"
                    step="5"
                    value={playbackSettings.diffuseAlbumArtOpacity}
                    oninput={(e) => useMusicStore.getState().setPlaybackSettings({ diffuseAlbumArtOpacity: parseInt((e.target as HTMLInputElement).value) })}
                    class="flex-1 accent-cyan-400 cursor-pointer"
                  />
                  <span class="text-xs font-mono text-cyan-400">{playbackSettings.diffuseAlbumArtOpacity}%</span>
                </div>
              {/if}
            </div>

            <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-center justify-between">
              <div>
                <div class="text-xs font-bold text-slate-200">Reproducir Automáticamente al Arrastrar Archivos</div>
                <div class="text-[11px] text-slate-400">Inicia de inmediato al soltar archivos de audio sobre la ventana</div>
              </div>
              <input
                type="checkbox"
                checked={playbackSettings.autoPlayOnDrop}
                onchange={(e) => useMusicStore.getState().setPlaybackSettings({ autoPlayOnDrop: (e.target as HTMLInputElement).checked })}
                class="accent-cyan-400 w-4 h-4 cursor-pointer"
              />
            </div>
          </div>
        {/if}

        {#if activeTab === 'audio'}
          {@const currentEngine = AUDIO_ENGINES.find((e) => e.id === audioSettings.resamplingQuality) || AUDIO_ENGINES[0]}
          <div class="space-y-6">
            <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <div class="flex items-center justify-between">
                <div class="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Motor de Decodificación y Remuestreo Hi-Fi
                </div>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded font-semibold transition-all duration-300" style={currentEngine.id === 'float32' ? 'background: #33415540; border: 1px solid #475569; color: #94a3b8;' : `background: ${currentEngine.color}20; border: 1px solid ${currentEngine.color}50; color: ${currentEngine.color}; box-shadow: 0 0 10px ${currentEngine.color}33;`}>
                  {currentEngine.name}
                </span>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {#each AUDIO_ENGINES as m (m.id)}
                  {@const isSelected = audioSettings.resamplingQuality === m.id}
                  <button
                    onclick={() => useMusicStore.getState().setAudioSettings({ resamplingQuality: m.id })}
                    class="p-2.5 rounded-xl border text-xs font-semibold transition-all duration-200 cursor-pointer text-center {isSelected ? 'bg-slate-900/95 shadow-lg' : 'border-slate-800/80 bg-slate-900/50 text-slate-400 hover:text-slate-100 hover:border-slate-700'}"
                    style={isSelected ? (m.id === 'float32' ? 'border-color: #64748b; color: #94a3b8;' : `border-color: ${m.color}; color: ${m.color}; box-shadow: 0 0 14px ${m.color}35;`) : undefined}
                  >
                    <div class="flex items-center justify-center gap-1.5 mb-1">
                      <span class="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold transition-colors" style={m.id === 'float32' ? 'background: #33415540; color: #94a3b8; border: 1px solid #475569;' : `background: ${m.color}25; color: ${m.color}; border: 1px solid ${m.color}50;`}>{m.badge}</span>
                      <span class="font-bold" style={isSelected ? (m.id === 'float32' ? 'color: #94a3b8;' : `color: ${m.color}; text-shadow: 0 0 8px ${m.color}55;`) : undefined}>{m.name.split(' ')[0]}</span>
                    </div>
                    <span class="text-[10px] opacity-80 font-normal block truncate" style={isSelected ? (m.id === 'float32' ? 'color: #94a3b8;' : `color: ${m.color}ee;`) : undefined}>{m.name}</span>
                  </button>
                {/each}
              </div>
              <div class="text-[11px] rounded-lg bg-slate-950/60 border border-slate-800/60 p-2.5 text-slate-400">
                {#if audioSettings.resamplingQuality === 'bit_perfect'}
                  <span class="font-semibold" style="color: #10f08e;">Bit-Perfect Activo (Máxima Pureza):</span> Salida hardware directa 1:1 sin remuestreo ni atenuación digital. El DAC recibe la frecuencia nativa exacta bit a bit.
                {:else if audioSettings.resamplingQuality === 'soxr'}
                  <span class="font-semibold" style="color: #2563eb;">Libsoxr Audiophile VHQ (256 Lóbulos):</span> Filtro Sinc VHQ de fase lineal de máxima fidelidad con corte empinado y atenuación de banda superior a 170 dB.
                {:else if audioSettings.resamplingQuality === 'r8brain'}
                  <span class="font-semibold" style="color: #8b5cf6;">r8brain Free SRC (Convolución FFT):</span> Remuestreo por convolución FFT de bloque en frecuencia, libre de ringing de fase y respuesta transitoria analógica.
                {:else if audioSettings.resamplingQuality === 'symphonia_192k'}
                  <span class="font-semibold" style="color: #f43f5e;">Symphonia Ultra 192k (Ultra Hi-Res):</span> Remuestreo ultra Hi-Res a 192 kHz con interpolador Sinc de alta precisión armónica integrado en Rust.
                {:else if audioSettings.resamplingQuality === 'rubato'}
                  <span class="font-semibold" style="color: #00e5ff;">Rubato Sinc Hi-Fi (128 Fases):</span> Interpolador Sinc bandlimited en pure Rust con ventana Blackman-Harris de alta precisión y relación señal/ruido SNR &gt; 160 dB.
                {:else if audioSettings.resamplingQuality === 'symphonia_96k'}
                  <span class="font-semibold" style="color: #a3e635;">Symphonia Studio 96k (Estudio):</span> Decodificación nativa de alta fidelidad mediante Symphonia en Rust con remuestreo de estudio a 96 kHz float.
                {:else if audioSettings.resamplingQuality === 'zita'}
                  <span class="font-semibold" style="color: #ffb700;">Zita Polyphase Resampler (Baja Latencia):</span> Banco de filtros polifase Hann² ultrarrápido y de latencia ultra baja, ideal para monitorización instantánea.
                {:else if audioSettings.resamplingQuality === 'speexdsp'}
                  <span class="font-semibold" style="color: #ff5722;">SpeexDSP Polyphase (Eficiencia):</span> Resampler polifásico estándar de alta eficiencia con ventana Hann de 32 fases optimizado para bajo consumo de CPU.
                {:else}
                  <span class="font-semibold text-slate-400">Float32 PipeWire (Compartido):</span> Enrutamiento compartido a través del servidor de audio PipeWire / PulseAudio en coma flotante de 32 bits con soporte multicanal y DSP.
                {/if}
              </div>
            </div>

            <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <div class="text-xs font-bold uppercase tracking-wider text-slate-300">
                Tamaño de Buffer y Latencia PCM
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {#each [
                  { id: 'ultra_low' as const, label: 'Ultra Baja', sub: '64 spls · 1.5ms' },
                  { id: 'very_low' as const, label: 'Muy Baja', sub: '128 spls · 2.9ms' },
                  { id: 'low' as const, label: 'Baja', sub: '256 spls · 5.8ms' },
                  { id: 'medium' as const, label: 'Media', sub: '512 spls · 11.6ms' },
                  { id: 'stable' as const, label: 'Estable', sub: '1024 spls · 23.2ms' },
                ] as b (b.id)}
                  <button
                    onclick={() => useMusicStore.getState().setAudioSettings({ bufferLatency: b.id, bufferVersion: 2 })}
                    class="p-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer text-center flex flex-col items-center justify-center gap-0.5 {audioSettings.bufferLatency === b.id ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300' : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'}"
                    style={audioSettings.bufferLatency === b.id ? `border-color: ${appearance.accentColor}; color: ${appearance.accentColor};` : undefined}
                  >
                    <span>{b.label}</span>
                    <span class="text-[10px] opacity-70 font-mono font-normal">{b.sub}</span>
                  </button>
                {/each}
              </div>
            </div>

            <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-center justify-between">
              <div>
                <div class="text-xs font-bold text-slate-200">Ganancia Extra de Volumen (+35% Boost)</div>
                <div class="text-[11px] text-slate-400">Permite subir el deslizador hasta 135% con indicador en rojo</div>
              </div>
              <input
                type="checkbox"
                checked={audioSettings.allowExtraVolumeBoost}
                onchange={(e) => useMusicStore.getState().setAudioSettings({ allowExtraVolumeBoost: (e.target as HTMLInputElement).checked })}
                class="accent-cyan-400 w-4 h-4 cursor-pointer"
              />
            </div>
          </div>
        {/if}

        {#if activeTab === 'library'}
          <div class="space-y-6">
            <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
              <div class="flex items-center justify-between gap-3 flex-wrap">
                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                  <FolderOpen size={15} class="text-cyan-400" />
                  Biblioteca y estadísticas
                </h3>
                <button
                  onclick={() => {
                    if (window.confirm('¿Reiniciar a cero todas las estadísticas de escucha?')) {
                      useMusicStore.getState().resetStats();
                      savedMessage = 'Estadísticas de escucha reiniciadas.';
                      setTimeout(() => { savedMessage = null; }, 2500);
                    }
                  }}
                  class="px-3 py-1.5 rounded-lg border border-rose-900/60 bg-rose-950/40 text-xs font-semibold text-rose-300 hover:bg-rose-900/50 transition cursor-pointer"
                >
                  Reiniciar Estadísticas
                </button>
              </div>
              <p class="text-xs text-slate-400">
                Métricas acumuladas de escucha y catálogo de pistas registradas en caché local.
              </p>
            </div>

            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div class="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col items-center justify-center text-center">
                <span class="text-[10px] text-slate-400 uppercase font-mono">Pistas en Colección</span>
                <span class="text-2xl font-mono font-bold text-white mt-1">{totalTracks}</span>
                <span class="text-[10px] text-slate-500 mt-0.5">{totalLibraryHours} h totales de audio</span>
              </div>

              <div class="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col items-center justify-center text-center">
                <span class="text-[10px] text-slate-400 uppercase font-mono">Tiempo Escuchando</span>
                <span class="text-2xl font-mono font-bold text-cyan-400 mt-1">
                  {listenedHours}h {listenedMinutes}m
                </span>
                <span class="text-[10px] text-slate-500 mt-0.5">Contador real en caché</span>
              </div>

              <div class="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col items-center justify-center text-center">
                <span class="text-[10px] text-slate-400 uppercase font-mono">Sesiones Activas</span>
                <span class="text-2xl font-mono font-bold text-slate-300 mt-1">
                  {listeningStats.totalSessions}
                </span>
                <span class="text-[10px] text-slate-500 mt-0.5">Inicios registrados</span>
              </div>
              <div class="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col items-center justify-center text-center">
                <span class="text-[10px] text-slate-400 uppercase font-mono">Canciones reproducidas</span>
                <span class="text-2xl font-mono font-bold text-slate-300 mt-1">{listeningStats.totalTracksPlayed}</span>
                <span class="text-[10px] text-slate-500 mt-0.5">Reproducciones iniciadas</span>
              </div>
            </div>

            <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <div>
                <div class="text-xs font-bold text-slate-200 uppercase tracking-wider">Backup del Tiempo Escuchado</div>
                <div class="text-[11px] text-slate-400">Historial de tiempo y canciones escuchadas. Se mantiene sincronizado automáticamente en un único archivo.</div>
              </div>

              <div class="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                <FolderOpen size={14} class="shrink-0 text-slate-400" />
                <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-200" title={librarySettings.statsSyncFilePath || defaultStatsBackupPath}>
                  {librarySettings.statsSyncFilePath || defaultStatsBackupPath || "musicx-listening-stats-default.json"}
                </span>
                {#if librarySettings.statsSyncFilePath}
                  <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-950/70 text-cyan-300 border border-cyan-700/50 shrink-0">
                    Ruta vinculada
                  </span>
                {:else}
                  <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                    Por defecto (fallback)
                  </span>
                {/if}
              </div>

              <div class="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onclick={exportStatsBackup}
                  class="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 cursor-pointer"
                >
                  <Download size={13} style="color: {appearance.accentColor || '#06b6d4'};" />
                  <span>Guardar copia</span>
                </button>
                <button
                  type="button"
                  onclick={importStatsBackup}
                  class="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 cursor-pointer"
                >
                  <Upload size={13} style="color: {appearance.accentColor || '#06b6d4'};" />
                  <span>Restaurar copia</span>
                </button>
                <button
                  type="button"
                  onclick={linkStatsBackupFile}
                  class="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 cursor-pointer"
                >
                  <Link size={13} style="color: {appearance.accentColor || '#06b6d4'};" />
                  <span>Vincular archivo</span>
                </button>
                {#if librarySettings.statsSyncFilePath}
                  <button
                    type="button"
                    onclick={unlinkStatsBackupFile}
                    class="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-950/30 hover:border-rose-800/50 transition cursor-pointer"
                  >
                    <Unlink size={13} />
                    <span>Quitar ruta</span>
                  </button>
                {/if}
              </div>

              <div class="space-y-2 pt-2 border-t border-slate-800/60">
                <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Frecuencia de guardado</div>
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onclick={() => useMusicStore.getState().setLibrarySettings({ statsSyncFrequency: 'onChange' })}
                    class="px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer {librarySettings.statsSyncFrequency === 'onChange' ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-300' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}"
                    style={librarySettings.statsSyncFrequency === 'onChange' && appearance.accentColor ? `border-color: ${appearance.accentColor}; color: ${appearance.accentColor};` : undefined}
                  >
                    A cada cambio
                  </button>
                  <button
                    type="button"
                    onclick={() => useMusicStore.getState().setLibrarySettings({ statsSyncFrequency: 'intervalMinutes' })}
                    class="px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer {librarySettings.statsSyncFrequency === 'intervalMinutes' ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-300' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}"
                    style={librarySettings.statsSyncFrequency === 'intervalMinutes' && appearance.accentColor ? `border-color: ${appearance.accentColor}; color: ${appearance.accentColor};` : undefined}
                  >
                    Cada X minutos
                  </button>
                  <button
                    type="button"
                    onclick={() => useMusicStore.getState().setLibrarySettings({ statsSyncFrequency: 'onClose' })}
                    class="px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer {librarySettings.statsSyncFrequency === 'onClose' ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-300' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}"
                    style={librarySettings.statsSyncFrequency === 'onClose' && appearance.accentColor ? `border-color: ${appearance.accentColor}; color: ${appearance.accentColor};` : undefined}
                  >
                    Al cerrar la app
                  </button>
                </div>
                {#if librarySettings.statsSyncFrequency === 'intervalMinutes'}
                  <div class="flex items-center gap-2 pt-1">
                    <span class="text-xs text-slate-300">Minutos entre cada guardado:</span>
                    <input
                      type="number"
                      min="1"
                      value={librarySettings.statsSyncIntervalMinutes || 5}
                      oninput={(e) => useMusicStore.getState().setLibrarySettings({ statsSyncIntervalMinutes: Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1) })}
                      class="w-20 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-slate-100"
                    />
                  </div>
                {/if}
              </div>
            </div>

            <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <div class="space-y-3">
                <div class="text-xs font-bold text-slate-300">Carpeta principal de la biblioteca</div>
                <div class="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={librarySettings.musicFolder}
                    oninput={(e) => useMusicStore.getState().setLibrarySettings({ musicFolder: (e.target as HTMLInputElement).value })}
                    placeholder="/home/usuario/Música"
                    class="min-w-[180px] flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200"
                  />
                  <button
                    onclick={() => void chooseLibraryFolder('musicFolder')}
                    class="px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold hover:bg-slate-700 flex items-center gap-2"
                    title="Elegir carpeta en el sistema"
                  >
                    <FolderOpen size={13} />
                    Elegir
                  </button>
                  <button
                    onclick={() => {
                      if (librarySettings.musicFolder) {
                        useMusicStore.getState().startDirectoryScan(librarySettings.musicFolder, true);
                        savedMessage = 'Indexación de biblioteca iniciada...';
                        setTimeout(() => { savedMessage = null; }, 3000);
                      }
                    }}
                    disabled={!librarySettings.musicFolder || scanStatus.is_scanning}
                    class="px-3 py-2 rounded-lg border border-cyan-700/60 bg-cyan-950/40 text-cyan-300 text-xs font-semibold hover:bg-cyan-900/40 disabled:opacity-50 flex items-center gap-2"
                    title="Indexar la carpeta principal de la biblioteca"
                  >
                    {#if scanStatus.is_scanning}
                      <RefreshCw size={13} class="animate-spin" />
                      <span>Indexando {scanStatus.current}/{scanStatus.total}</span>
                    {:else}
                      <Database size={13} />
                      <span>Indexar ahora</span>
                    {/if}
                  </button>
                </div>
                <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={librarySettings.autoScanOnStartup}
                    onchange={(e) => useMusicStore.getState().setLibrarySettings({ autoScanOnStartup: (e.target as HTMLInputElement).checked })}
                    class="accent-cyan-400 w-4 h-4 cursor-pointer"
                  />
                  Indexar la biblioteca automáticamente al iniciar
                </label>
              </div>
            </div>

            <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <div class="space-y-3">
                <div class="text-xs font-bold text-slate-300">Carpeta de inicio del explorador</div>
                <p class="text-[11px] text-slate-400">El botón de inicio del explorador volverá a esta ruta. La última carpeta visitada se restaura al abrir la aplicación.</p>
                <div class="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={librarySettings.explorerHomeFolder}
                    oninput={(e) => useMusicStore.getState().setLibrarySettings({ explorerHomeFolder: (e.target as HTMLInputElement).value })}
                    placeholder="/home/usuario/Música"
                    class="min-w-[180px] flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200"
                  />
                  <button
                    onclick={() => void chooseLibraryFolder('explorerHomeFolder')}
                    class="px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold hover:bg-slate-700 flex items-center gap-2"
                    title="Elegir carpeta en el sistema"
                  >
                    <FolderOpen size={13} />
                    Elegir
                  </button>
                </div>
              </div>
            </div>

            <!-- Radio Recording Settings -->
            <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-4">
              <div class="space-y-2">
                <div class="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <Radio size={14} class="text-cyan-400" />
                  Grabaciones de Radio (Neowave Recorder)
                </div>
                <p class="text-[11px] text-slate-400">
                  Ubicación en tu disco donde se guardarán las canciones grabadas desde el widget de radio.
                </p>
              </div>

              <div class="space-y-2">
                <div class="text-[11px] font-semibold text-slate-300">Carpeta de destino</div>
                <div class="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={librarySettings.radioRecordingFolder || ''}
                    oninput={(e) => useMusicStore.getState().setLibrarySettings({ radioRecordingFolder: (e.target as HTMLInputElement).value })}
                    placeholder="/home/usuario/Música/Radio_Recordings"
                    class="min-w-[180px] flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200"
                  />
                  <button
                    onclick={() => void chooseLibraryFolder('radioRecordingFolder')}
                    class="px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold hover:bg-slate-700 flex items-center gap-2"
                    title="Elegir carpeta para guardar grabaciones"
                  >
                    <FolderOpen size={13} />
                    Elegir
                  </button>
                </div>
              </div>

              <div class="space-y-2 pt-2 border-t border-slate-800/60">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-semibold text-slate-300">
                    Límite de pistas temporales en búfer antes de guardar
                  </span>
                  <span class="font-mono font-bold text-cyan-400">
                    {librarySettings.radioMaxStoredTracks || 20} pistas
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={librarySettings.radioMaxStoredTracks || 20}
                  oninput={(e) => useMusicStore.getState().setLibrarySettings({ radioMaxStoredTracks: Number((e.target as HTMLInputElement).value) })}
                  class="w-full accent-cyan-400 cursor-pointer"
                />
                <p class="text-[10px] text-slate-500">
                  El widget de radio conservará hasta este número de canciones en memoria para que puedas preescucharlas o guardarlas al ordenador cuando quieras.
                </p>
              </div>
            </div>
          </div>
        {/if}

        {#if activeTab === 'about'}
          <div class="space-y-6">
            <div class="p-5 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
              <div class="flex flex-col items-center gap-2 py-2 text-center">
                <img src="/musicx-banner.png" alt="MusicX · The Audio Player" class="h-20 max-w-full object-contain" />
                <span class="text-[11px] font-mono text-cyan-400">Versión {packageInfo.version} · Hi-Fi Direct</span>
                <span class="text-[11px] text-slate-400">Creado por AlexMC aka neokamen</span>
              </div>

              <p class="text-xs text-slate-300 leading-relaxed">
                Musicx es un reproductor de audio modular de ventanas de alta fidelidad para Linux y sistemas de sonido modernos, diseñado para proporcionar reproducción directa ALSA Bit-Perfect y streaming PipeWire de latencia ultra reducida.
              </p>

              <p class="text-xs text-slate-400 leading-relaxed">
                Incorpora el motor de ecualización y algoritmos de aspecto de Soundix Audio Toolbox, simulación analógica de vinilo a 33.3 RPM, motores DSP por hardware LG XDSS Plus y XTS Pro, y visualizador espectral con física inspirada en CAVA.
              </p>
            </div>

            <div class="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span class="text-slate-400">Decodificador:</span>
                <span class="ml-2 font-mono text-slate-200">Symphonia v0.5 (Rust)</span>
              </div>
              <div>
                <span class="text-slate-400">Backend Audio:</span>
                <span class="ml-2 font-mono text-slate-200">CPAL ALSA / PipeWire</span>
              </div>
              <div>
                <span class="text-slate-400">Visualizador:</span>
                <span class="ml-2 font-mono text-slate-200">CAVA FFT Engine</span>
              </div>
              <div>
                <span class="text-slate-400">Licencia:</span>
                <span class="ml-2 font-mono text-slate-200">MIT &bull; Código Abierto</span>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
