import React, { useState } from "react";
import { AudioLines, Power, ShieldCheck } from "lucide-react";
import { useMusicStore } from "../../store/index.ts";

export const LoudnessWidget: React.FC = () => {
  const { audioSettings, setAudioSettings, telemetry, appearance } = useMusicStore();
  const enabled = audioSettings.isNormalizerEnabled;
  const [targetLufs, setTargetLufs] = useState(-14);
  const [truePeak, setTruePeak] = useState(-1.5);
  const [lra, setLra] = useState(11);
  const parameters = [
    { label: "Target LUFS", value: targetLufs, min: -23, max: -9, step: 0.5, unit: "LUFS", set: setTargetLufs },
    { label: "True Peak", value: truePeak, min: -9, max: 0, step: 0.5, unit: "dBTP", set: setTruePeak },
    { label: "Rango LRA", value: lra, min: 1, max: 20, step: 0.5, unit: "LU", set: setLra },
  ];

  return (
    <div className="flex h-full min-h-[170px] min-w-0 flex-col overflow-hidden bg-audiophile-surface font-mono">
      <header className="flex shrink-0 items-center justify-between border-b border-audiophile-border px-2.5 py-1.5">
        <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-audiophile-muted">
          <AudioLines size={12} style={{ color: appearance.accentColor }} /> Loudness Normalizer
        </span>
        <button
          type="button"
          title={enabled ? "Desactivar normalizador" : "Activar normalizador"}
          aria-label={enabled ? "Desactivar normalizador" : "Activar normalizador"}
          aria-pressed={enabled}
          onClick={() => setAudioSettings({ isNormalizerEnabled: !enabled })}
          className={`grid size-6 place-items-center border ${enabled ? "border-emerald-500/60 text-emerald-300" : "border-slate-700 text-slate-500"}`}
        >
          <Power size={12} />
        </button>
      </header>
      <div className={`grid min-h-0 flex-1 grid-cols-3 gap-2 px-2.5 py-2 ${enabled ? "" : "pointer-events-none opacity-40"}`}>
        {parameters.map((parameter) => (
          <label key={parameter.label} className="flex min-w-0 flex-col justify-center gap-1">
            <span className="truncate text-[8px] uppercase text-audiophile-muted">{parameter.label}</span>
            <span className="truncate text-[11px] font-bold" style={{ color: appearance.accentColor }}>
              {parameter.value > 0 ? "+" : ""}{parameter.value} {parameter.unit}
            </span>
            <input
              aria-label={parameter.label}
              type="range"
              min={parameter.min}
              max={parameter.max}
              step={parameter.step}
              value={parameter.value}
              onChange={(event) => parameter.set(Number(event.target.value))}
              className="w-full cursor-pointer"
              style={{ accentColor: appearance.accentColor }}
            />
          </label>
        ))}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-audiophile-border px-2.5 py-1.5 text-[8px] text-slate-500">
        <span className="flex min-w-0 items-center gap-1 truncate"><ShieldCheck size={10} /> EBU R128 · control true-peak</span>
        <span className="shrink-0">{telemetry.state}</span>
      </footer>
    </div>
  );
};