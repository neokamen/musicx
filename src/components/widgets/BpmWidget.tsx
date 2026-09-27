import React, { useEffect, useRef, useState } from "react";
import { Activity, Music2 } from "lucide-react";
import { useMusicStore } from "../../store/index.ts";

export const BpmWidget: React.FC = () => {
  const { telemetry, isPlaying, appearance } = useMusicStore();
  const [manualBpm, setManualBpm] = useState<number | null>(null);
  const tapTimes = useRef<number[]>([]);
  const detectedBpm = telemetry.tempo_bpm && telemetry.tempo_confidence >= 0.12
    ? Math.round(telemetry.tempo_bpm)
    : null;
  const bpm = manualBpm ?? detectedBpm;

  useEffect(() => {
    tapTimes.current = [];
    setManualBpm(null);
  }, [telemetry.filepath]);

  const handleTapTempo = () => {
    const now = performance.now();
    const previousTap = tapTimes.current[tapTimes.current.length - 1];
    tapTimes.current = !previousTap || now - previousTap > 2200
      ? [now]
      : [...tapTimes.current.slice(-5), now];
    if (tapTimes.current.length < 3) return;
    const intervals = tapTimes.current.slice(1)
      .map((tap, index) => tap - tapTimes.current[index])
      .sort((left, right) => left - right);
    const medianInterval = intervals[Math.floor(intervals.length / 2)];
    setManualBpm(Math.round(Math.max(40, Math.min(240, 60000 / medianInterval))));
  };

  return (
    <button type="button" onClick={handleTapTempo} title="Toca al ritmo para ajustar el BPM manualmente" className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-3 bg-audiophile-surface p-4 text-center">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-audiophile-muted">
        <Music2 size={14} style={{ color: appearance.accentColor }} />
        BPM
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-5xl font-bold tabular-nums text-audiophile-text" style={{ color: appearance.accentColor }}>
          {bpm ?? "--"}
        </span>
        <span className="text-xs font-mono text-audiophile-muted">BPM</span>
      </div>
      <Activity size={14} className={isPlaying && bpm ? "animate-pulse text-emerald-400" : "text-audiophile-muted/50"} />
    </button>
  );
};