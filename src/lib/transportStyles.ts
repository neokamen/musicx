export const TRANSPORT_STYLES = {
  studio: {
    label: "Studio",
    secondary: "rounded-lg hover:bg-slate-800",
    primary: "rounded-full shadow-md",
    preview: "bg-slate-900",
  },
  glass: {
    label: "Cristal",
    secondary: "rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm shadow-md hover:bg-white/10",
    primary: "rounded-2xl border border-white/30 shadow-lg",
    preview: "rounded-xl border border-white/10 bg-white/5",
  },
  neon: {
    label: "Neon",
    secondary: "rounded-full border border-cyan-400/40 bg-cyan-950/30 shadow-[0_0_12px_rgba(34,211,238,0.15)] hover:bg-cyan-900/50",
    primary: "rounded-full border-2 border-cyan-200/70 shadow-[0_0_20px_rgba(34,211,238,0.45)]",
    preview: "rounded-full border border-cyan-400/30 bg-cyan-950/20",
  },
  deck: {
    label: "Deck retro",
    secondary: "rounded-md border border-slate-600 bg-gradient-to-b from-slate-700 to-slate-900 shadow-inner active:translate-y-px",
    primary: "rounded-md border border-slate-500 border-b-4 bg-gradient-to-b from-slate-300 to-slate-500 shadow-md active:translate-y-px",
    preview: "rounded-md border border-slate-600 bg-gradient-to-b from-slate-800 to-slate-950",
  },
} as const;

export type TransportStyle = keyof typeof TRANSPORT_STYLES;