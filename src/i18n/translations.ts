export type Language = 'es' | 'ca' | 'en';

export interface TranslationDictionary {
  // Global & Navigation
  settings: string;
  general: string;
  appearance: string;
  audio: string;
  playback: string;
  library: string;
  stats: string;
  dependencies: string;
  language: string;
  appLanguage: string;
  streamMusic: string;
  radio: string;
  tagEditor: string;
  audioEqPro: string;
  editLayout: string;
  saveLayout: string;
  miniPlayer: string;
  theAudioPlayer: string;
  inPlay: string;
  bitPerfectAlsa: string;
  sharedPipewire: string;

  // Appearance
  accentColor: string;
  backgroundColor: string;
  customColor: string;
  glassmorphism: string;
  blurAmount: string;
  neonGlow: string;
  glowIntensity: string;
  borderEffect: string;
  borderOpacity: string;
  borderRadius: string;
  borderGlow: string;
  spectrumVisualizer: string;
  spectrumStyle: string;
  spectrumFps: string;

  // Audio & DSP
  extraVolumeGain: string;
  extraVolumeGainDesc: string;
  resamplingQuality: string;
  bufferLatency: string;
  gaplessCrossfade: string;
  ditherEngine: string;
  subBoost: string;
  bassBoost: string;
  highpass: string;
  lowpass: string;
  normalizer: string;

  // Library & Storage
  musicFolder: string;
  browseFolder: string;
  autoScanStartup: string;
  scanLibraryNow: string;
  clearDatabase: string;
  totalTracks: string;
  folderExplorer: string;
  virtualTracklist: string;
  coverInspector: string;
  dacTelemetry: string;
  syncLibrary: string;
  fullBackup: string;
  fullBackupDesc: string;
  linkFile: string;
  unlinkFile: string;
  exportBackup: string;
  restoreBackup: string;
  noFileLinked: string;

  // Playback & Hi-Fi Player Bar
  queue: string;
  queueTitle: string;
  tracks: string;
  queueEmpty: string;
  queueEmptyDesc: string;
  clearQueue: string;
  play: string;
  pause: string;
  previous: string;
  next: string;
  playing: string;
  paused: string;
  stopped: string;
  readyToPlay: string;
  noTrackSelected: string;
  volume: string;
  muteAudio: string;
  unmuteAudio: string;
  shuffle: string;
  repeat: string;
  session: string;
  sessionTracks: string;
  sessionSessions: string;
  sessionTime: string;

  // Explorer & Tracklist
  filterInFolder: string;
  filterInLibrary: string;
  root: string;
  name: string;
  type: string;
  size: string;
  duration: string;
  bitrate: string;
  action: string;
  emptyFolder: string;
  searchTracks: string;
  allTracks: string;
  scanNow: string;
  libraryEmpty: string;

  // Actions
  save: string;
  close: string;
  cancel: string;
  reset: string;
  apply: string;
}

export const translations: Record<Language, TranslationDictionary> = {
  es: {
    // Global & Navigation
    settings: 'Ajustes',
    general: 'Generales',
    appearance: 'Apariencia',
    audio: 'Audio',
    playback: 'Reproducción',
    library: 'Biblioteca',
    stats: 'Estadísticas',
    dependencies: 'Dependencias',
    language: 'Idioma del sistema',
    appLanguage: 'Idioma de la aplicación',
    streamMusic: 'Stream Music',
    radio: 'Radio',
    tagEditor: 'Tags & Carátulas',
    audioEqPro: 'Audio EQ PRO',
    editLayout: 'Editar Interfaz',
    saveLayout: 'Guardar Layout',
    miniPlayer: 'Activar mini reproductor',
    theAudioPlayer: 'THE AUDIO PLAYER',
    inPlay: 'In Play:',
    bitPerfectAlsa: 'Bit-Perfect (ALSA)',
    sharedPipewire: 'PipeWire / Compartido',

    // Appearance
    accentColor: 'Color de acento',
    backgroundColor: 'Color de fondo',
    customColor: 'Personalizado',
    glassmorphism: 'Efecto Cristal (Glassmorphism)',
    blurAmount: 'Desenfoque de cristal',
    neonGlow: 'Efecto Neón en botones y acentos',
    glowIntensity: 'Intensidad de brillo Neón',
    borderEffect: 'Estilo de bordes personalizados',
    borderOpacity: 'Opacidad del borde',
    borderRadius: 'Radio de curvatura de bordes',
    borderGlow: 'Resplandor en bordes pasados por cursor',
    spectrumVisualizer: 'Espectro de audio a tiempo real',
    spectrumStyle: 'Estilo del espectro visual',
    spectrumFps: 'Rendimiento (FPS)',

    // Audio & DSP
    extraVolumeGain: 'Ganancia extra de volumen (+25% Boost)',
    extraVolumeGainDesc: 'Permite subir el deslizador de volumen de 100% hasta 125% con imán a 100%.',
    resamplingQuality: 'Calidad de remuestreo (Resampling)',
    bufferLatency: 'Latencia y tamaño de buffer PCM',
    gaplessCrossfade: 'Fundido cruzado / Gapless',
    ditherEngine: 'Motor de Dithering',
    subBoost: 'Sub Boost',
    bassBoost: 'Bass Boost',
    highpass: 'Highpass (Pasa altos)',
    lowpass: 'Lowpass (Pasa bajos)',
    normalizer: 'Normalizador EBU R128',

    // Library & Storage
    musicFolder: 'Carpeta principal de la biblioteca',
    browseFolder: 'Examinar carpeta',
    autoScanStartup: 'Escanear automáticamente al iniciar',
    scanLibraryNow: 'Sincronizar biblioteca ahora',
    clearDatabase: 'Limpiar caché y base de datos',
    totalTracks: 'Pistas registradas',
    folderExplorer: 'Explorador de Carpetas',
    virtualTracklist: 'Lista de Canciones / Biblioteca',
    coverInspector: 'Carátula & Inspector Técnico',
    dacTelemetry: 'Telemetría Hi-Fi & DAC',
    syncLibrary: 'Sincronizar',
    fullBackup: 'Copia de Seguridad Completa',
    fullBackupDesc: 'Ruta del archivo de configuración: la app lo lee al arrancar y lo actualiza en tiempo real al cambiar ajustes, apariencia y widgets.',
    linkFile: 'Vincular archivo',
    unlinkFile: 'Desvincular',
    exportBackup: 'Exportar a otro archivo',
    restoreBackup: 'Restaurar desde archivo',
    noFileLinked: 'Ningún archivo vinculado',

    // Playback & Hi-Fi Player Bar
    queue: 'Cola de Reproducción',
    queueTitle: 'COLA DE REPRODUCCIÓN',
    tracks: 'pistas',
    queueEmpty: 'La cola está vacía',
    queueEmptyDesc: 'Añade pistas locales o abre Radio / Stream Music desde la cabecera.',
    clearQueue: 'Limpiar cola',
    play: 'Reproducir',
    pause: 'Pausar',
    previous: 'Anterior',
    next: 'Siguiente',
    playing: 'Reproduciendo',
    paused: 'Pausado',
    stopped: 'Detenido',
    readyToPlay: 'Listo para reproducir',
    noTrackSelected: 'Sin pista seleccionada',
    volume: 'Volumen',
    muteAudio: 'Silenciar audio',
    unmuteAudio: 'Activar audio',
    shuffle: 'Aleatorio',
    repeat: 'Repetir',
    session: 'SESIÓN',
    sessionTracks: 'PISTAS',
    sessionSessions: 'SESIONES',
    sessionTime: 'TIEMPO',

    // Explorer & Tracklist
    filterInFolder: 'Filtrar en carpeta...',
    filterInLibrary: 'Filtrar en biblioteca...',
    root: 'Raíz',
    name: 'Nombre',
    type: 'Tipo',
    size: 'Tamaño',
    duration: 'Duración',
    bitrate: 'Bitrate',
    action: 'Acción',
    emptyFolder: 'Esta carpeta está vacía',
    searchTracks: 'Buscar pistas, artistas, álbumes...',
    allTracks: 'Todas las pistas',
    scanNow: 'Escanear ahora',
    libraryEmpty: 'La biblioteca está vacía',

    // Actions
    save: 'Guardar',
    close: 'Cerrar',
    cancel: 'Cancelar',
    reset: 'Restablecer',
    apply: 'Aplicar',
  },

  ca: {
    // Global & Navigation
    settings: 'Ajustos',
    general: 'Generals',
    appearance: 'Aparença',
    audio: 'Àudio',
    playback: 'Reproducció',
    library: 'Biblioteca',
    stats: 'Estadístiques',
    dependencies: 'Dependències',
    language: 'Idioma del sistema',
    appLanguage: "Idioma de l'aplicació",
    streamMusic: 'Stream Music',
    radio: 'Ràdio',
    tagEditor: 'Tags & Caràtules',
    audioEqPro: 'Àudio EQ PRO',
    editLayout: 'Editar Interfície',
    saveLayout: 'Desar Interfície',
    miniPlayer: 'Activar mini reproductor',
    theAudioPlayer: "EL REPRODUCTOR D'ÀUDIO",
    inPlay: 'En Reproducció:',
    bitPerfectAlsa: 'Bit-Perfect (ALSA)',
    sharedPipewire: 'PipeWire / Compartit',

    // Appearance
    accentColor: 'Color de destacament',
    backgroundColor: 'Color de fons',
    customColor: 'Personalitzat',
    glassmorphism: 'Efecte Vidre (Glassmorphism)',
    blurAmount: 'Desenfoncament de vidre',
    neonGlow: 'Efecte Neó en botons i destacaments',
    glowIntensity: 'Intensitat de la brillantor Neó',
    borderEffect: 'Estil de vores personalitzat',
    borderOpacity: 'Opacitat de la vora',
    borderRadius: 'Radi de curvatura de les vores',
    borderGlow: 'Resplendor en vores en passar el cursor',
    spectrumVisualizer: "Espectre d'àudio en temps real",
    spectrumStyle: "Estil de l'espectre visual",
    spectrumFps: 'Rendiment (FPS)',

    // Audio & DSP
    extraVolumeGain: "Guany d'àudio addicional (+25% Boost)",
    extraVolumeGainDesc: 'Permet pujar el control de volum del 100% al 125% amb imant al 100%.',
    resamplingQuality: 'Qualitat de remostratge (Resampling)',
    bufferLatency: 'Latència i mida de buffer PCM',
    gaplessCrossfade: 'Transició suau / Gapless',
    ditherEngine: 'Motor de Dithering',
    subBoost: 'Sub Boost',
    bassBoost: 'Bass Boost',
    highpass: 'Highpass (Pensa-alts)',
    lowpass: 'Lowpass (Pensa-baixos)',
    normalizer: 'Normalitzador EBU R128',

    // Library & Storage
    musicFolder: 'Carpeta principal de la biblioteca',
    browseFolder: 'Explorar carpeta',
    autoScanStartup: 'Escanejar automàticament en iniciar',
    scanLibraryNow: 'Sincronitzar biblioteca ara',
    clearDatabase: 'Netejar memòria cau i base de dades',
    totalTracks: 'Pistes registrades',
    folderExplorer: 'Explorador de Carpetes',
    virtualTracklist: 'Llista de Cançons / Biblioteca',
    coverInspector: 'Caràtula & Inspector Tècnic',
    dacTelemetry: 'Telemetria Hi-Fi & DAC',
    syncLibrary: 'Sincronitzar',
    fullBackup: 'Còpia de Seguretat Completa',
    fullBackupDesc: "Ruta del fitxer de configuració: l'aplicació el llegeix en arrencar i l'actualitza en temps real en canviar ajustos, aparença i ginys.",
    linkFile: 'Vincular fitxer',
    unlinkFile: 'Desvincular',
    exportBackup: 'Exportar a un altre fitxer',
    restoreBackup: 'Restaurar des de fitxer',
    noFileLinked: 'Cap fitxer vinculat',

    // Playback & Hi-Fi Player Bar
    queue: 'Cua de Reproducció',
    queueTitle: 'CUA DE REPRODUCCIÓ',
    tracks: 'pistes',
    queueEmpty: 'La cua està buida',
    queueEmptyDesc: 'Afegeix pistes locals o obre Ràdio / Stream Music des de la capçalera.',
    clearQueue: 'Netejar cua',
    play: 'Reproduir',
    pause: 'Pausar',
    previous: 'Anterior',
    next: 'Següent',
    playing: 'Reproduint',
    paused: 'Pausat',
    stopped: 'Aturat',
    readyToPlay: 'A punt per reproduir',
    noTrackSelected: 'Sense pista seleccionada',
    volume: 'Volum',
    muteAudio: 'Silenciar àudio',
    unmuteAudio: 'Activar àudio',
    shuffle: 'Aleatori',
    repeat: 'Repetir',
    session: 'SESSIÓ',
    sessionTracks: 'PISTES',
    sessionSessions: 'SESSIONS',
    sessionTime: 'TEMPS',

    // Explorer & Tracklist
    filterInFolder: 'Filtrar a la carpeta...',
    filterInLibrary: 'Filtrar a la biblioteca...',
    root: 'Arrel',
    name: 'Nom',
    type: 'Tipus',
    size: 'Mida',
    duration: 'Durada',
    bitrate: 'Bitrate',
    action: 'Acció',
    emptyFolder: 'Aquesta carpeta està buida',
    searchTracks: 'Cercar cançons, artistes, àlbums...',
    allTracks: 'Totes les pistes',
    scanNow: 'Escanejar ara',
    libraryEmpty: 'La biblioteca està buida',

    // Actions
    save: 'Desar',
    close: 'Tancar',
    cancel: 'Cancel·lar',
    reset: 'Restablir',
    apply: 'Aplicar',
  },

  en: {
    // Global & Navigation
    settings: 'Settings',
    general: 'General',
    appearance: 'Appearance',
    audio: 'Audio',
    playback: 'Playback',
    library: 'Library',
    stats: 'Statistics',
    dependencies: 'Dependencies',
    language: 'System Language',
    appLanguage: 'Application Language',
    streamMusic: 'Stream Music',
    radio: 'Radio',
    tagEditor: 'Tags & Covers',
    audioEqPro: 'Audio EQ PRO',
    editLayout: 'Edit Layout',
    saveLayout: 'Save Layout',
    miniPlayer: 'Switch to mini player',
    theAudioPlayer: 'THE AUDIO PLAYER',
    inPlay: 'In Play:',
    bitPerfectAlsa: 'Bit-Perfect (ALSA)',
    sharedPipewire: 'PipeWire / Shared',

    // Appearance
    accentColor: 'Accent Color',
    backgroundColor: 'Background Color',
    customColor: 'Custom',
    glassmorphism: 'Glassmorphism Effect',
    blurAmount: 'Glass Blur Amount',
    neonGlow: 'Neon Glow on Buttons & Accents',
    glowIntensity: 'Neon Glow Intensity',
    borderEffect: 'Custom Border Styling',
    borderOpacity: 'Border Opacity',
    borderRadius: 'Border Corner Radius',
    borderGlow: 'Border Hover Glow',
    spectrumVisualizer: 'Real-time Audio Spectrum',
    spectrumStyle: 'Spectrum Visual Style',
    spectrumFps: 'Performance (FPS)',

    // Audio & DSP
    extraVolumeGain: 'Extra Volume Gain Boost (+25% Gain)',
    extraVolumeGainDesc: 'Allows dragging volume slider from 100% to 125% with magnetic snap at 100%.',
    resamplingQuality: 'Resampling Quality',
    bufferLatency: 'Buffer Latency & PCM Target',
    gaplessCrossfade: 'Gapless / Crossfade Transition',
    ditherEngine: 'Dithering Engine',
    subBoost: 'Sub Boost',
    bassBoost: 'Bass Boost',
    highpass: 'Highpass Filter',
    lowpass: 'Lowpass Filter',
    normalizer: 'EBU R128 Normalizer',

    // Library & Storage
    musicFolder: 'Main Music Collection Folder',
    browseFolder: 'Browse Folder',
    autoScanStartup: 'Automatically scan on startup',
    scanLibraryNow: 'Sync Library Now',
    clearDatabase: 'Clear Cache & Database',
    totalTracks: 'Registered Tracks',
    folderExplorer: 'Folder Explorer',
    virtualTracklist: 'Virtual Tracklist',
    coverInspector: 'Cover & Inspector',
    dacTelemetry: 'Hi-Fi & DAC Telemetry',
    syncLibrary: 'Sync Library',
    fullBackup: 'Full System Backup',
    fullBackupDesc: 'Configuration file path: the app reads it at startup and updates it in real-time when changing settings, appearance, and widgets.',
    linkFile: 'Link file',
    unlinkFile: 'Unlink',
    exportBackup: 'Export to another file',
    restoreBackup: 'Restore from file',
    noFileLinked: 'No linked file',

    // Playback & Hi-Fi Player Bar
    queue: 'Playback Queue',
    queueTitle: 'PLAYBACK QUEUE',
    tracks: 'tracks',
    queueEmpty: 'Queue is empty',
    queueEmptyDesc: 'Add local tracks or open Radio / Stream Music from the header.',
    clearQueue: 'Clear queue',
    play: 'Play',
    pause: 'Pause',
    previous: 'Previous',
    next: 'Next',
    playing: 'Playing',
    paused: 'Paused',
    stopped: 'Stopped',
    readyToPlay: 'Ready to play',
    noTrackSelected: 'No track selected',
    volume: 'Volume',
    muteAudio: 'Mute audio',
    unmuteAudio: 'Unmute audio',
    shuffle: 'Shuffle',
    repeat: 'Repeat',
    session: 'SESSION',
    sessionTracks: 'TRACKS',
    sessionSessions: 'SESSIONS',
    sessionTime: 'TIME',

    // Explorer & Tracklist
    filterInFolder: 'Filter in folder...',
    filterInLibrary: 'Filter in library...',
    root: 'Root',
    name: 'Name',
    type: 'Type',
    size: 'Size',
    duration: 'Duration',
    bitrate: 'Bitrate',
    action: 'Action',
    emptyFolder: 'This folder is empty',
    searchTracks: 'Search tracks, artists, albums...',
    allTracks: 'All tracks',
    scanNow: 'Scan now',
    libraryEmpty: 'Library is empty',

    // Actions
    save: 'Save',
    close: 'Close',
    cancel: 'Cancel',
    reset: 'Reset',
    apply: 'Apply',
  },
};

/**
 * Detects the system language from the browser/OS environment.
 * Matches Catalan ('ca') or Spanish ('es') or English ('en').
 * Falls back to English ('en') if it's none of the 3.
 */
export function detectSystemLanguage(): Language {
  if (typeof navigator !== 'undefined') {
    const rawLanguages = (navigator.languages && navigator.languages.length)
      ? navigator.languages
      : [navigator.language];

    for (const raw of rawLanguages) {
      if (!raw) continue;
      const lower = raw.toLowerCase().trim();
      if (lower.startsWith('ca')) return 'ca';
      if (lower.startsWith('es')) return 'es';
      if (lower.startsWith('en')) return 'en';
    }
  }
  return 'en'; // Fallback to English if none of the 3
}

export function t(key: keyof TranslationDictionary, lang: Language = 'en'): string {
  const dict = translations[lang] || translations.en;
  return dict[key] || translations.en[key] || translations.es[key] || (key as string);
}
