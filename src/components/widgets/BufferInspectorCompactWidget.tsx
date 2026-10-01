import React, { useEffect, useState } from "react";
import type { BufferTelemetry } from "../../types/index.ts";
import { onBufferTelemetry, setAudioBufferSize, getBufferTelemetry } from "../../services/api.ts";
import { useMusicStore } from "../../store/index.ts";
import { isStreamTrack } from "../../lib/streamTracks.ts";
import { radioAudioService } from "../../services/radioAudioService.ts";
import { formatDataSizeParts } from "../../lib/formatBytes.ts";
import { Sliders } from "lucide-react";

const BUFFER_SIZES = [64, 128, 256, 512, 1024];

export const BufferInspectorCompactWidget: React.FC = () => {
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

  // Radio mode: swap to a network-usage summary instead of frozen local-playback numbers
  const isRadioMode = Boolean(isRadioPlaying && activeRadioStation);
  const isStreamMode = Boolean(isPlaying && isStreamTrack(currentTrack));
  const isNetworkMode = isRadioMode || isStreamMode;
  const [radioBytesPerSecond, setRadioBytesPerSecond] = useState(0);
  const [radioSessionBytes, setRadioSessionBytes] = useState(0);
  const [radioIsRealUsage, setRadioIsRealUsage] = useState(false);

  useEffect(() => {
    const unsub = radioAudioService.subscribe((playbackState) => {
      setRadioBytesPerSecond(playbackState.status === "playing" ? playbackState.bytesPerSecond || 0 : 0);
      setRadioSessionBytes(playbackState.sessionBytesTotal || 0);
      setRadioIsRealUsage(Boolean(playbackState.isRealDataUsage));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    getBufferTelemetry()
      .then((init) => {
        setTelemetry(init);
        setSelectedBufferSize(init.hardware_buffer_frames);
      })
      .catch(console.error);

    let unlisten: (() => void) | null = null;
    let mounted = true;

    onBufferTelemetry((data) => {
      if (!mounted) return;
      setTelemetry(data);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(console.error);

    return () => {
      mounted = false;
      if (unlisten) unlisten();
    };
  }, []);

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

  const SEGMENTS_COUNT = 100;
  // While listening to radio, normalize live throughput against the station's expected bitrate
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
    <div className="flex flex-col h-full bg-audiophile-surface text-audiophile-text border border-audiophile-border p-2.5 rounded-sm select-none justify-between gap-2 overflow-hidden text-xs">
      {/* Metrics Row: Latency + Fill % + I/O */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        {/* Latency */}
        <div className="bg-audiophile-surface2/50 border border-slate-600/35 p-1.5 rounded">
          <div className="text-[9px] text-audiophile-muted uppercase">Latency</div>
          <div className="text-sm font-bold font-mono tracking-tight" style={{ color: appearance.accentColor }}>
            {telemetry.latency_ms.toFixed(2)} <span className="text-[9px] font-normal text-audiophile-muted">ms</span>
          </div>
        </div>

        {/* Fill */}
        <div className="bg-audiophile-surface2/50 border border-slate-600/35 p-1.5 rounded">
          <div className="text-[9px] text-audiophile-muted uppercase">
            {isNetworkMode ? (radioIsRealUsage ? "En vivo" : "Estimado") : "Lleno"}
          </div>
          <div className={`text-sm font-bold font-mono tracking-tight ${isNetworkMode ? "text-white" : "text-audiophile-text"}`}>
            {isNetworkMode ? (
              <>
                {(radioBytesPerSecond / 1024).toFixed(0)} <span className="text-[9px] font-normal text-audiophile-muted">KB/s</span>
              </>
            ) : `${telemetry.buffer_fill_percent.toFixed(1)}%`}
          </div>
        </div>

        {/* I/O */}
        <div className="bg-audiophile-surface2/50 border border-slate-600/35 p-1.5 rounded">
          <div className="text-[9px] text-audiophile-muted uppercase">
            {isNetworkMode ? "Sesión" : "I/O Read"}
          </div>
          <div className="text-sm font-bold font-mono tracking-tight text-audiophile-text">
            {isNetworkMode ? (
              <>
                {sessionDataParts.value} <span className="text-[9px] font-normal text-audiophile-muted">{sessionDataParts.unit}</span>
              </>
            ) : `${telemetry.io_read_time_ms.toFixed(2)} ms`}
          </div>
        </div>
      </div>

      {/* Mini Segmented Bar (100 Segments) */}
      <div className="space-y-1">
        <div className="flex justify-between text-[9px] font-mono text-audiophile-muted">
          <span>{isNetworkMode ? (isStreamMode ? "Stream en vivo" : "Descarga en vivo") : "Ring Buffer"}</span>
          <span>
            {isNetworkMode
              ? isStreamMode
                ? currentTrack?.title || "Stream Music"
                : activeRadioStation?.name || "Radio online"
              : `${telemetry.buffer_fill_frames.toLocaleString()} / ${telemetry.buffer_capacity_frames.toLocaleString()} f`}
          </span>
        </div>
        <div
          className="grid gap-[1px] h-2.5 bg-black/40 p-0.5 rounded border border-slate-600/25"
          style={{ gridTemplateColumns: `repeat(${SEGMENTS_COUNT}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: SEGMENTS_COUNT }).map((_, idx) => {
            const isActive = idx < activeSegments;
            let segmentStyle: React.CSSProperties = {};
            let segmentClass = "bg-neutral-800/40";

            if (isActive) {
              if (idx < 75) {
                segmentClass = "shadow-sm";
                segmentStyle = { backgroundColor: appearance.accentColor };
              } else if (idx < 90) {
                segmentClass = "bg-amber-400 shadow-[0_0_3px_#f59e0b]";
              } else {
                segmentClass = "bg-rose-500 shadow-[0_0_3px_#f43f5e]";
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

      {/* Frame size quick selector */}
      <div className="pt-1 border-t border-slate-600/25">
        <div className="flex items-center justify-between text-[9px] font-mono text-audiophile-muted mb-1">
          <span className="flex items-center gap-1">
            <Sliders size={10} /> Tamaño Buffer
          </span>
          <span className="text-audiophile-text font-bold">{selectedBufferSize} frames</span>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {BUFFER_SIZES.map((size) => {
            const isSelected = selectedBufferSize === size;
            return (
              <button
                key={size}
                type="button"
                disabled={isChangingBuffer}
                onClick={() => handleBufferSizeChange(size)}
                className={`py-0.5 text-[10px] font-mono rounded border transition-colors ${
                  isSelected
                    ? "font-bold border-audiophile-cyan text-audiophile-text"
                    : "bg-audiophile-base border-slate-600/45 text-audiophile-muted hover:text-audiophile-text"
                } ${isChangingBuffer ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                style={
                  isSelected
                    ? { borderColor: appearance.accentColor, color: appearance.accentColor }
                    : undefined
                }
              >
                {size}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
