import React from "react";
import { Layers, Power, RotateCcw, Zap } from "lucide-react";
import { SOUNDIX_PRESETS } from "../audio/AudioEQModal.tsx";
import { useMusicStore } from "../../store/index.ts";

const FREQUENCIES = ["32", "64", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];

export const EqCompactWidget: React.FC = () => {
  const { audioSettings, setAudioSettings, appearance } = useMusicStore();
  const gains = audioSettings.eqGains || Array(10).fill(0);
  const activePreset = SOUNDIX_PRESETS.find((preset) => preset.gains.every((gain, index) => gain === gains[index]))?.name || "Personalizado";

  const updateGain = (index: number, value: number) => {
    const next = [...gains];
    next[index] = Math.round(value * 10) / 10;
    setAudioSettings({ eqGains: next, isEqEnabled: true });
  };

  const updateSetting = (key: "eqSubBoost" | "eqBassBoost" | "eqHighpass" | "eqLowpass", value: number) => {
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
      <header className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 border-b border-audiophile-border px-2 py-1.5">
        <span className="truncate text-[9px] font-bold uppercase tracking-wider" style={{ color: appearance.accentColor }}>EQ PRO</span>
        <select
          aria-label="Preset de ecualizador"
          value={activePreset}
          onChange={(event) => applyPreset(event.target.value)}
          className="min-w-0 border border-audiophile-border bg-audiophile-surface2 px-1.5 py-1 text-[9px] text-audiophile-text outline-none"
        >
          {activePreset === "Personalizado" && <option value="Personalizado">Personalizado</option>}
          {SOUNDIX_PRESETS.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
        </select>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            title={audioSettings.isEqEnabled ? "Desactivar EQ" : "Activar EQ"}
            aria-label={audioSettings.isEqEnabled ? "Desactivar EQ" : "Activar EQ"}
            onClick={() => setAudioSettings({ isEqEnabled: !audioSettings.isEqEnabled })}
            className={`grid size-5 place-items-center border ${audioSettings.isEqEnabled ? "text-emerald-300" : "text-slate-500 hover:text-slate-200"}`}
            style={{ borderColor: audioSettings.isEqEnabled ? appearance.accentColor : undefined }}
          >
            <Power size={11} />
          </button>
          <button
            type="button"
            title={audioSettings.isXdssEnabled ? "Desactivar XDSS" : "Activar XDSS"}
            aria-label={audioSettings.isXdssEnabled ? "Desactivar XDSS" : "Activar XDSS"}
            onClick={() => setAudioSettings({ isXdssEnabled: !audioSettings.isXdssEnabled })}
            className={`grid size-5 place-items-center border ${audioSettings.isXdssEnabled ? "border-amber-500/70 text-amber-300" : "border-slate-700 text-slate-500 hover:text-slate-200"}`}
          >
            <Zap size={11} />
          </button>
          <button
            type="button"
            title={audioSettings.isXtsProEnabled ? "Desactivar XTS" : "Activar XTS"}
            aria-label={audioSettings.isXtsProEnabled ? "Desactivar XTS" : "Activar XTS"}
            onClick={() => setAudioSettings({ isXtsProEnabled: !audioSettings.isXtsProEnabled })}
            className={`grid size-5 place-items-center border ${audioSettings.isXtsProEnabled ? "border-cyan-500/70 text-cyan-300" : "border-slate-700 text-slate-500 hover:text-slate-200"}`}
          >
            <Layers size={11} />
          </button>
          <button
            type="button"
            title="Restablecer todas las bandas"
            aria-label="Restablecer todas las bandas"
            onClick={() => setAudioSettings({ eqGains: Array(10).fill(0) })}
            className="grid size-5 place-items-center border border-slate-700 text-slate-500 hover:text-slate-200"
          >
            <RotateCcw size={11} />
          </button>
        </div>
      </header>
      <div className="grid min-h-[96px] shrink-0 grid-cols-10 gap-1 px-2 py-1.5">
        {FREQUENCIES.map((frequency, index) => {
          const gain = gains[index] || 0;
          return (
            <label key={frequency} className="flex min-w-0 flex-col items-center justify-center gap-1">
              <span className={`h-3 text-[8px] ${gain > 0 ? "text-cyan-300" : "text-slate-400"}`}>{gain > 0 ? "+" : ""}{gain.toFixed(1)}</span>
              <input
                aria-label={`${frequency} Hz, ${gain} dB`}
                type="range"
                min="-12"
                max="12"
                step="0.5"
                value={gain}
                onChange={(event) => updateGain(index, Number(event.target.value))}
                className="eq-bar-slider h-14 min-h-0 w-3 cursor-pointer"
                style={{
                  background: `linear-gradient(to top, ${appearance.accentColor} 0%, ${appearance.accentColor} ${((gain + 12) / 24) * 100}%, var(--app-surface2) ${((gain + 12) / 24) * 100}%, var(--app-surface2) 100%)`,
                }}
              />
              <span className="text-[8px] leading-none text-slate-500">{frequency}</span>
            </label>
          );
        })}
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-px border-t border-audiophile-border bg-audiophile-border">
        {[
          { key: "eqSubBoost" as const, label: "Sub Boost", min: -6, max: 12, step: 0.5, unit: "dB" },
          { key: "eqBassBoost" as const, label: "Bass Boost", min: -6, max: 12, step: 0.5, unit: "dB" },
          { key: "eqHighpass" as const, label: "Highpass", min: 0, max: 400, step: 5, unit: "Hz" },
          { key: "eqLowpass" as const, label: "Lowpass", min: 0, max: 22000, step: 500, unit: "Hz" },
        ].map(({ key, label, min, max, step, unit }) => {
          const value = audioSettings[key] || 0;
          const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
          const shownValue = key === "eqLowpass" && value >= 1000
            ? `${(value / 1000).toFixed(1)}k Hz`
            : value === 0 && (key === "eqHighpass" || key === "eqLowpass")
              ? "Off"
              : `${value > 0 && unit === "dB" ? "+" : ""}${value} ${unit}`;
          return (
            <label key={key} className="min-w-0 bg-audiophile-surface px-2 py-1.5 flex flex-col justify-center">
              <span className="flex items-center justify-between gap-1 text-[8px]">
                <span className="truncate text-audiophile-muted">{label}</span>
                <span className="shrink-0 text-audiophile-text font-bold" style={{ color: value !== 0 ? appearance.accentColor : undefined }}>{shownValue}</span>
              </span>
              <input
                aria-label={label}
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => updateSetting(key, Number(event.target.value))}
                className="eq-horizontal-slider mt-1 h-2.5 w-full cursor-pointer"
                style={{
                  background: `linear-gradient(to right, ${appearance.accentColor} 0%, ${appearance.accentColor} ${pct}%, var(--app-surface2) ${pct}%, var(--app-surface2) 100%)`,
                }}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
};