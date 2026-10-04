export interface EqBand {
  freq: number;
  gain: number;
  q: number;
}

export const DEFAULT_BANDS: EqBand[] = [
  { freq: 32, gain: 0, q: 1.4 },
  { freq: 64, gain: 0, q: 1.4 },
  { freq: 125, gain: 0, q: 1.4 },
  { freq: 250, gain: 0, q: 1.4 },
  { freq: 500, gain: 0, q: 1.4 },
  { freq: 1000, gain: 0, q: 1.4 },
  { freq: 2000, gain: 0, q: 1.4 },
  { freq: 4000, gain: 0, q: 1.4 },
  { freq: 8000, gain: 0, q: 1.4 },
  { freq: 16000, gain: 0, q: 1.4 },
];

export const BAND_LABELS = ["32", "64", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];
export const BAND_NAMES = [
  "Sub",
  "Bajo prof.",
  "Bajo",
  "Low-mid",
  "Mid",
  "Upper mid",
  "Pres.",
  "Claridad",
  "Aire",
  "Brillo",
];

export interface Preset {
  name: string;
  gains: number[];
  sub: number;
  bass: number;
  highpass: number;
  lowpass: number;
}

export const SOUNDIX_PRESETS: Preset[] = [
  { name: "Plano", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], sub: 0, bass: 0, highpass: 0, lowpass: 0 },
  { name: "Acústica", gains: [2, 2, 1, 1, 0, 0, 1, 2, 2, 1], sub: 1, bass: 1.5, highpass: 25, lowpass: 0 },
  { name: "Bass Boost", gains: [8, 7, 5, 2, 0, 0, 0, 0, 0, 0], sub: 4.5, bass: 5.5, highpass: 20, lowpass: 0 },
  { name: "Blues", gains: [5, 6, 4, 2, 0, -1, 2, 3, 2, 1], sub: 2.5, bass: 3.5, highpass: 25, lowpass: 0 },
  { name: "Brillante", gains: [0, 0, 0, 0, 0, 1, 2, 3, 5, 6], sub: 0, bass: 0, highpass: 30, lowpass: 0 },
  { name: "Cinema", gains: [5, 4, 2, 0, -1, 0, 1, 2, 3, 3], sub: 4, bass: 3, highpass: 20, lowpass: 0 },
  { name: "Clásica", gains: [-2, 0, 0, 0, 0, 0, 0, 1, 2, 2], sub: 0, bass: 0, highpass: 20, lowpass: 0 },
  { name: "Electrónica", gains: [6, 5, 2, -1, -2, 0, 1, 2, 4, 5], sub: 5, bass: 4, highpass: 25, lowpass: 0 },
  { name: "Hip-hop", gains: [8, 7, 4, 1, -1, -1, 0, 1, 1, 0], sub: 5.5, bass: 4.5, highpass: 20, lowpass: 0 },
  { name: "Jazz", gains: [2, 2, 1, 0, -1, -1, 0, 1, 2, 1], sub: 1.5, bass: 2, highpass: 25, lowpass: 0 },
  { name: "Lo-Fi", gains: [2, 3, 2, 0, -1, -2, -3, -4, -5, -6], sub: 1, bass: 2.5, highpass: 35, lowpass: 14000 },
  { name: "Podcast", gains: [-4, -2, 0, 2, 4, 3, 2, 1, 0, 0], sub: -2, bass: 0, highpass: 70, lowpass: 16000 },
  { name: "Pop", gains: [1, 2, 3, 1, -1, -2, -1, 1, 2, 3], sub: 2, bass: 2.5, highpass: 25, lowpass: 0 },
  { name: "Rock", gains: [4, 3, 2, 0, -1, -1, 0, 2, 3, 4], sub: 3, bass: 3.5, highpass: 25, lowpass: 0 },
  { name: "Vocal/Voz", gains: [-2, 0, 0, 2, 4, 4, 3, 2, 1, 0], sub: -1, bass: 0, highpass: 60, lowpass: 18000 },
  { name: "Warm", gains: [2, 2, 1, 0, -1, -2, -2, -1, 0, 0], sub: 2, bass: 2, highpass: 20, lowpass: 17000 },
];
