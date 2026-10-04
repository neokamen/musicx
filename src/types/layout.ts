export type WidgetType =
  | "folder_explorer"
  | "tracklist"
  | "cover"
  | "inspector"
  | "eq_bars"
  | "spectrum"
  | "cava_visualizer"
  | "dac_telemetry"
  | "queue"
  | "bpm"
  | "id3_tags"
  | "radio"
  | "stream_music"
  | "buffer_inspector"
  | "buffer_inspector_compact"
  | "buffer_inspector_basic"
  | "buffer_stability_compact"
  | "eq_bars_compact"
  | "signal_stats"
  | "listening_stats"
  | "radio_telemetry"
  | "audio_diagnostics"
  | "dac_telemetry_compact"
  | "signal_monitor_compact"
  | "eq_spectrum"
  | "loudness_normalizer"
  | "audio_telemetry_full"
  | "waveform_bars"
  | "waveform_envelope"
  | "waveform_matrix"
  | "waveform_eco";

export interface WidgetMeta {
  type: WidgetType;
  label: string;
  description: string;
}

export const AVAILABLE_WIDGETS: WidgetMeta[] = ([
  {
    type: "folder_explorer",
    label: "Explorador de Carpetas",
    description: "Navegación lazy ultra-rápida (Local / NFS / SSHFS)",
  },
  {
    type: "tracklist",
    label: "Lista de Biblioteca / Canciones",
    description: "Listado de canciones con búsqueda rápida e indexado SQLite",
  },
  {
    type: "cover",
    label: "Carátula del Álbum",
    description: "Visualización de portada de alta fidelidad y fallback Hi-Fi",
  },
  {
    type: "inspector",
    label: "Inspector Técnico & Códec",
    description: "Inspección de tags de archivo, códec, bit-depth y metadatos",
  },
  {
    type: "eq_bars",
    label: "Barras de Ecualizador Gráfico",
    description: "Visualización de 10 bandas y controles de ganancia DSP",
  },
  {
    type: "spectrum",
    label: "Espectro Visualizador (Tiempo Real)",
    description: "Visualización independiente de frecuencias FFT y vúmetros",
  },
  {
    type: "cava_visualizer",
    label: "Visualizador CAVA FFT",
    description: "Visualizador FFT configurable con barras, sensibilidad y gravedad",
  },
  {
    type: "dac_telemetry",
    label: "Telemetría Hi-Fi & DAC",
    description: "Estado ALSA/PipeWire, stream bit-perfect y master clock",
  },
  {
    type: "dac_telemetry_compact",
    label: "Telemetría Hi-Fi DAC (compacta)",
    description: "Reloj, formato, dispositivo, canales, buffer y underruns en una caja",
  },
  {
    type: "queue",
    label: "Cola de Reproducción",
    description: "Lista de pistas en cola para reproducción continua gapless",
  },
  {
    type: "bpm",
    label: "BPM",
    description: "Tempo detectado en tiempo real",
  },
  {
    type: "id3_tags",
    label: "Etiquetas ID3",
    description: "Metadatos de título, artista, álbum y pista",
  },
  {
    type: "radio",
    label: "Radio Online (Neowave)",
    description: "Emisoras mundiales en streaming y catálogo Radio-Browser",
  },
  {
    type: "stream_music",
    label: "Stream Music",
    description: "Cliente de streaming integrado con cola, EQ y descarga opcional",
  },
  {
    type: "buffer_inspector",
    label: "Buffer Monitor (DSP)",
    description: "Telemetría de ring buffer, latencia ms, I/O y selector de frames",
  },
  {
    type: "buffer_inspector_compact",
    label: "Buffer Monitor (Compacto)",
    description: "Medidor compacto de latencia, capacidad de buffer y selector rápido",
  },
  {
    type: "buffer_inspector_basic",
    label: "Buffer Monitor (sin gráfica)",
    description: "Telemetría completa y selector de frames, sin historial de estabilidad",
  },
  {
    type: "buffer_stability_compact",
    label: "Buffer Monitor DSP (histograma bajo)",
    description: "Monitor DSP completo con historial de latencia a media altura",
  },
  {
    type: "eq_bars_compact",
    label: "EQ de bolsillo (10 bandas)",
    description: "Ecualizador de 10 bandas con controles compactos",
  },
  {
    type: "signal_stats",
    label: "Telemetría de señal",
    description: "Formato PCM, latencia, buffers, E/S y estado de salida",
  },
  {
    type: "listening_stats",
    label: "Estadísticas de escucha",
    description: "Tiempo acumulado, pistas, sesiones y reproducción actual",
  },
  {
    type: "radio_telemetry",
    label: "Telemetría de radio",
    description: "Emisora, título detectado, caudal en vivo y consumo acumulado",
  },
  {
    type: "audio_diagnostics",
    label: "Diagnóstico de audio",
    description: "Estado detallado de buffers, XRuns, lectura, fuente y formato",
  },
  {
    type: "signal_monitor_compact",
    label: "Monitor de señal (compacto)",
    description: "Sample rate, bit-perfect, bitrate, profundidad y canales",
  },
  {
    type: "eq_spectrum",
    label: "Espectro de EQ",
    description: "Curva de respuesta del ecualizador en tiempo real",
  },
  {
    type: "loudness_normalizer",
    label: "Normalizador Loudness",
    description: "Control integrado del limitador true-peak del motor de audio",
  },
  {
    type: "audio_telemetry_full",
    label: "Telemetría de audio (completa)",
    description: "Espectro, señal, dispositivo, buffer, latencia, XRuns y fuente",
  },
  {
    type: "waveform_bars",
    label: "Onda de Canción (Barras HD)",
    description: "Onda interactiva de barras como la del HUD, responde al ratón para mover la pista",
  },
  {
    type: "waveform_envelope",
    label: "Onda de Canción (Silueta Neón)",
    description: "Onda continua con silueta y reflejo neón, interactiva para mover la pista",
  },
  {
    type: "waveform_matrix",
    label: "Onda de Canción (Matriz Digital)",
    description: "Onda segmentada estilo matriz de bloques de estudio, interactiva con el ratón",
  },
  {
    type: "waveform_eco",
    label: "Onda de Canción (Bajo Consumo)",
    description: "Onda de pista optimizada para mínimo consumo de CPU/GPU, interactiva para mover la canción",
  },
] satisfies WidgetMeta[]).sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));

export type LayoutNode =
  | {
      id: string;
      type: "leaf";
      widget: WidgetType;
    }
  | {
      id: string;
      type: "split";
      direction: "horizontal" | "vertical";
      children: LayoutNode[];
      sizes: number[];
    };
