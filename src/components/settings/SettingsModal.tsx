import React, { useRef, useState } from 'react';
import { useMusicStore } from '../../store/index.ts';
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
} from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '../../services/api.ts';
import packageInfo from '../../../package.json';
import { SPECTRUM_STYLES } from '../widgets/SpectrumVisualizer.tsx';
import { CAVA_STYLES } from '../widgets/CavaVisualizer.tsx';
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

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setSettingsOpen,
    language,
    setLanguage,
    appearance,
    setAppearance,
    audioSettings,
    setAudioSettings,
    playbackSettings,
    setPlaybackSettings,
    listeningStats,
    setListeningStats,
    resetStats,
    resetSettings,
    clearCacheAndResidues,
    librarySettings,
    setLibrarySettings,
    loadListeningStatsFromSyncFile,
    startDirectoryScan,
    scanStatus,
    libraryTracks,
  } = useMusicStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [activeVisualizerPanel, setActiveVisualizerPanel] = useState<VisualizerSettingsPanel>('cava');
  const tabsRef = useRef<HTMLDivElement>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const [accent, setAccent] = useState<AccentColor>(getSavedAccent);
  const [bgTheme, setBgTheme] = useState<BackgroundTheme>(getSavedTheme);
  const [customAccentHex, setCustomAccentHexState] = useState<string>(getCustomAccentColor);
  const [customThemeHex, setCustomThemeHexState] = useState<string>(getCustomThemeColor);
  const [bgOpacity, setBgOpacity] = useState<number>(getSavedBgOpacity);
  const [neonGlow, setNeonGlow] = useState<boolean>(getSavedNeonGlow);
  const [neonIntensity, setNeonIntensity] = useState<number>(getSavedNeonGlowIntensity);
  const [tintedBorders, setTintedBorders] = useState<boolean>(getSavedTintedBorders);
  const [tintedBordersRatio, setTintedBordersRatio] = useState<number>(getSavedTintedBordersRatio);
  const [cornerRadius, setCornerRadius] = useState<CornerRadius>(getSavedCornerRadius);
  const [ambientGlow, setAmbientGlow] = useState<boolean>(getSavedAmbientGlow);
  const [minimalScrollbars, setMinimalScrollbars] = useState<boolean>(getSavedMinimalScrollbars);
  const [marqueeSpeed, setMarqueeSpeedState] = useState<number>(() => appearance.marqueeSpeed || getSavedMarqueeSpeed());
  const [marqueeDelay, setMarqueeDelayState] = useState<number>(() => appearance.marqueeDelay || getSavedMarqueeDelay());

  if (!isSettingsOpen) return null;

  const totalTracks = libraryTracks.length;
  const totalLibrarySeconds = libraryTracks.reduce((acc, trk) => acc + (trk.duration_seconds || 0), 0);
  const totalLibraryHours = (totalLibrarySeconds / 3600).toFixed(1);

  const listenedHours = Math.floor(listeningStats.totalSecondsListened / 3600);
  const listenedMinutes = Math.floor((listeningStats.totalSecondsListened % 3600) / 60);

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
    setAccent(newAccent);
    triggerApplyTheme(newAccent, bgTheme);
    const opt = ACCENT_OPTIONS.find((a) => a.id === newAccent);
    if (opt && !opt.isRgb && !opt.isCustom) {
      setAppearance({ accentColor: opt.color, accentPreset: newAccent });
    }
  };

  const handleCustomAccentChange = (hex: string) => {
    setCustomAccentHexState(hex);
    setCustomAccentColor(hex);
    setAccent('custom');
    triggerApplyTheme('custom', bgTheme, hex);
    setAppearance({ accentColor: hex, accentPreset: 'custom' });
  };

  const handleSelectTheme = (newTheme: BackgroundTheme) => {
    setBgTheme(newTheme);
    triggerApplyTheme(accent, newTheme);
    const opt = THEME_OPTIONS.find((t) => t.id === newTheme);
    if (opt && !opt.isCustom) {
      setAppearance({ bgColor: opt.charcoal, bgPreset: newTheme });
    }
  };

  const handleCustomThemeChange = (hex: string) => {
    setCustomThemeHexState(hex);
    setCustomThemeColor(hex);
    setBgTheme('custom');
    triggerApplyTheme(accent, 'custom', customAccentHex, hex);
    setAppearance({ bgColor: hex, bgPreset: 'custom' });
  };

  const handleResetSettings = () => {
    if (window.confirm('¿Restablecer todos los ajustes a los valores de fábrica?')) {
      resetSettings();
      window.location.reload();
    }
  };

  const handleClearCache = () => {
    if (window.confirm('¿Borrar caché temporal, carátulas almacenadas y residuos?')) {
      clearCacheAndResidues();
      setSavedMessage('Caché y residuos eliminados.');
      setTimeout(() => setSavedMessage(null), 2500);
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
        setLibrarySettings({ [setting]: selected });
      }
    } catch {
      setSavedMessage('No se pudo abrir el selector de carpetas.');
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
      if (typeof selected !== 'string') return;

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

      await writeTextFile(selected, JSON.stringify(backup, null, 2));
      setSavedMessage('Copia de seguridad guardada con éxito.');
      setTimeout(() => setSavedMessage(null), 3000);
    } catch {
      setSavedMessage('No se pudo guardar la copia de seguridad.');
      setTimeout(() => setSavedMessage(null), 3000);
    }
  };

  const importFullAppBackup = async () => {
    try {
      const selected = await open({
        multiple: false,
        title: 'Restaurar copia de seguridad completa',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (typeof selected !== 'string') return;

      const content = await readTextFile(selected);
      if (!content) throw new Error('El archivo está vacío');

      const backup = JSON.parse(content);
      if (backup?.format !== 'musicx-full-backup-v1' || typeof backup?.data !== 'object' || backup.data === null) {
        throw new Error('Formato de backup no válido');
      }

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

      for (const [key, value] of Object.entries<unknown>(backup.data)) {
        if (typeof value === 'string' && !EXCLUDED_KEYS.includes(key)) {
          localStorage.setItem(key, value);
        }
      }

      for (const [k, v] of Object.entries(preservedStats)) {
        if (v !== null) localStorage.setItem(k, v);
      }

      setSavedMessage('Copia de seguridad restaurada con éxito. Recargando app...');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch {
      setSavedMessage('No se pudo restaurar la copia de seguridad.');
      setTimeout(() => setSavedMessage(null), 3000);
    }
  };

  const applyStatsFile = async (path: string) => {
    const raw = await readTextFile(path);
    if (!raw) throw new Error('El archivo está vacío.');
    const backup = JSON.parse(raw);
    const fileStats = backup?.listeningStats;
    if (!fileStats || !Number.isFinite(fileStats.totalSecondsListened)) {
      throw new Error('El archivo no contiene estadísticas de MusicX.');
    }
    setListeningStats({
      totalSecondsListened: Math.max(0, fileStats.totalSecondsListened),
      totalTracksPlayed: Math.max(0, Number(fileStats.totalTracksPlayed) || 0),
      totalSessions: Math.max(0, Number(fileStats.totalSessions) || 0),
    }, { syncFile: false });
    setLibrarySettings({ statsSyncFilePath: path }, { syncFile: false });
  };

  const chooseStatsSyncFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        title: 'Seleccionar archivo de estadísticas',
        defaultPath: librarySettings.statsSyncFilePath || 'musicx-listening-stats.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (typeof selected === 'string') {
        setLibrarySettings({ statsSyncFilePath: selected, statsBackupMode: 'sync' }, { syncFile: false });
        await loadListeningStatsFromSyncFile();
        setSavedMessage('Archivo cargado y sincronización activada.');
        setTimeout(() => setSavedMessage(null), 2500);
      }
    } catch {
      setSavedMessage('No se pudo cargar el archivo de estadísticas.');
      setTimeout(() => setSavedMessage(null), 2500);
    }
  };

  const syncStatsNow = async () => {
    await loadListeningStatsFromSyncFile();
    setSavedMessage('Estadísticas sincronizadas con el archivo.');
    setTimeout(() => setSavedMessage(null), 2500);
  };

  const importManualStats = async () => {
    try {
      const selected = await open({
        multiple: false,
        title: 'Importar estadísticas escuchadas',
        defaultPath: librarySettings.statsSyncFilePath || 'musicx-listening-stats.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (typeof selected === 'string') {
        await applyStatsFile(selected);
        setSavedMessage('Estadísticas importadas.');
        setTimeout(() => setSavedMessage(null), 2500);
      }
    } catch {
      setSavedMessage('No se pudo importar el archivo de estadísticas.');
      setTimeout(() => setSavedMessage(null), 2500);
    }
  };

  const exportManualStats = async () => {
    try {
      const selected = await save({
        title: 'Exportar estadísticas escuchadas',
        defaultPath: librarySettings.statsSyncFilePath || 'musicx-listening-stats.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (typeof selected === 'string') {
        await writeTextFile(selected, JSON.stringify({
          format: 'musicx-listening-stats-v1',
          exportedAt: new Date().toISOString(),
          listeningStats,
        }, null, 2));
        setLibrarySettings({ statsSyncFilePath: selected }, { syncFile: false });
        setSavedMessage('Estadísticas exportadas.');
        setTimeout(() => setSavedMessage(null), 2500);
      }
    } catch {
      setSavedMessage('No se pudo exportar el archivo de estadísticas.');
      setTimeout(() => setSavedMessage(null), 2500);
    }
  };

  const enableStatsSync = async () => {
    setLibrarySettings({ statsBackupMode: 'sync' }, { syncFile: false });
    await loadListeningStatsFromSyncFile();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-fade-in select-none">
      <div
        className="w-[840px] max-w-[95vw] h-[640px] max-h-[92vh] flex flex-col rounded-2xl border border-slate-700/70 bg-slate-950/95 text-slate-100 shadow-2xl overflow-hidden transition-all duration-200"
        style={{
          boxShadow: neonGlow ? `0 0 35px var(--app-accent, #06b6d4)33` : undefined,
        }}
      >
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-800 bg-slate-900/70 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full"
              style={{
                backgroundColor: appearance.accentColor || '#06b6d4',
                boxShadow: neonGlow ? `0 0 8px ${appearance.accentColor || '#06b6d4'}` : 'none',
              }}
            />
            <h2 className="text-base font-bold tracking-wide font-mono" style={{ color: appearance.accentColor || '#06b6d4' }}>
              Ajustes de Configuración &bull; Musicx
            </h2>
          </div>

          <button
            onClick={() => setSettingsOpen(false)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="flex items-center border-b border-slate-800 bg-slate-900/50 shrink-0">
          <button
            onClick={() => tabsRef.current?.scrollBy({ left: -220, behavior: 'smooth' })}
            className="h-11 w-8 shrink-0 flex items-center justify-center text-slate-400 hover:text-white border-r border-slate-800"
            title="Pestañas anteriores"
            aria-label="Desplazar pestañas a la izquierda"
          >
            <ChevronLeft size={16} />
          </button>
          <div ref={tabsRef} className="flex min-w-0 flex-1 px-2 gap-2 overflow-x-auto settings-tabs-scroll">
          {[
            { id: 'general', label: 'General', icon: Sliders },
            { id: 'appearance', label: 'Apariencia', icon: Palette },
            { id: 'cava', label: 'Visualización en vivo', icon: Activity },
            { id: 'playback', label: 'Reproducción', icon: Music },
            { id: 'audio', label: 'Audio & DSP', icon: Volume2 },
            { id: 'library', label: 'Biblioteca', icon: FolderOpen },
            { id: 'about', label: 'Acerca de', icon: Info },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={`py-3 px-3.5 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-cyan-400 text-cyan-300 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
                style={isActive ? { borderColor: appearance.accentColor, color: appearance.accentColor } : undefined}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
          </div>
          <button
            onClick={() => tabsRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
            className="h-11 w-8 shrink-0 flex items-center justify-center text-slate-400 hover:text-white border-l border-slate-800"
            title="Pestañas siguientes"
            aria-label="Desplazar pestañas a la derecha"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {savedMessage && (
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/50 text-xs text-emerald-300 flex items-center gap-2">
              <ShieldCheck size={16} />
              <span>{savedMessage}</span>
            </div>
          )}

          {activeTab === 'general' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Idioma de la aplicación
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'es' as const, name: 'Español' },
                    { id: 'ca' as const, name: 'Català' },
                    { id: 'en' as const, name: 'English' },
                  ].map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setLanguage(l.id)}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer text-center ${
                        language === l.id
                          ? 'border-cyan-500 bg-cyan-950/30 text-cyan-300 font-bold'
                          : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:text-slate-200'
                      }`}
                      style={language === l.id ? { borderColor: appearance.accentColor, color: appearance.accentColor } : undefined}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                <div>
                  <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">Copia de Seguridad Completa</div>
                  <div className="text-[11px] text-slate-400">Guarda o restaura toda la configuración de la app en la ruta que elijas (ajustes, apariencia, widgets, emisoras, etc., excepto el tiempo escuchado).</div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={exportFullAppBackup}
                    className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:border-slate-500 cursor-pointer"
                  >
                    <Download size={14} style={{ color: appearance.accentColor || '#06b6d4' }} />
                    <span>Guardar copia de seguridad...</span>
                  </button>
                  <button
                    type="button"
                    onClick={importFullAppBackup}
                    className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:border-slate-500 cursor-pointer"
                  >
                    <Upload size={14} style={{ color: appearance.accentColor || '#06b6d4' }} />
                    <span>Restaurar copia de seguridad...</span>
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Mantenimiento y Restablecimiento
                </div>
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={handleClearCache}
                    className="w-full py-2.5 px-3 rounded-xl border border-rose-900/60 bg-rose-950/30 hover:bg-rose-900/40 text-xs font-semibold text-rose-300 flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Trash2 size={14} />
                    <span>Borrar Caché y Residuos</span>
                  </button>

                  <button
                    onClick={handleResetSettings}
                    className="w-full py-2.5 px-3 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-semibold text-slate-300 flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <RotateCcw size={14} />
                    <span>Restablecer Ajustes de Fábrica</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-2.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Sparkles size={14} style={{ color: appearance.accentColor }} />
                  Color de Acento Predominante
                </label>
                <p className="text-xs text-slate-400">
                  Selecciona el color para botones, deslizadores, carátulas y telemetría:
                </p>

                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {ACCENT_OPTIONS.map((opt) => {
                    const isSelected = accent === opt.id;
                    const swatchBackground = opt.isRgb
                      ? opt.color
                      : opt.isCustom
                      ? customAccentHex
                      : opt.color;

                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleSelectAccent(opt.id)}
                        title={opt.label}
                        className={`h-14 rounded-xl border flex flex-col items-center justify-center transition cursor-pointer ${
                          isSelected
                            ? 'bg-slate-800 border-cyan-400 ring-2 ring-cyan-400/40'
                            : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div
                          className="w-7 h-7 rounded-full shadow flex items-center justify-center shrink-0"
                          style={{ background: swatchBackground }}
                        >
                          {opt.isCustom ? (
                            isSelected ? (
                              <Check size={14} className="text-white stroke-[3]" />
                            ) : (
                              <Plus size={15} className="text-white stroke-[2.5]" />
                            )
                          ) : isSelected ? (
                            <Check size={14} className="text-white stroke-[3]" />
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 mt-1">
                  <span className="text-xs text-slate-300 font-medium">Color de acento personalizado:</span>
                  <div
                    className="relative w-7 h-7 rounded-lg border border-slate-700 flex items-center justify-center overflow-hidden cursor-pointer"
                    style={{ backgroundColor: customAccentHex }}
                  >
                    <Plus size={14} className="text-white stroke-[2.5] pointer-events-none" />
                    <input
                      type="color"
                      value={customAccentHex}
                      onChange={(e) => handleCustomAccentChange(e.target.value)}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                    />
                  </div>
                  <input
                    type="text"
                    value={customAccentHex}
                    onChange={(e) => handleCustomAccentChange(e.target.value)}
                    placeholder="#8b5cf6"
                    className="w-24 px-2 py-1 text-xs font-mono uppercase bg-slate-950 rounded-lg border border-slate-800 text-slate-200 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2.5 pt-4 border-t border-slate-800">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Palette size={14} style={{ color: appearance.accentColor }} />
                  Fondo y Contraste
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {THEME_OPTIONS.map((opt) => {
                    const isSelected = bgTheme === opt.id;
                    const swatchBg = opt.isCustom
                      ? customThemeHex
                      : opt.id === 'gray_gradient'
                      ? 'linear-gradient(135deg, #161719 0%, #4a4d52 100%)'
                      : opt.charcoal;

                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleSelectTheme(opt.id)}
                        className={`flex items-center justify-between p-2 rounded-xl border transition cursor-pointer ${
                          isSelected
                            ? 'bg-slate-800 border-cyan-400 ring-2 ring-cyan-400/30'
                            : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="w-5 h-5 rounded-md border border-white/20 flex items-center justify-center shrink-0"
                            style={{ background: swatchBg }}
                          />
                          <span className="text-xs font-semibold text-slate-200 truncate">
                            {opt.label}
                          </span>
                        </div>
                        {isSelected && <Check size={12} className="text-cyan-400 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 mt-1">
                  <span className="text-xs text-slate-300 font-medium">Color de fondo personalizado:</span>
                  <div
                    className="relative w-7 h-7 rounded-lg border border-slate-700 flex items-center justify-center overflow-hidden cursor-pointer"
                    style={{ backgroundColor: customThemeHex }}
                  >
                    <Plus size={14} className="text-white stroke-[2.5] pointer-events-none" />
                    <input
                      type="color"
                      value={customThemeHex}
                      onChange={(e) => handleCustomThemeChange(e.target.value)}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                    />
                  </div>
                  <input
                    type="text"
                    value={customThemeHex}
                    onChange={(e) => handleCustomThemeChange(e.target.value)}
                    placeholder="#0f172a"
                    className="w-24 px-2 py-1 text-xs font-mono uppercase bg-slate-950 rounded-lg border border-slate-800 text-slate-200 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300">Transparencia y Glassmorphism</span>
                  <span className="font-mono text-cyan-400 font-bold">{Math.round(bgOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="1.0"
                  step="0.05"
                  value={bgOpacity}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setBgOpacity(val);
                    triggerApplyTheme(accent, bgTheme, customAccentHex, customThemeHex, val);
                  }}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-200">Resplandor Neón Activo</div>
                    <div className="text-[11px] text-slate-400">Iluminación externa en bordes y botones de control</div>
                  </div>
                  <button
                    onClick={() => {
                      const next = !neonGlow;
                      setNeonGlow(next);
                      triggerApplyTheme(accent, bgTheme, customAccentHex, customThemeHex, bgOpacity, next);
                    }}
                    className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                      neonGlow ? 'bg-cyan-500' : 'bg-slate-800'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-0.5 ${neonGlow ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
                {neonGlow && (
                  <div className="flex items-center gap-3 pt-2 border-t border-slate-800">
                    <span className="text-xs text-slate-400">Intensidad:</span>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={neonIntensity}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setNeonIntensity(val);
                        triggerApplyTheme(accent, bgTheme, customAccentHex, customThemeHex, bgOpacity, neonGlow, val);
                      }}
                      className="flex-1 accent-cyan-400 cursor-pointer"
                    />
                    <span className="text-xs font-mono text-cyan-400">{Math.round(neonIntensity * 100)}%</span>
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-200">Bordes Tintados con Acento</div>
                    <div className="text-[11px] text-slate-400">Marcos de ventanas ligeramente pigmentados con el color de acento</div>
                  </div>
                  <button
                    onClick={() => {
                      const next = !tintedBorders;
                      setTintedBorders(next);
                      triggerApplyTheme(accent, bgTheme, customAccentHex, customThemeHex, bgOpacity, neonGlow, neonIntensity, next);
                    }}
                    className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                      tintedBorders ? 'bg-cyan-500' : 'bg-slate-800'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-0.5 ${tintedBorders ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
                {tintedBorders && (
                  <div className="flex items-center gap-3 pt-2 border-t border-slate-800">
                    <span className="text-xs text-slate-400">Tinte:</span>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={tintedBordersRatio}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setTintedBordersRatio(val);
                        triggerApplyTheme(accent, bgTheme, customAccentHex, customThemeHex, bgOpacity, neonGlow, neonIntensity, tintedBorders, val);
                      }}
                      className="flex-1 accent-cyan-400 cursor-pointer"
                    />
                    <span className="text-xs font-mono text-cyan-400">{Math.round(tintedBordersRatio * 100)}%</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Curvatura de Esquinas
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'square' as CornerRadius, label: 'Recto (0px)' },
                    { id: 'industrial' as CornerRadius, label: 'DAW (4px)' },
                    { id: 'modern' as CornerRadius, label: 'Moderno (8px)' },
                    { id: 'smooth' as CornerRadius, label: 'Suave (14px)' },
                  ].map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setCornerRadius(r.id);
                        triggerApplyTheme(accent, bgTheme, customAccentHex, customThemeHex, bgOpacity, neonGlow, neonIntensity, tintedBorders, tintedBordersRatio, r.id);
                      }}
                      className={`p-2 rounded-lg border text-xs font-semibold transition cursor-pointer text-center flex flex-col items-center gap-2 ${
                        cornerRadius === r.id
                          ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className="w-10 h-7 border border-current bg-slate-950/40" style={{ borderRadius: r.id === 'square' ? 0 : r.id === 'industrial' ? 4 : r.id === 'modern' ? 8 : 14 }} />
                      <span>{r.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">Resplandor Ambiental de Estudio</span>
                  <input
                    type="checkbox"
                    checked={ambientGlow}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setAmbientGlow(next);
                      triggerApplyTheme(accent, bgTheme, customAccentHex, customThemeHex, bgOpacity, neonGlow, neonIntensity, tintedBorders, tintedBordersRatio, cornerRadius, next);
                    }}
                    className="accent-cyan-400 cursor-pointer"
                  />
                </div>
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">Barras de Desplazamiento Mínimas</span>
                  <input
                    type="checkbox"
                    checked={minimalScrollbars}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setMinimalScrollbars(next);
                      triggerApplyTheme(accent, bgTheme, customAccentHex, customThemeHex, bgOpacity, neonGlow, neonIntensity, tintedBorders, tintedBordersRatio, cornerRadius, ambientGlow, next);
                    }}
                    className="accent-cyan-400 cursor-pointer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <label className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3 text-xs font-semibold text-slate-200">
                  Pulso BPM en el botón Play
                  <input
                    type="checkbox"
                    checked={appearance.playButtonBpmPulseEnabled}
                    onChange={(e) => setAppearance({ playButtonBpmPulseEnabled: e.target.checked })}
                    className="accent-cyan-400 shrink-0"
                  />
                </label>
                <label className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3 text-xs font-semibold text-slate-200">
                  Luz BPM en In Play
                  <input
                    type="checkbox"
                    checked={appearance.inPlayBpmPulseEnabled}
                    onChange={(e) => setAppearance({ inPlayBpmPulseEnabled: e.target.checked })}
                    className="accent-cyan-400 shrink-0"
                  />
                </label>
              </div>

              {/* Velocidad y tiempo de espera de la letra al pasar el ratón (Marquesina) */}
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 pt-2">
                {/* 1. Velocidad de desplazamiento */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-200">Velocidad de la letra al pasar el ratón</div>
                      <div className="text-[11px] text-slate-400">
                        Duración del recorrido en pistas con títulos largos (menor tiempo = más rápido)
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-cyan-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {marqueeSpeed <= 6 ? 'Rápido' : marqueeSpeed <= 12 ? 'Normal' : marqueeSpeed <= 18 ? 'Lento' : 'Muy lento'} ({marqueeSpeed}s)
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-400 shrink-0">Rápido (4s)</span>
                    <input
                      type="range"
                      min="4"
                      max="24"
                      step="1"
                      value={marqueeSpeed}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setMarqueeSpeedState(val);
                        saveMarqueeSpeed(val);
                        setAppearance({ marqueeSpeed: val });
                      }}
                      className="flex-1 accent-cyan-400 cursor-pointer"
                    />
                    <span className="text-[11px] text-slate-400 shrink-0">Lento (24s)</span>
                  </div>
                </div>

                {/* 2. Tiempo de espera antes de moverse (quedarse encima) */}
                <div className="space-y-2 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-200">Tiempo de espera encima antes de moverse</div>
                      <div className="text-[11px] text-slate-400">
                        Segundos con el ratón encima de la pista para iniciar el desplazamiento
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-cyan-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {marqueeDelay.toFixed(1)}s
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-400 shrink-0">Rápido (0.5s)</span>
                    <input
                      type="range"
                      min="0.5"
                      max="5.0"
                      step="0.25"
                      value={marqueeDelay}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setMarqueeDelayState(val);
                        saveMarqueeDelay(val);
                        setAppearance({ marqueeDelay: val });
                      }}
                      className="flex-1 accent-cyan-400 cursor-pointer"
                    />
                    <span className="text-[11px] text-slate-400 shrink-0">Pausado (5s)</span>
                  </div>
                </div>

                {/* Previsualización interactiva */}
                <div className="space-y-1 pt-1">
                  <span className="text-[10px] uppercase font-mono text-slate-400">Demostración en vivo</span>
                  <div className="p-2 rounded bg-slate-950/70 border border-slate-850 overflow-hidden whitespace-nowrap">
                    <span
                      className="inline-block text-xs font-mono text-slate-300"
                      style={{
                        animation: `marquee-delayed ${marqueeSpeed}s linear infinite`,
                        animationDelay: `${marqueeDelay}s`,
                      }}
                    >
                      Demostración de velocidad de desplazamiento de pista musical • Artista Hi-Fi • Formato FLAC 24-bit 96kHz
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'cava' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                  <Activity size={15} className="text-cyan-400" />
                  {activeVisualizerPanel === 'cava' ? 'Motor CAVA' : 'Espectro en vivo'}
                </h3>
                <p className="text-xs text-slate-400">
                  {activeVisualizerPanel === 'cava'
                    ? 'Ajustes del motor, estilo, respuesta y paleta de CAVA.'
                    : 'Ajustes independientes para los estilos y la fluidez del espectro.'}
                </p>
              </div>

              <div role="tablist" aria-label="Visualizadores" className="grid grid-cols-2 rounded-lg border border-slate-800 bg-slate-950 p-1">
                {[
                  { id: 'cava' as const, label: 'Motor CAVA', icon: Activity },
                  { id: 'spectrum' as const, label: 'Espectro en vivo', icon: Music },
                ].map((panel) => {
                  const Icon = panel.icon;
                  const isSelected = activeVisualizerPanel === panel.id;
                  return (
                    <button
                      key={panel.id}
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => setActiveVisualizerPanel(panel.id)}
                      className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition ${isSelected ? 'bg-cyan-950/60 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      <Icon size={14} />
                      {panel.label}
                    </button>
                  );
                })}
              </div>

              {activeVisualizerPanel === 'cava' && (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                    <label className="text-xs font-bold text-slate-300">Estilo visual CAVA</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {CAVA_STYLES.map((style) => (
                        <button
                          key={style.id}
                          onClick={() => setAppearance({ cavaStyle: style.id })}
                          className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${appearance.cavaStyle === style.id ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300' : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'}`}
                        >
                          {style.label}
                        </button>
                      ))}
                    </div>
                  </div>

              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                <label className="text-xs font-bold text-slate-300">Frecuencia del motor</label>
                <div className="grid grid-cols-4 gap-2">
                  {[30, 60, 120, 144].map((fps) => (
                    <button
                      key={fps}
                      onClick={() => setAppearance({ cavaFps: fps as 30 | 60 | 120 | 144 })}
                      className={`p-2 rounded-xl border text-xs font-mono font-bold transition cursor-pointer text-center ${
                        appearance.cavaFps === fps
                          ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {fps} FPS
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-slate-300">Número de Barras FFT</span>
                    <span className="font-mono text-cyan-400 font-bold">{appearance.cavaBars}</span>
                  </div>
                  <input
                    type="range"
                    min="32"
                    max="128"
                    step="16"
                    value={appearance.cavaBars}
                    onChange={(e) => setAppearance({ cavaBars: parseInt(e.target.value) })}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-slate-300">Sensibilidad de Ganancia</span>
                    <span className="font-mono text-cyan-400 font-bold">{appearance.cavaSensitivity}%</span>
                  </div>
                  <input
                    type="range"
                    min="25"
                    max="200"
                    step="5"
                    value={appearance.cavaSensitivity}
                    onChange={(e) => setAppearance({ cavaSensitivity: parseInt(e.target.value) })}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
                  <div className="flex justify-between text-xs"><span className="font-bold text-slate-300">Suavizado de caída</span><span className="font-mono text-cyan-400">{appearance.cavaSmoothing}%</span></div>
                  <input type="range" min="0" max="95" step="5" value={appearance.cavaSmoothing} onChange={(e) => setAppearance({ cavaSmoothing: parseInt(e.target.value) })} className="w-full accent-cyan-400" />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                <label className="text-xs font-bold text-slate-300">Paleta de CAVA</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
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
                  ].map((palette) => (
                    <button
                      key={palette.id}
                      onClick={() => setAppearance({ cavaPalette: palette.id as typeof appearance.cavaPalette })}
                      className={`min-h-14 rounded-lg border p-2 text-left text-[10px] font-semibold transition ${appearance.cavaPalette === palette.id ? 'border-cyan-400 text-white' : 'border-slate-800 text-slate-400 hover:border-slate-600'}`}
                      title={palette.label}
                    >
                      <span className="mb-1.5 flex h-3 overflow-hidden rounded-sm">
                        {palette.colors.map((color, index) => <span key={`${palette.id}-${index}`} className="flex-1" style={{ backgroundColor: color }} />)}
                      </span>
                      {palette.label}
                    </button>
                  ))}
                </div>
                {appearance.cavaPalette === 'custom' && (
                  <div className="grid grid-cols-3 gap-3 border-t border-slate-800 pt-3">
                    {(['Inicio', 'Centro', 'Final'] as const).map((label, index) => (
                      <label key={label} className="flex items-center gap-2 text-[10px] text-slate-400">
                        <input
                          type="color"
                          value={appearance.cavaCustomPalette[index]}
                          onChange={(e) => {
                            const colors = [...appearance.cavaCustomPalette] as [string, string, string];
                            colors[index] = e.target.value;
                            setAppearance({ cavaCustomPalette: colors });
                          }}
                          className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'cavaPeakHold' as const, label: 'Retener picos' },
                  { key: 'cavaMirrored' as const, label: 'Onda simétrica' },
                ].map((option) => (
                  <label key={option.key} className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 flex items-center justify-between text-xs text-slate-200">
                    {option.label}<input type="checkbox" checked={appearance[option.key]} onChange={(e) => setAppearance({ [option.key]: e.target.checked })} className="accent-cyan-400" />
                  </label>
                ))}
              </div>

              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
                <label className="text-xs font-bold text-slate-300">Física de Caída / Gravedad</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'monstercat', label: 'Monstercat (Fluido)' },
                    { id: 'studio', label: 'Estudio Lineal' },
                    { id: 'instant', label: 'Respuesta Instantánea' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setAppearance({ cavaGravity: m.id as 'monstercat' | 'studio' | 'instant' })}
                      className={`p-2 rounded-xl border text-xs font-semibold transition cursor-pointer text-center ${
                        appearance.cavaGravity === m.id
                          ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-200">
                    Fallback Anti-pérdida Espectral Offline
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Mantiene el buffer local para restaurar la física FFT en caso de saturación o desconexión
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={appearance.cavaOfflineFallback}
                  onChange={(e) => setAppearance({ cavaOfflineFallback: e.target.checked })}
                  className="accent-cyan-400 w-4 h-4 cursor-pointer"
                />
              </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'cava' && activeVisualizerPanel === 'spectrum' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                  <Music size={15} className="text-cyan-400" />
                  Espectro en vivo
                </h3>
                <p className="text-xs text-slate-400">Selecciona el formato y la fluidez del visualizador de espectro, independientes del motor CAVA.</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <label htmlFor="spectrum-sensitivity" className="font-bold text-slate-300">Intensidad del espectro</label>
                  <span className="font-mono font-bold text-cyan-400">{Math.min(125, Math.round(appearance.spectrumSensitivity / 8))}%</span>
                </div>
                <input
                  id="spectrum-sensitivity"
                  type="range"
                  min="0"
                  max="125"
                  step="1"
                  value={Math.min(125, appearance.spectrumSensitivity / 8)}
                  onChange={(e) => setAppearance({ spectrumSensitivity: Number(e.target.value) * 8 })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                <label className="text-xs font-bold text-slate-300">Estilo del espectro</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SPECTRUM_STYLES.map((style) => (
                    <button key={style.id} onClick={() => setAppearance({ spectrumStyle: style.id })}
                      className={`p-2 rounded-lg border text-[11px] font-semibold ${appearance.spectrumStyle === style.id ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300' : 'border-slate-800 bg-slate-900/60 text-slate-400'}`}>
                      {style.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                <label className="text-xs font-bold text-slate-300">Fluidez del espectro</label>
                <div className="grid grid-cols-4 gap-2">
                  {[30, 60, 120, 144].map((fps) => (
                    <button
                      key={fps}
                      onClick={() => setAppearance({ spectrumFps: fps as 30 | 60 | 120 | 144 })}
                      className={`p-2 rounded-xl border text-xs font-mono font-bold transition cursor-pointer text-center ${appearance.spectrumFps === fps ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300' : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'}`}
                    >
                      {fps} FPS
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}

          {activeTab === 'playback' && (
            <div className="space-y-6">
              <label className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-center justify-between text-xs font-bold text-slate-200">
                Mostrar BPM durante la reproducción
                <input type="checkbox" checked={playbackSettings.showBpmInPlayer} onChange={(e) => setPlaybackSettings({ showBpmInPlayer: e.target.checked })} className="accent-cyan-400 shrink-0" />
              </label>
              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                <label className="text-xs font-bold text-slate-300">Plantilla de botones de reproducción</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(Object.entries(TRANSPORT_STYLES) as [TransportStyle, typeof TRANSPORT_STYLES[TransportStyle]][]).map(([id, style]) => (
                    <button
                      key={id}
                      onClick={() => setPlaybackSettings({ transportStyle: id })}
                      className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border p-2 transition ${playbackSettings.transportStyle === id ? 'border-cyan-400 bg-cyan-950/30 text-white' : 'border-slate-800 text-slate-400 hover:border-slate-600'}`}
                    >
                      <span className={`flex items-center gap-1 p-1 ${style.preview}`}>
                        <Shuffle size={9} />
                        <SkipBack size={9} />
                        <span className={`flex h-5 w-5 items-center justify-center bg-cyan-400 text-slate-950 ${style.primary}`}><Play size={9} fill="currentColor" /></span>
                        <SkipForward size={9} />
                        <Repeat size={9} />
                      </span>
                      <span className="text-[10px] font-semibold">{style.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Estilo de Barra de Reproducción
                </label>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {SEEK_BAR_STYLES.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setPlaybackSettings({ playerBarStyle: style.id })}
                      className={`flex min-h-[108px] flex-col justify-between rounded-xl border p-2.5 text-xs font-semibold transition cursor-pointer text-center ${
                        playbackSettings.playerBarStyle === style.id
                          ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>{style.label}</span>
                      <span className="mt-2 flex h-7 w-full items-center overflow-hidden rounded border border-slate-700 bg-slate-950 px-1.5">
                        {style.id === 'spectrum' && [25, 44, 66, 35, 82, 54, 30, 70, 42, 22, 64, 48, 75, 33, 58, 27].map((height, index) => (
                          <span key={index} className="mx-px flex-1 rounded-sm" style={{ height: `${height}%`, background: index < 9 ? 'var(--app-accent, #22d3ee)' : '#475569' }} />
                        ))}
                        {style.id === 'classic' && (
                          <span className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                            <span className="block h-full w-2/3 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                          </span>
                        )}
                        {style.id === 'hybrid' && (
                          <svg viewBox="0 0 160 28" preserveAspectRatio="none" className="h-full w-full">
                            <path d="M0 15 Q10 4 20 14 T40 15 T60 7 T80 17 T100 13 T120 6 T140 16 T160 12" fill="none" stroke="#64748b" strokeWidth="2" />
                            <path d="M0 15 Q10 4 20 14 T40 15 T60 7 T80 17 T100 13 T120 6 T140 16 T160 12" fill="none" stroke="#22d3ee" strokeWidth="2" strokeDasharray="105 160" />
                          </svg>
                        )}
                        {style.id === 'aurora' && (
                          <span className="relative h-full w-full">
                            <span className="absolute inset-0 opacity-40" style={{ background: 'linear-gradient(90deg,#06b6d4,#818cf8,#f472b6)' }} />
                            <svg viewBox="0 0 160 28" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                              <path d="M0 14 Q15 4 30 14 T60 14 T90 8 T120 14 T160 10" fill="none" stroke="white" strokeWidth="2" />
                            </svg>
                            <span className="absolute inset-y-0 left-2/3 w-px bg-white shadow-[0_0_8px_2px_white]" />
                          </span>
                        )}
                        {style.id === 'segments' && Array.from({ length: 22 }, (_, index) => (
                          <span key={index} className="mx-px flex-1 rounded-[1px]" style={{ height: `${25 + ((index * 37) % 75)}%`, background: index < 14 ? '#34d399' : '#334155' }} />
                        ))}
                        {style.id === 'ribbon' && (
                          <span className="relative h-full w-full overflow-hidden" style={{ background: 'repeating-linear-gradient(135deg,#22d3ee22 0px,#22d3ee22 3px,transparent 3px,transparent 7px)' }}>
                            <span className="absolute inset-y-0 left-0 w-3/5" style={{ background: 'repeating-linear-gradient(135deg,#22d3ee 0px,#22d3ee 3px,#67e8f9 3px,#67e8f9 7px)' }} />
                            <span className="absolute inset-y-0 left-3/5 w-0.5 bg-white shadow-[0_0_8px_2px_white]" />
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-200">Difuminado de Carátula en Fondo de Lista</div>
                    <div className="text-[11px] text-slate-400">Muestra la portada de la canción actual con desenfoque artístico en la biblioteca</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={playbackSettings.diffuseAlbumArt}
                    onChange={(e) => setPlaybackSettings({ diffuseAlbumArt: e.target.checked })}
                    className="accent-cyan-400 w-4 h-4 cursor-pointer"
                  />
                </div>
                {playbackSettings.diffuseAlbumArt && (
                  <div className="flex items-center gap-3 pt-2 border-t border-slate-800">
                    <span className="text-xs text-slate-400">Transparencia:</span>
                    <input
                      type="range"
                      min="5"
                      max="60"
                      step="5"
                      value={playbackSettings.diffuseAlbumArtOpacity}
                      onChange={(e) => setPlaybackSettings({ diffuseAlbumArtOpacity: parseInt(e.target.value) })}
                      className="flex-1 accent-cyan-400 cursor-pointer"
                    />
                    <span className="text-xs font-mono text-cyan-400">{playbackSettings.diffuseAlbumArtOpacity}%</span>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-200">Reproducir Automáticamente al Arrastrar Archivos</div>
                  <div className="text-[11px] text-slate-400">Inicia de inmediato al soltar archivos de audio sobre la ventana</div>
                </div>
                <input
                  type="checkbox"
                  checked={playbackSettings.autoPlayOnDrop}
                  onChange={(e) => setPlaybackSettings({ autoPlayOnDrop: e.target.checked })}
                  className="accent-cyan-400 w-4 h-4 cursor-pointer"
                />
              </div>
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Motor de Decodificación y Remuestreo Hi-Fi
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'bit_perfect' as const, label: 'ALSA Direct Bit-Perfect' },
                    { id: 'symphonia_96k' as const, label: 'Symphonia 96 kHz' },
                    { id: 'float32' as const, label: 'Float32 PipeWire HD' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setAudioSettings({ resamplingQuality: m.id })}
                      className={`p-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer text-center ${
                        audioSettings.resamplingQuality === m.id
                          ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Tamaño de Buffer y Latencia PCM
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'ultra_low' as const, label: 'Ultra Baja (64 spls)' },
                    { id: 'low' as const, label: 'Baja (256 spls)' },
                    { id: 'stable' as const, label: 'Estable (1024 spls)' },
                  ].map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setAudioSettings({ bufferLatency: b.id })}
                      className={`p-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer text-center ${
                        audioSettings.bufferLatency === b.id
                          ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-200">Ganancia Extra de Volumen (+35% Boost)</div>
                  <div className="text-[11px] text-slate-400">Permite subir el deslizador hasta 135% con indicador en rojo</div>
                </div>
                <input
                  type="checkbox"
                  checked={audioSettings.allowExtraVolumeBoost}
                  onChange={(e) => setAudioSettings({ allowExtraVolumeBoost: e.target.checked })}
                  className="accent-cyan-400 w-4 h-4 cursor-pointer"
                />
              </div>
            </div>
          )}

          {activeTab === 'library' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                    <FolderOpen size={15} className="text-cyan-400" />
                    Biblioteca y estadísticas
                  </h3>
                  <button
                    onClick={() => {
                      if (window.confirm('¿Reiniciar a cero todas las estadísticas de escucha?')) {
                        resetStats();
                        setSavedMessage('Estadísticas de escucha reiniciadas.');
                        setTimeout(() => setSavedMessage(null), 2500);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg border border-rose-900/60 bg-rose-950/40 text-xs font-semibold text-rose-300 hover:bg-rose-900/50 transition cursor-pointer"
                  >
                    Reiniciar Estadísticas
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Métricas acumuladas de escucha y catálogo de pistas registradas en caché local.
                </p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] text-slate-400 uppercase font-mono">Pistas en Colección</span>
                  <span className="text-2xl font-mono font-bold text-white mt-1">{totalTracks}</span>
                  <span className="text-[10px] text-slate-500 mt-0.5">{totalLibraryHours} h totales de audio</span>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] text-slate-400 uppercase font-mono">Tiempo Escuchando</span>
                  <span className="text-2xl font-mono font-bold text-cyan-400 mt-1">
                    {listenedHours}h {listenedMinutes}m
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5">Contador real en caché</span>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] text-slate-400 uppercase font-mono">Sesiones Activas</span>
                  <span className="text-2xl font-mono font-bold text-slate-300 mt-1">
                    {listeningStats.totalSessions}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5">Inicios registrados</span>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] text-slate-400 uppercase font-mono">Canciones reproducidas</span>
                  <span className="text-2xl font-mono font-bold text-slate-300 mt-1">{listeningStats.totalTracksPlayed}</span>
                  <span className="text-[10px] text-slate-500 mt-0.5">Reproducciones iniciadas</span>
                </div>
              </div>


              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                <label className="text-xs font-bold text-slate-300">Modo de backup del tiempo escuchado</label>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setLibrarySettings({ statsBackupMode: 'manual' })}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                        librarySettings.statsBackupMode === 'manual'
                          ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-300'
                          : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      Manual (exportar / importar)
                    </button>
                    <button
                      onClick={() => void enableStatsSync()}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                        librarySettings.statsBackupMode === 'sync'
                          ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-300'
                          : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      Sincronizado (archivo compartido)
                    </button>
                  </div>
                  {librarySettings.statsBackupMode === 'sync' && (
                    <button
                      onClick={syncStatsNow}
                      disabled={!librarySettings.statsSyncFilePath}
                      className="px-3 py-1.5 rounded-lg border border-cyan-700/60 bg-cyan-950/40 text-cyan-300 text-xs font-semibold hover:bg-cyan-900/40 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 ml-auto"
                    >
                      <RefreshCw size={13} />
                      Sincronizar ahora
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  {librarySettings.statsBackupMode === 'sync'
                    ? 'El contador se guarda automáticamente en el archivo elegido (frecuencia configurable abajo) y se lee al abrir la app. Apunta la ruta a una carpeta sincronizada (Mega, Nextcloud, etc.) para compartir el progreso entre varios ordenadores.'
                    : 'Importa un archivo de estadísticas existente o exporta el contador actual para usarlo en otro equipo.'}
                </p>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={librarySettings.statsSyncFilePath}
                      placeholder="Selecciona un archivo musicx-listening-stats.json"
                      className="flex-1 min-w-[220px] px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200"
                    />
                    {librarySettings.statsBackupMode === 'sync' ? (
                      <button
                        onClick={() => void chooseStatsSyncFile()}
                        className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold hover:bg-slate-700 transition cursor-pointer"
                      >
                        Seleccionar y cargar
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => void importManualStats()}
                          className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold hover:bg-slate-700 transition cursor-pointer flex items-center gap-2"
                        >
                          <Upload size={13} />Importar
                        </button>
                        <button
                          onClick={() => void exportManualStats()}
                          className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold hover:bg-slate-700 transition cursor-pointer flex items-center gap-2"
                        >
                          <Download size={13} />Exportar
                        </button>
                      </>
                    )}
                  </div>

                  {librarySettings.statsBackupMode === 'sync' && (
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Frecuencia de escritura en el archivo</label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setLibrarySettings({ statsSyncFrequency: 'interval10s' })}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                            librarySettings.statsSyncFrequency === 'interval10s'
                              ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-300'
                              : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          Cada 10s de reproducción (actual)
                        </button>
                        <button
                          onClick={() => setLibrarySettings({ statsSyncFrequency: 'intervalMinutes' })}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                            librarySettings.statsSyncFrequency === 'intervalMinutes'
                              ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-300'
                              : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          Cada X minutos de reproducción
                        </button>
                        <button
                          onClick={() => setLibrarySettings({ statsSyncFrequency: 'onClose' })}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                            librarySettings.statsSyncFrequency === 'onClose'
                              ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-300'
                              : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          Solo al cerrar la app
                        </button>
                      </div>
                      {librarySettings.statsSyncFrequency === 'intervalMinutes' && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-300">Minutos de reproducción acumulada entre cada escritura:</span>
                          <input
                            type="number"
                            min={1}
                            value={librarySettings.statsSyncIntervalMinutes}
                            onChange={(e) => setLibrarySettings({ statsSyncIntervalMinutes: Math.max(1, parseInt(e.target.value) || 1) })}
                            className="w-20 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-slate-100"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-300">Carpeta principal de la biblioteca</label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={librarySettings.musicFolder}
                      onChange={(e) => setLibrarySettings({ musicFolder: e.target.value })}
                      placeholder="/home/usuario/Música"
                      className="min-w-[180px] flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200"
                    />
                    <button
                      onClick={() => void chooseLibraryFolder('musicFolder')}
                      className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold hover:bg-slate-700 flex items-center gap-2"
                      title="Elegir carpeta en el sistema"
                    >
                      <FolderOpen size={13} />
                      Elegir
                    </button>
                    <button
                      onClick={() => {
                        if (librarySettings.musicFolder) {
                          startDirectoryScan(librarySettings.musicFolder, true);
                          setSavedMessage('Indexación de biblioteca iniciada...');
                          setTimeout(() => setSavedMessage(null), 3000);
                        }
                      }}
                      disabled={!librarySettings.musicFolder || scanStatus.is_scanning}
                      className="px-3 py-2 rounded-lg border border-cyan-700/60 bg-cyan-950/40 text-cyan-300 text-xs font-semibold hover:bg-cyan-900/40 disabled:opacity-50 flex items-center gap-2"
                      title="Indexar la carpeta principal de la biblioteca"
                    >
                      {scanStatus.is_scanning ? <RefreshCw size={13} className="animate-spin" /> : <Database size={13} />}
                      {scanStatus.is_scanning ? `Indexando ${scanStatus.current}/${scanStatus.total}` : 'Indexar ahora'}
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={librarySettings.autoScanOnStartup}
                      onChange={(e) => setLibrarySettings({ autoScanOnStartup: e.target.checked })}
                      className="accent-cyan-400 w-4 h-4 cursor-pointer"
                    />
                    Indexar la biblioteca automáticamente al iniciar
                  </label>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-300">Carpeta de inicio del explorador</label>
                  <p className="text-[11px] text-slate-400">El botón de inicio del explorador volverá a esta ruta. La última carpeta visitada se restaura al abrir la aplicación.</p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={librarySettings.explorerHomeFolder}
                      onChange={(e) => setLibrarySettings({ explorerHomeFolder: e.target.value })}
                      placeholder="/home/usuario/Música"
                      className="min-w-[180px] flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200"
                    />
                    <button
                      onClick={() => void chooseLibraryFolder('explorerHomeFolder')}
                      className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold hover:bg-slate-700 flex items-center gap-2"
                      title="Elegir carpeta en el sistema"
                    >
                      <FolderOpen size={13} />
                      Elegir
                    </button>
                  </div>
                </div>
              </div>

              {/* Radio Recording Settings */}
              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <Radio size={14} className="text-cyan-400" />
                    Grabaciones de Radio (Neowave Recorder)
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Ubicación en tu disco donde se guardarán las canciones grabadas desde el widget de radio.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-slate-300">Carpeta de destino</label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={librarySettings.radioRecordingFolder || ''}
                      onChange={(e) => setLibrarySettings({ radioRecordingFolder: e.target.value })}
                      placeholder="/home/usuario/Música/Radio_Recordings"
                      className="min-w-[180px] flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200"
                    />
                    <button
                      onClick={() => void chooseLibraryFolder('radioRecordingFolder')}
                      className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold hover:bg-slate-700 flex items-center gap-2"
                      title="Elegir carpeta para guardar grabaciones"
                    >
                      <FolderOpen size={13} />
                      Elegir
                    </button>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800/60">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">
                      Límite de pistas temporales en búfer antes de guardar
                    </span>
                    <span className="font-mono font-bold text-cyan-400">
                      {librarySettings.radioMaxStoredTracks || 20} pistas
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={librarySettings.radioMaxStoredTracks || 20}
                    onChange={(e) => setLibrarySettings({ radioMaxStoredTracks: Number(e.target.value) })}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                  <p className="text-[10px] text-slate-500">
                    El widget de radio conservará hasta este número de canciones en memoria para que puedas preescucharlas o guardarlas al ordenador cuando quieras.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="space-y-6">
              <div className="p-5 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
                <div className="flex flex-col items-center gap-2 py-2 text-center">
                  <img src="/musicx-banner.png" alt="MusicX · The Audio Player" className="h-20 max-w-full object-contain" />
                  <span className="text-[11px] font-mono text-cyan-400">Versión {packageInfo.version} · Hi-Fi Direct</span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Musicx es un reproductor de audio modular de ventanas de alta fidelidad para Linux y sistemas de sonido modernos, diseñado para proporcionar reproducción directa ALSA Bit-Perfect y streaming PipeWire de latencia ultra reducida.
                </p>

                <p className="text-xs text-slate-400 leading-relaxed">
                  Incorpora el motor de ecualización y algoritmos de aspecto de Soundix Audio Toolbox, simulación analógica de vinilo a 33.3 RPM, motores DSP por hardware LG XDSS Plus y XTS Pro, y visualizador espectral con física inspirada en CAVA.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400">Decodificador:</span>
                  <span className="ml-2 font-mono text-slate-200">Symphonia v0.5 (Rust)</span>
                </div>
                <div>
                  <span className="text-slate-400">Backend Audio:</span>
                  <span className="ml-2 font-mono text-slate-200">CPAL ALSA / PipeWire</span>
                </div>
                <div>
                  <span className="text-slate-400">Visualizador:</span>
                  <span className="ml-2 font-mono text-slate-200">CAVA FFT Engine</span>
                </div>
                <div>
                  <span className="text-slate-400">Licencia:</span>
                  <span className="ml-2 font-mono text-slate-200">MIT &bull; Código Abierto</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
