import React from "react";
import { useMusicStore } from "../../store/index.ts";
import { Sliders, RotateCcw } from "lucide-react";

export const EqBarsWidget: React.FC = () => {
  const { audioSettings, setAudioSettings, appearance } = useMusicStore();

  const isEqEnabled = audioSettings?.isEqEnabled ?? false;
  const isXdssEnabled = audioSettings?.isXdssEnabled ?? false;
  const gains = audioSettings?.eqGains || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  const freqs = ["31Hz", "62Hz", "125Hz", "250Hz", "500Hz", "1kHz", "2kHz", "4kHz", "8kHz", "16kHz"];

  const handleGainChange = (index: number, val: number) => {
    const nextGains = [...gains];
    nextGains[index] = val;
    setAudioSettings({ eqGains: nextGains, isEqEnabled: true });
  };

  const handleResetEq = () => {
    setAudioSettings({ eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
  };

  return (
    <div className="flex flex-col h-full w-full bg-audiophile-surface select-none font-sans overflow-hidden text-xs">
      <div className="p-2 border-b border-audiophile-border bg-audiophile-surface2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Sliders size={12} style={{ color: appearance.accentColor }} />
          <span className="font-mono text-[10px] uppercase tracking-wider text-audiophile-muted">
            Ecualizador Gráfico (10 Bandas)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAudioSettings({ isXdssEnabled: !isXdssEnabled })}
            className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold border transition ${
              isXdssEnabled
                ? "bg-amber-950/60 border-amber-600 text-amber-300"
                : "bg-slate-900 border-slate-700 text-slate-400"
            }`}
          >
            ⚡ XDSS Dynamic
          </button>

          <button
            onClick={() => setAudioSettings({ isEqEnabled: !isEqEnabled })}
            className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold border transition ${
              isEqEnabled
                ? "border-cyan-500 bg-cyan-950/60 text-cyan-300"
                : "border-slate-700 bg-slate-900 text-slate-400"
            }`}
          >
            {isEqEnabled ? "EQ ON" : "EQ BYPASS"}
          </button>

          <button
            onClick={handleResetEq}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
            title="Restablecer a 0 dB"
          >
            <RotateCcw size={11} />
          </button>
        </div>
      </div>

      <div className="flex-1 p-3 flex items-center justify-between gap-1 overflow-x-auto custom-scrollbar bg-slate-950/30">
        {freqs.map((freq, idx) => {
          const gain = gains[idx] || 0;
          const isBoost = gain > 0;
          const isCut = gain < 0;
          const accent = appearance.accentColor;

          return (
            <div key={freq} className="flex-1 min-w-[28px] flex flex-col items-center gap-1.5 h-full justify-center group">
              <span
                className={`font-mono text-[9px] transition-colors leading-none ${
                  isBoost
                    ? "font-bold text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.7)]"
                    : isCut
                    ? "text-rose-400 font-medium"
                    : "text-slate-500"
                }`}
                style={{
                  color: isBoost ? accent : undefined,
                  textShadow: isBoost ? `0 0 6px ${accent}` : undefined,
                }}
              >
                {gain > 0 ? `+${gain.toFixed(0)}` : gain.toFixed(0)}
              </span>

              <div className="relative flex-1 flex items-center justify-center w-full py-1">
                {(() => {
                  const pct = Math.max(0, Math.min(100, ((gain + 12) / 24) * 100));
                  const alphaIntensity = Math.max(0.25, pct / 100);

                  return (
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="0.5"
                      value={gain}
                      onChange={(e) => handleGainChange(idx, parseFloat(e.target.value))}
                      className="eq-pocket-vertical-fill z-10 h-full cursor-pointer"
                      style={{
                        background: pct > 0
                          ? `linear-gradient(to top, ${accent}25 0%, ${accent}85 ${pct * 0.7}%, ${accent} ${pct}%, rgba(15, 23, 42, 0.95) ${pct}%, rgba(15, 23, 42, 0.95) 100%)`
                          : `linear-gradient(to top, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)`,
                        boxShadow: pct > 0
                          ? `inset 0 1px 3px rgba(0,0,0,0.85), 0 0 ${Math.round(4 + alphaIntensity * 8)}px ${accent}45`
                          : `inset 0 1px 3px rgba(0,0,0,0.85)`,
                      }}
                      title={`${freq}: ${gain > 0 ? "+" : ""}${gain} dB`}
                    />
                  );
                })()}
              </div>

              <span
                className="font-mono text-[9px] font-bold truncate transition-colors"
                style={{
                  color: isBoost ? accent : "#94a3b8",
                }}
              >
                {freq}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
