export type SpectrumStyle =
  | 'bars'
  | 'wave'
  | 'circular'
  | 'oscilloscope'
  | 'stereo_vu'
  | 'stereo_vu_vertical'
  | 'retro_needle'
  | 'stereo_wave'
  | 'stereo_split'
  | 'stereo_mirror'
  | 'led_matrix'
  | 'mirror'
  | 'gradient_flow'
  | 'peak_meter'
  | 'retro_glow_meter'
  | 'retro_tube_meter'
  | 'retro_scope_meter'
  | 'fluid_wave'
  | 'fftw3_precision';

export const SPECTRUM_STYLES: { id: SpectrumStyle; name: string }[] = [
  { id: 'fluid_wave', name: 'Onda Fluida Continua Mejorada' },
  { id: 'fftw3_precision', name: 'Analizador FFTW3 de Estudio' },
  { id: 'bars', name: 'Espectro de Barras Hi-Fi' },
  { id: 'wave', name: 'Onda Fluida Continua' },
  { id: 'circular', name: 'Espectro Radial / Circular' },
  { id: 'oscilloscope', name: 'Osciloscopio Láser' },
  { id: 'stereo_vu', name: 'Vúmetro Estéreo' },
  { id: 'stereo_vu_vertical', name: 'Vúmetro Estéreo Vertical' },
  { id: 'retro_needle', name: 'Aguja Retro de Minicadena' },
  { id: 'retro_glow_meter', name: 'Agujas Neón · Doble VU' },
  { id: 'retro_tube_meter', name: 'Válvulas de Fósforo' },
  { id: 'retro_scope_meter', name: 'Osciloscopio Analógico' },
  { id: 'stereo_wave', name: 'Ondas Estéreo' },
  { id: 'stereo_split', name: 'Espectro Estéreo Dividido' },
  { id: 'stereo_mirror', name: 'Espectro Estéreo Espejo' },
  { id: 'led_matrix', name: 'Matriz LED de Segmentos' },
  { id: 'mirror', name: 'Espectro Simétrico Espejo' },
  { id: 'gradient_flow', name: 'Cinta Térmica Fluida' },
  { id: 'peak_meter', name: 'Caída de Picos con Gravedad' },
];

export type CavaStyle = "fluid" | "waves" | "dots" | "lines" | "bars" | "radial" | "prism" | "embers" | "scope";

export const CAVA_STYLES: { id: CavaStyle; label: string }[] = [
  { id: "fluid", label: "Onda fluida" },
  { id: "waves", label: "Ondas" },
  { id: "dots", label: "Puntos" },
  { id: "lines", label: "Líneas" },
  { id: "bars", label: "Barras" },
  { id: "radial", label: "Radial" },
  { id: "prism", label: "Prisma" },
  { id: "embers", label: "Brasas" },
  { id: "scope", label: "Osciloscopio" },
];

export const FORMAT_COLORS: Record<string, string> = {
  FLAC: "#38bdf8",
  DSD: "#e879f9",
  DSF: "#e879f9",
  DFF: "#e879f9",
  WAV: "#4ade80",
  AIFF: "#a3e635",
  ALAC: "#2dd4bf",
  APE: "#f472b6",
  WV: "#f472b6",
  MP3: "#fbbf24",
  AAC: "#fb923c",
  OGG: "#34d399",
  OPUS: "#22d3ee",
  M4A: "#fb923c",
  WMA: "#94a3b8",
};

