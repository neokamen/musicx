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
  cassette: {
    label: "Cassette",
    secondary: "rounded-sm border border-amber-800/70 bg-amber-950/70 shadow-[inset_0_1px_2px_rgba(255,255,255,0.12)] hover:bg-amber-900/70",
    primary: "rounded-sm border border-amber-300/70 bg-gradient-to-b from-amber-200 to-amber-500 shadow-[0_2px_0_#78350f] active:translate-y-px",
    preview: "rounded-sm border border-amber-900 bg-[#20170f]",
  },
  console: {
    label: "Consola",
    secondary: "rounded-none border border-emerald-500/30 bg-[#07140f] shadow-[inset_0_0_8px_rgba(16,185,129,0.12)] hover:border-emerald-300/70",
    primary: "rounded-none border border-emerald-300 bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.55)] active:scale-95",
    preview: "rounded-none border border-emerald-500/30 bg-[#07140f]",
  },
} as const;

export type TransportStyle = keyof typeof TRANSPORT_STYLES;