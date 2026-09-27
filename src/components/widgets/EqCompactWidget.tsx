import React from "react";
import { Power, RotateCcw, Zap } from "lucide-react";
import { useMusicStore } from "../../store/index.ts";

const FREQUENCIES = ["31", "62", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];

export const EqCompactWidget: React.FC = () => {
  const { audioSettings, setAudioSettings, appearance } = useMusicStore();
  const gains = audioSettings.eqGains || Array(10).fill(0);

  const updateGain = (index: number, value: number) => {
    const next = [...gains];
    next[index] = value;
    setAudioSettings({ eqGains: next, isEqEnabled: true });
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-audiophile-surface font-mono text-xs select-none">
      <header className="flex shrink-0 items-center justify-between border-b border-audiophile-border px-2 py-1.5">
        <span className="text-[9px] uppercase tracking-widest text-audiophile-muted">EQ · 10 bandas</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title={audioSettings.isXdssEnabled ? "Desactivar XDSS" : "Activar XDSS"}
            aria-label={audioSettings.isXdssEnabled ? "Desactivar XDSS" : "Activar XDSS"}
            onClick={() => setAudioSettings({ isXdssEnabled: !audioSettings.isXdssEnabled })}
            className={`grid size-6 place-items-center border ${audioSettings.isXdssEnabled ? "border-amber-500/70 text-amber-300" : "border-slate-700 text-slate-500 hover:text-slate-200"}`}
          >
            <Zap size={12} />
          </button>
          <button
            type="button"
            title={audioSettings.isEqEnabled ? "Desactivar ecualizador" : "Activar ecualizador"}
            aria-label={audioSettings.isEqEnabled ? "Desactivar ecualizador" : "Activar ecualizador"}
            onClick={() => setAudioSettings({ isEqEnabled: !audioSettings.isEqEnabled })}
            className={`grid size-6 place-items-center border ${audioSettings.isEqEnabled ? "text-emerald-300" : "text-slate-500 hover:text-slate-200"}`}
            style={{ borderColor: audioSettings.isEqEnabled ? appearance.accentColor : undefined }}
          >
            <Power size={12} />
          </button>
          <button
            type="button"
            title="Restablecer todas las bandas"
            aria-label="Restablecer todas las bandas"
            onClick={() => setAudioSettings({ eqGains: Array(10).fill(0) })}
            className="grid size-6 place-items-center border border-slate-700 text-slate-500 hover:text-slate-200"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-10 gap-1 px-2 py-1.5">
        {FREQUENCIES.map((frequency, index) => {
          const gain = gains[index] || 0;
          return (
            <label key={frequency} className="flex min-w-0 flex-col items-center justify-center gap-1">
              <span className="h-3 text-[8px] text-slate-400">{gain > 0 ? `+${gain}` : gain}</span>
              <input
                aria-label={`${frequency} Hz, ${gain} dB`}
                type="range"
                min="-12"
                max="12"
                step="0.5"
                value={gain}
                onChange={(event) => updateGain(index, Number(event.target.value))}
                className="h-full min-h-0 w-1.5 cursor-pointer accent-cyan-400"
                style={{ writingMode: "vertical-lr", direction: "rtl" }}
              />
              <span className="text-[8px] leading-none text-slate-500">{frequency}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
};