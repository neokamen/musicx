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
                {/* 3D Hardware slot with inset depth */}
                <div className="absolute inset-y-1 w-2.5 rounded-full bg-slate-950 border border-slate-800/90 shadow-[inset_0_2px_4px_rgba(0,0,0,0.95)] overflow-hidden">
                  {/* Subtle 0 dB reference line */}
                  <div className="absolute top-1/2 left-0 right-0 h-[1.5px] bg-slate-600/80 -translate-y-1/2 z-0" />

                  {/* Reactive illuminated LED fill underneath the boosted zone */}
                  {isBoost && (
                    <div
                      className="absolute bottom-1/2 left-0.5 right-0.5 rounded-t-sm transition-all pointer-events-none"
                      style={{
                        height: `${(gain / 12) * 50}%`,
                        background: `linear-gradient(to top, ${accent}30 0%, ${accent}85 100%)`,
                        boxShadow: `0 0 8px ${accent}60`,
                      }}
                    />
                  )}

                  {/* Reactive illuminated LED fill for cut zone */}
                  {isCut && (
                    <div
                      className="absolute top-1/2 left-0.5 right-0.5 rounded-b-sm transition-all pointer-events-none"
                      style={{
                        height: `${(Math.abs(gain) / 12) * 50}%`,
                        background: `linear-gradient(to bottom, rgba(244,63,94,0.3) 0%, rgba(244,63,94,0.8) 100%)`,
                        boxShadow: `0 0 6px rgba(244,63,94,0.5)`,
                      }}
                    />
                  )}
                </div>

                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={gain}
                  onChange={(e) => handleGainChange(idx, parseFloat(e.target.value))}
                  className="eq-pocket-vertical relative z-10 h-full w-5 cursor-pointer"
                  title={`${freq}: ${gain > 0 ? "+" : ""}${gain} dB`}
                />
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
