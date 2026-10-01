import React, { useEffect, useRef, useState, useCallback } from "react";
import type { BufferTelemetry } from "../../types/index.ts";
import { onBufferTelemetry, setAudioBufferSize, getBufferTelemetry } from "../../services/api.ts";
import { useMusicStore } from "../../store/index.ts";
import { isStreamTrack } from "../../lib/streamTracks.ts";
import { radioAudioService } from "../../services/radioAudioService.ts";
import { formatDataSizeParts } from "../../lib/formatBytes.ts";
import {
  Sliders,
} from "lucide-react";

const BUFFER_SIZES = [64, 128, 256, 512, 1024];
const HISTORY_LENGTH = 300; // 30 seconds at 10 Hz (100ms)

interface BufferInspectorWidgetProps {
  showStability?: boolean;
  compactStability?: boolean;
}

export const BufferInspectorWidget: React.FC<BufferInspectorWidgetProps> = ({
  showStability = true,
  compactStability = false,
}) => {
  const { appearance, activeRadioStation, isRadioPlaying, isPlaying, currentTrack } = useMusicStore();
  const [telemetry, setTelemetry] = useState<BufferTelemetry>({
    buffer_capacity_frames: 88200,
    buffer_fill_frames: 0,
    buffer_fill_percent: 0,
    hardware_buffer_frames: 512,
    sample_rate: 44100,
    channels: 2,
    latency_ms: 11.61,
    underruns: 0,
    overruns: 0,
    total_xruns: 0,
    io_read_time_ms: 0,
    is_network_mount: false,
    is_active: false,
  });

  const [selectedBufferSize, setSelectedBufferSize] = useState<number>(512);
  const [isChangingBuffer, setIsChangingBuffer] = useState(false);
  // Theme mode: "app" (Application dynamic theme & accent, default) vs "dsp" (Nerd phosphor green)
  // Phosphor/DSP theme is secondary – always start in app mode; double-click to toggle
  const [themeMode, setThemeMode] = useState<"dsp" | "app">("app");

  // Radio playback: the local hi-fi hardware buffer is idle while listening to radio, so the
  // Ring Buffer Fill / I/O Read Time boxes (and the two visualizations) get repurposed to show
  // real network throughput/session usage instead of frozen local-playback numbers.
  const isRadioMode = Boolean(isRadioPlaying && activeRadioStation);
  const isStreamMode = Boolean(isStreamTrack(currentTrack) && isPlaying && !isRadioMode);
  const isNetworkMode = isRadioMode || isStreamMode;
  const networkName = isRadioMode
    ? activeRadioStation?.name || "Radio online"
    : isStreamMode
      ? currentTrack?.title || "Stream Music"
      : "";
  const [radioBytesPerSecond, setRadioBytesPerSecond] = useState(0);
  const [radioSessionBytes, setRadioSessionBytes] = useState(0);
  const [radioIsRealUsage, setRadioIsRealUsage] = useState(false);

  // Canvas ref for high-frequency 10 Hz latency graph rendering (isolated from React tree)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const latencyHistoryRef = useRef<number[]>(new Array(HISTORY_LENGTH).fill(11.61));
  const radioThroughputHistoryRef = useRef<number[]>(new Array(HISTORY_LENGTH).fill(0));

  // Redraw canvas graph
  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const history = isNetworkMode ? radioThroughputHistoryRef.current : latencyHistoryRef.current;

    ctx.clearRect(0, 0, width, height);

    const isDsp = themeMode === "dsp";
    const lineColor = isDsp ? "#22c55e" : appearance.accentColor || "#06b6d4";
    const gridColor = isDsp ? "rgba(34, 197, 94, 0.08)" : "rgba(255, 255, 255, 0.06)";

    // Grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let y = 10; y < height; y += 15) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    for (let x = 0; x < width; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    if (history.length < 2) return;

    // Determine scale min and max
    let minLat = Math.min(...history);
    let maxLat = Math.max(...history);
    if (maxLat - minLat < 4) {
      minLat = Math.max(0, minLat - 2);
      maxLat = maxLat + 2;
    }

    const range = maxLat - minLat || 1;

    // Draw line
    ctx.beginPath();
    history.forEach((val, i) => {
      const x = (i / (HISTORY_LENGTH - 1)) * width;
      const normalized = (val - minLat) / range;
      const y = height - normalized * (height - 8) - 4;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Area fill gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    if (isDsp) {
      gradient.addColorStop(0, "rgba(34, 197, 94, 0.25)");
      gradient.addColorStop(1, "rgba(34, 197, 94, 0.0)");
    } else {
      gradient.addColorStop(0, `${lineColor}40`);
      gradient.addColorStop(1, "rgba(0, 0, 0, 0.0)");
    }

    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Latest value dot
    const latestVal = history[history.length - 1];
    const latestNorm = (latestVal - minLat) / range;
    const dotY = height - latestNorm * (height - 8) - 4;
    ctx.beginPath();
    ctx.arc(width - 2, dotY, 3, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
    ctx.shadowBlur = 6;
    ctx.shadowColor = lineColor;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [themeMode, appearance.accentColor, isNetworkMode]);

  // Track real radio network throughput/session usage, feeding the same history buffer used
  // by the latency graph so Ring Buffer Capacity / Latency Stability stay useful during radio
  useEffect(() => {
    const unsub = radioAudioService.subscribe((playbackState) => {
      const bps = playbackState.status === "playing" ? playbackState.bytesPerSecond || 0 : 0;
      setRadioBytesPerSecond(bps);
      setRadioSessionBytes(playbackState.sessionBytesTotal || 0);
      setRadioIsRealUsage(Boolean(playbackState.isRealDataUsage));

      const hist = radioThroughputHistoryRef.current;
      hist.shift();
      hist.push(bps / 1024);
      if (isNetworkMode) drawGraph();
    });
    return () => unsub();
  }, [isNetworkMode, drawGraph]);

  // Subscribe to backend 100ms buffer-telemetry event
  useEffect(() => {
    getBufferTelemetry()
      .then((init) => {
        setTelemetry(init);
        setSelectedBufferSize(init.hardware_buffer_frames);
        latencyHistoryRef.current.fill(init.latency_ms);
      })
      .catch((err) => console.error("Error fetching initial buffer telemetry:", err));

    let unlisten: (() => void) | null = null;
    let mounted = true;

    onBufferTelemetry((data) => {
      if (!mounted) return;
      setTelemetry(data);
      const hist = latencyHistoryRef.current;
      hist.shift();
      hist.push(data.latency_ms);
      drawGraph();
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => console.error("Failed to register buffer-telemetry listener:", err));

    return () => {
      mounted = false;
      if (unlisten) unlisten();
    };
  }, [drawGraph]);

  // Canvas resize sync
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * (window.devicePixelRatio || 1);
      canvas.height = rect.height * (window.devicePixelRatio || 1);
      drawGraph();
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawGraph]);

  const handleBufferSizeChange = async (newSize: number) => {
    if (isChangingBuffer || newSize === telemetry.hardware_buffer_frames) return;
    setIsChangingBuffer(true);
    try {
      const confirmed = await setAudioBufferSize(newSize);
      setSelectedBufferSize(confirmed);
    } catch (e) {
      console.error("Failed to change buffer size:", e);
    } finally {
      setIsChangingBuffer(false);
    }
  };

  const isDsp = themeMode === "dsp";
  const SEGMENTS_COUNT = 100;
  // While listening to radio, normalize live throughput against the station's expected bitrate
  // (falling back to a 320kbps reference) so the segmented meter still reflects real activity
  const radioExpectedBps =
    isStreamMode && currentTrack?.bitrate_kbps
      ? (currentTrack.bitrate_kbps * 1000) / 8
      : activeRadioStation?.bitrate && activeRadioStation.bitrate > 0
        ? (activeRadioStation.bitrate * 1000) / 8
        : 40 * 1024;
  const radioFillPercent = radioExpectedBps > 0 ? Math.min(100, (radioBytesPerSecond / radioExpectedBps) * 100) : 0;
  const displayFillPercent = isNetworkMode ? radioFillPercent : telemetry.buffer_fill_percent;
  const sessionDataParts = formatDataSizeParts(radioSessionBytes);
  const activeSegments = Math.min(
    SEGMENTS_COUNT,
    Math.max(0, Math.round((displayFillPercent / 100) * SEGMENTS_COUNT))
  );

  return (
    <div
      onDoubleClick={() => setThemeMode((m) => (m === "dsp" ? "app" : "dsp"))}
      title="Doble clic para cambiar entre tema de la aplicación y tema de fósforo"
      className={`flex flex-col h-full text-xs p-3 overflow-y-auto select-none rounded-sm transition-colors cursor-pointer ${
        isDsp
          ? "bg-[#0a0c0e] text-[#22c55e] font-mono border border-emerald-950/40 shadow-inner"
          : "bg-audiophile-surface text-audiophile-text border border-audiophile-border shadow-sm font-sans"
      }`}
    >
      {/* Main Grid: Meters & Readouts (3 columns: Latency, Ring Buffer Fill, I/O Time) */}
      <div className="grid grid-cols-3 gap-2 mb-3 min-h-[96px]">
        {/* Latency Digital Meter */}
        <div
          className={`p-2.5 rounded-sm relative overflow-hidden flex flex-col justify-between min-w-0 border ${
            isDsp
              ? "bg-[#0f1412] border-emerald-900/50"
              : "bg-audiophile-surface2/60 border-slate-600/35"
          }`}
        >
          <div
            className={`text-[10px] uppercase tracking-wider font-semibold ${
              isDsp ? "text-emerald-600" : "text-audiophile-muted"
            }`}
          >
            Latency
          </div>
          <div className="flex items-baseline gap-1 my-1">
            <span
              className={`text-2xl font-bold tracking-tighter font-mono ${
                isDsp
                  ? "text-emerald-300 drop-shadow-[0_0_8px_rgba(34,197,94,0.4)]"
                  : "text-audiophile-text"
              }`}
              style={{ color: !isDsp ? appearance.accentColor : undefined }}
            >
              {telemetry.latency_ms.toFixed(2)}
            </span>
            <span className={`text-[10px] font-semibold ${isDsp ? "text-emerald-600" : "text-audiophile-muted"}`}>
              ms
            </span>
          </div>
          <div className="text-[9px] text-neutral-500 font-mono">
            {telemetry.hardware_buffer_frames} frames @ {telemetry.sample_rate / 1000} kHz
          </div>
        </div>

        {/* Ring Buffer Fill */}
        <div
          className={`p-2.5 rounded-sm flex flex-col justify-between min-w-0 overflow-hidden border ${
            isDsp
              ? "bg-[#0f1412] border-emerald-900/50"
              : "bg-audiophile-surface2/60 border-slate-600/35"
          }`}
        >
          <div
            className={`text-[10px] uppercase tracking-wider font-semibold ${
              isDsp ? "text-emerald-600" : "text-audiophile-muted"
            }`}
          >
            {isNetworkMode ? (radioIsRealUsage ? "Descarga en vivo" : "Descarga (estimado)") : "Ring Buffer Fill"}
          </div>
          <div className="flex items-baseline gap-1 my-1">
            <span
              className={`text-2xl font-bold tracking-tighter font-mono ${
                isNetworkMode
                  ? "text-white"
                  : isDsp
                  ? "text-emerald-300 drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]"
                  : "text-audiophile-text"
              }`}
            >
            {isNetworkMode
              ? (radioBytesPerSecond / 1024).toFixed(1)
              : telemetry.buffer_fill_percent.toFixed(1)}
            </span>
            <span className={`text-[10px] font-semibold ${isDsp ? "text-emerald-600" : "text-audiophile-muted"}`}>
              {isNetworkMode ? "KB/s" : "%"}
            </span>
          </div>
          <div className="text-[9px] text-neutral-500 font-mono truncate min-w-0" title={isNetworkMode ? networkName : undefined}>
            {isNetworkMode
              ? networkName
              : `${telemetry.buffer_fill_frames.toLocaleString()} / ${telemetry.buffer_capacity_frames.toLocaleString()} f`}
          </div>
        </div>

        {/* I/O Packet Read Latency (Network Mount Detection) */}
        <div
          className={`p-2.5 rounded-sm flex flex-col justify-between min-w-0 overflow-hidden border ${
            isDsp
              ? "bg-[#0f1412] border-emerald-900/50"
              : "bg-audiophile-surface2/60 border-slate-600/35"
          }`}
        >
          <div
            className={`text-[10px] uppercase tracking-wider font-semibold ${
              isDsp ? "text-emerald-600" : "text-audiophile-muted"
            }`}
          >
            {isNetworkMode ? "Acumulado sesión" : "I/O Read Time"}
          </div>
          <div className="flex items-baseline gap-1 my-1">
            {isNetworkMode ? (
              <>
                <span
                  className={`text-2xl font-bold tracking-tighter font-mono ${
                    isDsp ? "text-emerald-300 drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]" : "text-audiophile-text"
                  }`}
                >
                  {sessionDataParts.value}
                </span>
                <span className={`text-[10px] font-semibold ${isDsp ? "text-emerald-600" : "text-audiophile-muted"}`}>
                  {sessionDataParts.unit}
                </span>
              </>
            ) : (
              <>
            <span
              className={`text-2xl font-bold tracking-tighter font-mono ${
                telemetry.io_read_time_ms > 15
                  ? "text-amber-400"
                  : telemetry.is_network_mount
                  ? "text-cyan-300 drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]"
                  : isDsp
                  ? "text-emerald-300"
                  : "text-audiophile-text"
              }`}
            >
              {telemetry.io_read_time_ms.toFixed(2)}
            </span>
            <span className={`text-[10px] font-semibold ${isDsp ? "text-emerald-600" : "text-audiophile-muted"}`}>
              ms
            </span>
              </>
            )}
          </div>
          <div className="text-[9px] flex items-center gap-1 font-mono">
            {isNetworkMode ? (
              <span className={`text-[8px] font-semibold uppercase ${isDsp ? "text-emerald-500" : "text-audiophile-muted"}`}>
                {isRadioMode ? "Radio" : "Stream"}
                {radioIsRealUsage ? " · medido" : " · estimado"}
              </span>
            ) : (
            <span
              className={`px-1 py-0.2 rounded text-[8px] font-semibold uppercase ${
                telemetry.is_network_mount
                  ? "bg-cyan-950/80 text-cyan-300 border border-cyan-800/60"
                  : isDsp
                  ? "bg-emerald-950/60 text-emerald-400"
                  : "bg-audiophile-base text-audiophile-muted"
              }`}
            >
              {telemetry.is_network_mount ? "NETWORK (NFS/SMB)" : "LOCAL NVMe/SSD"}
            </span>
            )}
          </div>
        </div>
      </div>

      {/* Segmented LED Visual Meter (Ring Buffer Fill) */}
      <div
        className={`p-2.5 rounded-sm mb-3 border ${
          isDsp ? "bg-[#0c100e] border-emerald-950" : "bg-audiophile-surface2/40 border-slate-600/35"
        }`}
      >
        <div className="flex justify-between items-center text-[10px] mb-1.5 font-mono">
          <span
            className={`tracking-widest uppercase font-semibold flex items-center gap-1 ${
              isDsp ? "text-emerald-500" : "text-audiophile-text"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${isDsp ? "bg-emerald-500" : ""}`}
              style={{ backgroundColor: !isDsp ? appearance.accentColor : undefined }}
            />
            {isNetworkMode ? (isStreamMode ? "STREAM EN VIVO" : "DESCARGA EN VIVO") : "RING BUFFER CAPACITY"}
          </span>
          <span
            className={`font-mono font-bold ${isDsp ? "text-emerald-400" : ""}`}
            style={{ color: !isDsp ? appearance.accentColor : undefined }}
          >
            {displayFillPercent.toFixed(1)}%
          </span>
        </div>

        {/* 100-column segmented bar */}
        <div
          className={`grid gap-[1px] h-3.5 p-1 rounded-sm border ${
            isDsp ? "bg-black/60 border-emerald-950" : "bg-black/40 border-slate-600/25"
          }`}
          style={{ gridTemplateColumns: `repeat(${SEGMENTS_COUNT}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: SEGMENTS_COUNT }).map((_, idx) => {
            const isActive = idx < activeSegments;
            let segmentStyle: React.CSSProperties = {};
            let segmentClass = isDsp ? "bg-emerald-950/30" : "bg-neutral-800/40";

            if (isActive) {
              if (isDsp) {
                if (idx < 75) {
                  segmentClass = "bg-emerald-500 shadow-[0_0_4px_#10b981]";
                } else if (idx < 90) {
                  segmentClass = "bg-amber-400 shadow-[0_0_4px_#f59e0b]";
                } else {
                  segmentClass = "bg-red-500 shadow-[0_0_4px_#ef4444]";
                }
              } else {
                if (idx < 75) {
                  segmentClass = "shadow-sm";
                  segmentStyle = { backgroundColor: appearance.accentColor };
                } else if (idx < 90) {
                  segmentClass = "bg-amber-400 shadow-[0_0_4px_#f59e0b]";
                } else {
                  segmentClass = "bg-rose-500 shadow-[0_0_4px_#f43f5e]";
                }
              }
            }

            return (
              <div
                key={idx}
                className={`h-full rounded-3xs transition-all duration-75 ${segmentClass}`}
                style={segmentStyle}
              />
            );
          })}
        </div>

      </div>

      {/* Grouped container: Latency Stability + Hardware Audio Buffer Size */}
      <div
        className={`rounded-sm border flex flex-col gap-2.5 p-2.5 ${
          isDsp
            ? "bg-[#0b0e0d] border-emerald-900/40"
            : "bg-audiophile-surface2/30 border-slate-600/35"
        }`}
      >
      {/* 30-Second Latency Stability History (Direct Canvas Rendering) */}
      {showStability && <div
        className={`flex flex-col ${compactStability ? "h-[55px] min-h-[55px] shrink-0" : "flex-1 min-h-[110px]"}`}
      >
        <div
          className={`flex justify-between items-center text-[10px] mb-1 font-mono ${
            isDsp ? "text-emerald-500" : "text-audiophile-muted"
          }`}
        >
          <span className="font-semibold uppercase tracking-wider">
            {isNetworkMode
              ? isStreamMode
                ? "STREAM THROUGHPUT (ÚLTIMOS 30s)"
                : "DESCARGA EN VIVO (ÚLTIMOS 30s)"
              : "LATENCY STABILITY (LAST 30s @ 10Hz)"}
          </span>
          <span className="text-[9px] text-neutral-500">
            Current:{" "}
            <span
              className={`font-bold ${isDsp ? "text-emerald-300" : "text-audiophile-text"}`}
              style={{ color: !isDsp ? appearance.accentColor : undefined }}
            >
              {isNetworkMode ? `${(radioBytesPerSecond / 1024).toFixed(0)} KB/s` : `${telemetry.latency_ms.toFixed(2)} ms`}
            </span>
          </span>
        </div>
        <div className={`flex-1 w-full relative ${compactStability ? "min-h-[35px]" : "min-h-[70px]"}`}>
          <canvas
            ref={canvasRef}
            className={`w-full h-full block rounded-xs ${
              isDsp ? "bg-[#080b0a]" : "bg-black/30"
            }`}
          />
        </div>
      </div>}

      {/* Interactive Hardware Buffer Size Selector */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div
            className={`flex items-center gap-1.5 text-[10px] uppercase font-semibold font-mono ${
              isDsp ? "text-emerald-400" : "text-audiophile-text"
            }`}
          >
            <Sliders className={`w-3.5 h-3.5 ${isDsp ? "text-emerald-500" : "text-audiophile-cyan"}`} />
            Hardware Audio Buffer Size (Frames)
          </div>
          <span className="text-[10px] text-neutral-500 font-mono">
            Selected:{" "}
            <strong
              className={isDsp ? "text-emerald-300" : "text-audiophile-text font-bold"}
              style={{ color: !isDsp ? appearance.accentColor : undefined }}
            >
              {selectedBufferSize} frames
            </strong>{" "}
            ({((selectedBufferSize / (telemetry.sample_rate || 44100)) * 1000).toFixed(2)} ms)
          </span>
        </div>

        {/* Step buttons for precise frame sizes */}
        <div className="grid grid-cols-5 gap-1.5">
          {BUFFER_SIZES.map((size) => {
            const isSelected = selectedBufferSize === size;
            const latencyForSize = ((size / (telemetry.sample_rate || 44100)) * 1000).toFixed(1);
            return (
              <button
                key={size}
                disabled={isChangingBuffer}
                onClick={() => handleBufferSizeChange(size)}
                className={`py-1 px-2 rounded-xs border text-center transition-all flex flex-col items-center ${
                  isSelected
                    ? isDsp
                      ? "bg-emerald-500/20 border-emerald-400 text-emerald-200 font-bold shadow-[0_0_8px_rgba(34,197,94,0.3)]"
                      : "bg-audiophile-surface border-audiophile-cyan text-audiophile-text font-bold shadow-sm"
                    : isDsp
                    ? "bg-[#0a0d0c] border-emerald-950 text-neutral-400 hover:border-emerald-700 hover:text-emerald-300"
                    : "bg-audiophile-base border-slate-600/45 text-audiophile-muted hover:text-audiophile-text"
                } ${isChangingBuffer ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                style={
                  isSelected && !isDsp
                    ? { borderColor: appearance.accentColor, color: appearance.accentColor }
                    : undefined
                }
              >
                <span className="text-xs font-mono">{size}</span>
                <span className="text-[8px] opacity-70">{latencyForSize} ms</span>
              </button>
            );
          })}
        </div>

        {isChangingBuffer && (
          <div className="mt-2 text-[8px] text-amber-400 animate-pulse font-semibold font-mono text-right">
            Reconfigurando stream ALSA/CPAL...
          </div>
        )}
      </div>
      </div>{/* end grouped Latency + Buffer container */}
    </div>
  );
};
