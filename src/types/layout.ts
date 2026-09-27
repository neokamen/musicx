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
  | "buffer_inspector"
  | "buffer_inspector_compact";

export interface WidgetMeta {
  type: WidgetType;
  label: string;
  description: string;
}

export const AVAILABLE_WIDGETS: WidgetMeta[] = [
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
    type: "buffer_inspector",
    label: "Buffer Monitor (DSP)",
    description: "Telemetría de ring buffer, latencia ms, I/O y selector de frames",
  },
  {
    type: "buffer_inspector_compact",
    label: "Buffer Monitor (Compacto)",
    description: "Medidor compacto de latencia, capacidad de buffer y selector rápido",
  },
];

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
