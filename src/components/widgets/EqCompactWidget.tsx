import React from "react";
import { Layers, Power, RotateCcw, Zap } from "lucide-react";
import { SOUNDIX_PRESETS } from "../audio/AudioEQModal.tsx";
import { useMusicStore } from "../../store/index.ts";

const FREQUENCIES = ["32", "64", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];

export const EqCompactWidget: React.FC = () => {
  const { audioSettings, setAudioSettings, appearance } = useMusicStore();
  const accent = appearance.accentColor || "#06b6d4";
  const gains = audioSettings.eqGains || Array(10).fill(0);
  const activePreset =
    SOUNDIX_PRESETS.find((preset) => preset.gains.every((gain, index) => gain === gains[index]))
      ?.name || "Personalizado";

  const updateGain = (index: number, value: number) => {
    const next = [...gains];
    next[index] = Math.round(value * 10) / 10;
    setAudioSettings({ eqGains: next, isEqEnabled: true });
  };

  const updateSetting = (
    key: "eqSubBoost" | "eqBassBoost" | "eqHighpass" | "eqLowpass",
    value: number
  ) => {
    setAudioSettings({ [key]: value });
  };

  const applyPreset = (name: string) => {
    const preset = SOUNDIX_PRESETS.find((item) => item.name === name);
    if (!preset) return;
    setAudioSettings({ eqGains: [...preset.gains], isEqEnabled: true });
    if (preset.sub !== undefined || preset.bass !== undefined) {
      setAudioSettings({
        eqSubBoost: preset.sub ?? audioSettings.eqSubBoost,
        eqBassBoost: preset.bass ?? audioSettings.eqBassBoost,
      });
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-auto bg-audiophile-surface font-mono text-xs select-none">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 border-b border-audiophile-border px-2.5 py-1.5 bg-slate-950/40">
        <span
          className="truncate text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
          style={{ color: accent }}
        >
          <span className="size-1.5 rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 6px ${accent}` }} />
          EQ PRO
        </span>

        <select
          aria-label="Preset de ecualizador"
          value={activePreset}
          onChange={(event) => applyPreset(event.target.value)}
          className="min-w-0 border border-slate-700/80 bg-slate-900/90 rounded px-1.5 py-0.5 text-[9px] text-slate-200 outline-none cursor-pointer focus:border-cyan-500"
          style={{ colorScheme: "dark" }}
        >
          {activePreset === "Personalizado" && <option value="Personalizado">Personalizado</option>}
          {SOUNDIX_PRESETS.map((preset) => (
            <option key={preset.name} value={preset.name}>
              {preset.name}
            </option>
          ))}
        </select>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title={audioSettings.isEqEnabled ? "Desactivar EQ" : "Activar EQ"}
            aria-label={audioSettings.isEqEnabled ? "Desactivar EQ" : "Activar EQ"}
            onClick={() => setAudioSettings({ isEqEnabled: !audioSettings.isEqEnabled })}
            className={`grid size-5 place-items-center rounded border transition cursor-pointer ${
              audioSettings.isEqEnabled
                ? "bg-emerald-950/60 border-emerald-500/80 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                : "border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-200"
            }`}
          >
            <Power size={11} />
          </button>
          <button
            type="button"
            title={audioSettings.isXdssEnabled ? "Desactivar XDSS" : "Activar XDSS"}
            aria-label={audioSettings.isXdssEnabled ? "Desactivar XDSS" : "Activar XDSS"}
            onClick={() => setAudioSettings({ isXdssEnabled: !audioSettings.isXdssEnabled })}
            className={`grid size-5 place-items-center rounded border transition cursor-pointer ${
              audioSettings.isXdssEnabled
                ? "border-amber-500/80 bg-amber-950/60 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.3)]"
                : "border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-200"
            }`}
          >
            <Zap size={11} />
          </button>
          <button
            type="button"
            title={audioSettings.isXtsProEnabled ? "Desactivar XTS" : "Activar XTS"}
            aria-label={audioSettings.isXtsProEnabled ? "Desactivar XTS" : "Activar XTS"}
            onClick={() => setAudioSettings({ isXtsProEnabled: !audioSettings.isXtsProEnabled })}
            className={`grid size-5 place-items-center rounded border transition cursor-pointer ${
              audioSettings.isXtsProEnabled
                ? "border-cyan-500/80 bg-cyan-950/60 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.3)]"
                : "border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-200"
            }`}
          >
            <Layers size={11} />
          </button>
          <button
            type="button"
            title="Restablecer todas las bandas a 0 dB"
            aria-label="Restablecer todas las bandas"
            onClick={() => setAudioSettings({ eqGains: Array(10).fill(0) })}
            className="grid size-5 place-items-center rounded border border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-200 transition cursor-pointer"
          >
            <RotateCcw size={11} />
          </button>
        </div>
      </header>

      {/* ── 10 Vertical Pro Faders ───────────────────────────────────────── */}
      <div className="grid shrink-0 grid-cols-10 gap-1 px-2 py-2 bg-gradient-to-b from-slate-950/30 to-transparent">
        {FREQUENCIES.map((frequency, index) => {
          const gain = gains[index] || 0;
          const isBoost = gain > 0;
          const isCut = gain < 0;

          return (
            <div key={frequency} className="flex min-w-0 flex-col items-center justify-between gap-1 group">
              {/* Numeric gain readout */}
              <span
                className={`h-3 text-[8.5px] font-mono leading-none tracking-tighter transition-all ${
                  isBoost
                    ? "font-bold text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.6)]"
                    : isCut
                    ? "text-rose-400/90 font-medium"
                    : "text-slate-500"
                }`}
                style={{
                  color: isBoost ? accent : undefined,
                  textShadow: isBoost ? `0 0 6px ${accent}` : undefined,
                }}
              >
                {isBoost ? `+${gain.toFixed(1)}` : gain.toFixed(1)}
              </span>

              {/* Fader Track & Channel Column */}
              <div className="relative h-18 w-5 flex items-center justify-center py-1">
                {(() => {
                  const pct = Math.max(0, Math.min(100, ((gain + 12) / 24) * 100));

                  return (
                    <input
                      aria-label={`${frequency} Hz, ${gain} dB`}
                      type="range"
                      min="-12"
                      max="12"
                      step="0.5"
                      value={gain}
                      onChange={(event) => updateGain(index, Number(event.target.value))}
                      className="eq-pocket-vertical-fill z-10 h-16 cursor-pointer"
                      style={{
                        background: isBoost
                          ? `linear-gradient(to top, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.95) 50%, ${accent}85 50%, ${accent} ${pct}%, rgba(15, 23, 42, 0.95) ${pct}%, rgba(15, 23, 42, 0.95) 100%)`
                          : isCut
                          ? `linear-gradient(to top, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.95) ${pct}%, rgba(244, 63, 94, 0.9) ${pct}%, rgba(244, 63, 94, 0.75) 50%, rgba(15, 23, 42, 0.95) 50%, rgba(15, 23, 42, 0.95) 100%)`
                          : `linear-gradient(to top, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)`,
                        boxShadow: isBoost
                          ? `inset 0 1px 3px rgba(0,0,0,0.85), 0 0 10px ${accent}35`
                          : isCut
                          ? `inset 0 1px 3px rgba(0,0,0,0.85), 0 0 8px rgba(244,63,94,0.3)`
                          : `inset 0 1px 3px rgba(0,0,0,0.85)`,
                      }}
                      title={`${frequency} Hz: ${gain > 0 ? "+" : ""}${gain} dB`}
                    />
                  );
                })()}
              </div>

              {/* Serigraphed frequency mark */}
              <span
                className="text-[8.5px] font-mono leading-none tracking-tight text-slate-400 group-hover:text-white transition-colors"
                style={{
                  color: isBoost ? accent : undefined,
                  opacity: isBoost ? 0.95 : 0.65,
                }}
              >
                {frequency}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── 4 Horizontal Sliders (Sub, Bass, Highpass, Lowpass) ─────────── */}
      <div className="grid shrink-0 grid-cols-2 gap-1.5 border-t border-slate-800/80 bg-slate-950/60 p-2">
        {[
          { key: "eqSubBoost" as const, label: "Sub Boost", min: -6, max: 12, step: 0.5, unit: "dB" },
          { key: "eqBassBoost" as const, label: "Bass Boost", min: -6, max: 12, step: 0.5, unit: "dB" },
          { key: "eqHighpass" as const, label: "Highpass", min: 0, max: 400, step: 5, unit: "Hz" },
          { key: "eqLowpass" as const, label: "Lowpass", min: 0, max: 22000, step: 500, unit: "Hz" },
        ].map(({ key, label, min, max, step, unit }) => {
          const value = audioSettings[key] || 0;
          const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
          const shownValue =
            key === "eqLowpass" && value >= 1000
              ? `${(value / 1000).toFixed(1)}k Hz`
              : value === 0 && (key === "eqHighpass" || key === "eqLowpass")
              ? "Off"
              : `${value > 0 && unit === "dB" ? "+" : ""}${value} ${unit}`;

          const isActive = value !== 0 && !(key === "eqLowpass" && value === 22000);

          return (
            <div
              key={key}
              className="min-w-0 rounded-lg border border-slate-800/70 bg-slate-900/60 p-1.5 flex flex-col justify-between shadow-sm transition hover:border-slate-700"
            >
              {/* Header: Label & Digital VFD readout */}
              <div className="flex items-center justify-between gap-1 text-[9px]">
                <span className="truncate text-slate-400 uppercase tracking-wider font-semibold">
                  {label}
                </span>
                <span
                  className="shrink-0 font-mono font-bold px-1.5 py-0.2 rounded text-[9px]"
                  style={{
                    color: isActive ? accent : "#94a3b8",
                    backgroundColor: isActive ? `${accent}15` : "rgba(15,23,42,0.6)",
                    border: `1px solid ${isActive ? `${accent}40` : "rgba(51,65,85,0.4)"}`,
                    boxShadow: isActive ? `0 0 6px ${accent}25` : undefined,
                  }}
                >
                  {shownValue}
                </span>
              </div>

              {/* Progress track with LED gradient & laser thumb */}
              <div className="relative mt-1.5 flex items-center">
                <input
                  aria-label={label}
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={value}
                  onChange={(event) => updateSetting(key, Number(event.target.value))}
                  className="eq-pocket-horizontal w-full cursor-pointer z-10"
                  style={{
                    background: `linear-gradient(to right, ${accent}80 0%, ${accent} ${pct}%, rgba(15, 23, 42, 0.9) ${pct}%, rgba(15, 23, 42, 0.9) 100%)`,
                    boxShadow: isActive ? `inset 0 1px 3px rgba(0,0,0,0.8), 0 0 8px ${accent}25` : undefined,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EqCompactWidget;