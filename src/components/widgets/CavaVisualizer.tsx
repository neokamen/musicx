import React, { useEffect, useRef, useState } from "react";
import { useMusicStore, type AppearanceState } from "../../store/index.ts";

export const CAVA_STYLES: { id: AppearanceState["cavaStyle"]; label: string }[] = [
  { id: "fluid", label: "Onda fluida" },
  { id: "waves", label: "Ondas" },
  { id: "dots", label: "Puntos" },
  { id: "lines", label: "Líneas" },
  { id: "bars", label: "Barras" },
  { id: "radial", label: "Radial" },
  { id: "prism", label: "Prisma" },
  { id: "embers", label: "Brasas" },
  { id: "scope", label: "Osciloscopio" },
];

export const CavaVisualizer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const telemetry = useMusicStore((state) => state.telemetry);
  const isPlaying = useMusicStore((state) => state.isPlaying);
  const appearance = useMusicStore((state) => state.appearance);
  const [visualStyle, setVisualStyle] = useState(appearance.cavaStyle);
  const latestState = useRef({ telemetry, isPlaying, appearance, visualStyle });
  latestState.current = { telemetry, isPlaying, appearance, visualStyle };

  const handleDoubleClick = () => {
    const currentStyle = latestState.current.visualStyle;
    const currentIndex = CAVA_STYLES.findIndex((style) => style.id === currentStyle);
    const nextStyle = CAVA_STYLES[(currentIndex + 1) % CAVA_STYLES.length];
    setVisualStyle(nextStyle.id);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const count = Math.max(16, Math.min(128, appearance.cavaBars || 64));
    const levels = new Float32Array(count);
    const peaks = new Float32Array(count);
    let frameId = 0;
    let previousFrame = 0;
    let elapsed = 0;
    let canvasWidth = 0;
    let canvasHeight = 0;

    const drawFluidLayer = (
      width: number,
      height: number,
      baseline: number,
      scale: number,
      phase: number,
      fill: string | CanvasGradient,
      alpha: number,
      stroke?: string,
      inverted = false,
    ) => {
      const points = Array.from({ length: count }, (_, index) => {
        const x = (index / (count - 1)) * width;
        const modulation = 0.88 + Math.sin(index * 0.24 + phase) * 0.12;
        const offset = levels[index] * height * scale * modulation;
        const y = inverted ? baseline + offset : baseline - offset;
        return { x, y };
      });

      context.beginPath();
      context.moveTo(0, baseline);
      context.lineTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index++) {
        const previous = points[index - 1];
        const current = points[index];
        const midpointX = (previous.x + current.x) / 2;
        const midpointY = (previous.y + current.y) / 2;
        context.quadraticCurveTo(previous.x, previous.y, midpointX, midpointY);
      }
      const lastPoint = points[points.length - 1];
      context.lineTo(lastPoint.x, lastPoint.y);
      context.lineTo(width, baseline);
      context.closePath();

      context.globalAlpha = alpha;
      context.fillStyle = fill;
      context.fill();
      if (stroke) {
        context.globalAlpha = Math.min(1, alpha + 0.24);
        context.strokeStyle = stroke;
        context.lineWidth = 1.4;
        context.stroke();
      }
    };

    const render = (time: number) => {
      frameId = requestAnimationFrame(render);
      const { telemetry: liveTelemetry, isPlaying: liveIsPlaying, appearance: liveAppearance, visualStyle: liveStyle } = latestState.current;
      const fps = Math.max(30, liveAppearance.cavaFps || 60);
      if (time - previousFrame < 1000 / fps) return;
      const delta = Math.min((time - (previousFrame || time)) / 1000, 0.08);
      previousFrame = time;
      elapsed += delta;

      const bounds = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      if (bounds.width !== canvasWidth || bounds.height !== canvasHeight) {
        canvasWidth = bounds.width;
        canvasHeight = bounds.height;
        canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
        canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);

      const width = bounds.width;
      const height = bounds.height;
      const spectrum = liveTelemetry.spectrum || [];
      const playing = liveIsPlaying || liveTelemetry.state === "Playing";
      const sensitivity = (liveAppearance.cavaSensitivity || 100) / 100;
      const hasSignal = playing && (spectrum.some((value) => value > 0.002) || liveAppearance.cavaOfflineFallback);
      const smoothing = (liveAppearance.cavaSmoothing || 0) / 100;

      for (let index = 0; index < count; index++) {
        const sourceIndex = spectrum.length
          ? Math.min(spectrum.length - 1, Math.floor(index / count * spectrum.length))
          : -1;
        const synthetic = liveAppearance.cavaOfflineFallback && playing
          ? (0.08 + (Math.sin(elapsed * 4.1 + index * 0.21) + 1) * 0.16 + Math.sin(elapsed * 1.7 - index * 0.09) * 0.06)
          : 0;
        const target = sourceIndex >= 0
          ? Math.min(1, Math.max(0, Math.pow(spectrum[sourceIndex] || 0, 0.72) * sensitivity * 1.7))
          : synthetic;
        const attackRate = liveAppearance.cavaGravity === "instant" ? 30 : 12 - smoothing * 8;
        const attack = Math.min(1, delta * attackRate);
        const release = (liveAppearance.cavaGravity === "studio" ? 1.8 : 3.2) * (1 - smoothing * 0.82);
        if (playing && target > levels[index]) levels[index] += (target - levels[index]) * attack;
        else levels[index] = Math.max(target, levels[index] - delta * release);
        peaks[index] = liveAppearance.cavaPeakHold
          ? Math.max(levels[index], peaks[index] - delta * release * 0.28)
          : levels[index];
      }

      if (!hasSignal) return;

      const accent = liveAppearance.accentColor || "#06b6d4";
      const palette = liveAppearance.cavaPalette === "fire"
        ? ["#ffd166", "#f94144", "#7209b7"]
        : liveAppearance.cavaPalette === "ocean"
        ? ["#80ffdb", "#00b4d8", "#3a0ca3"]
        : liveAppearance.cavaPalette === "sunset"
        ? ["#f9c74f", "#f3722c", "#f72585"]
        : liveAppearance.cavaPalette === "forest"
        ? ["#d9ed92", "#52b788", "#1b4332"]
        : liveAppearance.cavaPalette === "candy"
        ? ["#ff70a6", "#c77dff", "#72ddf7"]
        : liveAppearance.cavaPalette === "ice"
        ? ["#e0fbfc", "#98c1d9", "#3d5a80"]
        : liveAppearance.cavaPalette === "mono"
        ? ["#64748b", "#cbd5e1", "#ffffff"]
        : liveAppearance.cavaPalette === "accent"
        ? [accent, accent, "#ffffff"]
        : liveAppearance.cavaPalette === "custom"
        ? liveAppearance.cavaCustomPalette
        : ["#4ade80", "#22d3ee", "#a78bfa"];
      const fluidGradient = context.createLinearGradient(0, height, width * 0.72, 0);
      fluidGradient.addColorStop(0, palette[0]);
      fluidGradient.addColorStop(0.52, palette[1]);
      fluidGradient.addColorStop(1, palette[2]);
      const deepGradient = context.createLinearGradient(0, height, width * 0.3, height * 0.18);
      deepGradient.addColorStop(0, palette[0]);
      deepGradient.addColorStop(1, palette[1]);

      context.save();
      context.shadowColor = palette[1];
      context.shadowBlur = 22;
      const baseline = liveAppearance.cavaMirrored ? height * 0.5 : height * 0.84;
      const scale = liveAppearance.cavaMirrored ? 0.62 : 0.88;
      switch (liveStyle) {
        case "bars": {
          const slotWidth = width / count;
          const barWidth = Math.max(1, slotWidth * 0.72);
          const baseline = height - 2;
          for (let index = 0; index < count; index++) {
            const barHeight = levels[index] * (baseline - 2);
            const x = index * slotWidth + (slotWidth - barWidth) / 2;
            const y = baseline - barHeight;
            if (barHeight > 1) {
              context.fillStyle = fluidGradient;
              context.shadowBlur = 10;
              context.fillRect(x, y, barWidth, barHeight);
            }
            if (liveAppearance.cavaPeakHold) {
              const peakY = Math.max(3, baseline - peaks[index] * (baseline - 2));
              context.fillStyle = palette[2];
              context.shadowColor = palette[2];
              context.shadowBlur = 8;
              context.fillRect(x - 1, peakY - 1, barWidth + 2, 2);
              context.shadowBlur = 0;
            }
          }
          break;
        }
        case "waves": {
          for (let wave = 0; wave < 3; wave++) {
            context.beginPath();
            for (let index = 0; index < count; index++) {
              const x = (index / (count - 1)) * width;
              const phase = index * 0.24 + elapsed * (wave % 2 === 0 ? 1 : -1) * (0.7 + wave * 0.18);
              const amplitude = 5 + levels[index] * height * (0.22 + wave * 0.08);
              const y = height * (0.35 + wave * 0.15) + Math.sin(phase) * amplitude;
              if (index === 0) context.moveTo(x, y);
              else context.lineTo(x, y);
            }
            context.strokeStyle = palette[wave];
            context.globalAlpha = 0.88 - wave * 0.18;
            context.lineWidth = wave === 0 ? 2.4 : 1.5;
            context.shadowColor = palette[wave];
            context.shadowBlur = 12;
            context.stroke();
          }
          break;
        }
        case "dots": {
          const rows = 10;
          const slotWidth = width / count;
          const radius = Math.max(1, Math.min(3.5, slotWidth * 0.24));
          for (let index = 0; index < count; index++) {
            const litRows = Math.ceil(levels[index] * rows);
            for (let row = 0; row < litRows; row++) {
              const x = index * slotWidth + slotWidth / 2;
              const y = height - 6 - row * Math.max(7, height / (rows + 1));
              const color = palette[Math.min(2, Math.floor((row / rows) * 3))];
              context.beginPath();
              context.arc(x, y, radius, 0, Math.PI * 2);
              context.fillStyle = color;
              context.shadowColor = color;
              context.shadowBlur = 8;
              context.fill();
            }
          }
          break;
        }
        case "lines": {
          const center = liveAppearance.cavaMirrored ? height / 2 : height - 4;
          const slotWidth = width / count;
          for (let index = 0; index < count; index++) {
            const x = index * slotWidth + slotWidth / 2;
            const extent = Math.max(2, levels[index] * height * (liveAppearance.cavaMirrored ? 0.46 : 0.9));
            context.beginPath();
            context.moveTo(x, center - extent);
            context.lineTo(x, liveAppearance.cavaMirrored ? center + extent : center);
            context.strokeStyle = palette[Math.floor((index / count) * 3)];
            context.lineWidth = Math.max(1, slotWidth * 0.48);
            context.shadowColor = context.strokeStyle;
            context.shadowBlur = 9;
            context.stroke();
          }
          break;
        }
        case "radial": {
          const centerX = width / 2;
          const centerY = height / 2;
          const innerRadius = Math.min(width, height) * 0.16;
          const maximumRadius = Math.min(width, height) * 0.44;
          for (let index = 0; index < count; index++) {
            const angle = (index / count) * Math.PI * 2 + elapsed * 0.08;
            const outerRadius = innerRadius + levels[index] * maximumRadius;
            context.beginPath();
            context.moveTo(centerX + Math.cos(angle) * innerRadius, centerY + Math.sin(angle) * innerRadius);
            context.lineTo(centerX + Math.cos(angle) * outerRadius, centerY + Math.sin(angle) * outerRadius);
            context.strokeStyle = palette[Math.floor((index / count) * 3)];
            context.lineWidth = Math.max(1, width / count * 0.52);
            context.shadowColor = context.strokeStyle;
            context.shadowBlur = 8;
            context.stroke();
          }
          context.beginPath();
          context.arc(centerX, centerY, innerRadius * 0.65, 0, Math.PI * 2);
          context.fillStyle = palette[1];
          context.globalAlpha = 0.3;
          context.fill();
          break;
        }
        case "prism": {
          const baselineY = liveAppearance.cavaMirrored ? height / 2 : height;
          const slot = width / count;
          for (let index = 0; index < count; index++) {
            const barHeight = Math.max(2, levels[index] * height * 0.9);
            const x = index * slot + slot * 0.12;
            const barWidth = Math.max(1, slot * 0.76);
            const gradient = context.createLinearGradient(0, baselineY - barHeight, 0, baselineY);
            gradient.addColorStop(0, palette[2]);
            gradient.addColorStop(0.5, palette[1]);
            gradient.addColorStop(1, palette[0]);
            context.fillStyle = gradient;
            context.shadowColor = palette[1];
            context.shadowBlur = 12;
            context.beginPath();
            context.moveTo(x + barWidth * 0.18, baselineY);
            context.lineTo(x + barWidth * 0.38, baselineY - barHeight * 0.72);
            context.lineTo(x + barWidth * 0.62, baselineY - barHeight * 0.72);
            context.lineTo(x + barWidth * 0.82, baselineY);
            context.closePath();
            context.fill();
            if (liveAppearance.cavaPeakHold) {
              context.fillStyle = "#ffffff";
              context.fillRect(x, baselineY - peaks[index] * height * 0.9, barWidth, 1.5);
            }
          }
          break;
        }
        case "embers": {
          const slot = width / count;
          for (let index = 0; index < count; index++) {
            const level = levels[index];
            const x = index * slot + slot / 2;
            const rise = level * height * 0.82;
            const flicker = Math.sin(elapsed * 8 + index * 13.7) * 3;
            const gradient = context.createRadialGradient(x, height - rise * 0.55, 0, x, height - rise * 0.55, Math.max(3, rise * 0.72));
            gradient.addColorStop(0, "#fff7ae");
            gradient.addColorStop(0.18, palette[0]);
            gradient.addColorStop(0.58, palette[1]);
            gradient.addColorStop(1, "rgba(244,63,94,0)");
            context.fillStyle = gradient;
            context.shadowColor = palette[1];
            context.shadowBlur = 14;
            context.beginPath();
            context.ellipse(x, height - rise * 0.48 + flicker, Math.max(2, slot * 0.7), Math.max(2, rise * 0.54), Math.sin(index + elapsed) * 0.14, 0, Math.PI * 2);
            context.fill();
            if (level > 0.35) {
              context.fillStyle = "#fff7ae";
              context.globalAlpha = Math.min(1, level);
              context.beginPath();
              context.arc(x, height - rise + flicker, Math.max(1, slot * 0.1), 0, Math.PI * 2);
              context.fill();
              context.globalAlpha = 1;
            }
          }
          break;
        }
        case "scope": {
          const centerY = liveAppearance.cavaMirrored ? height / 2 : height * 0.56;
          const scopeHeight = liveAppearance.cavaMirrored ? height * 0.4 : height * 0.65;
          context.strokeStyle = `${palette[1]}33`;
          context.lineWidth = 1;
          for (let row = -2; row <= 2; row++) {
            context.beginPath();
            context.moveTo(0, centerY + row * scopeHeight * 0.22);
            context.lineTo(width, centerY + row * scopeHeight * 0.22);
            context.stroke();
          }
          for (let index = 0; index < 9; index++) {
            const x = (index / 8) * width;
            context.beginPath();
            context.moveTo(x, centerY - scopeHeight * 0.55);
            context.lineTo(x, centerY + scopeHeight * 0.55);
            context.stroke();
          }
          context.beginPath();
          for (let index = 0; index < count; index++) {
            const x = (index / (count - 1)) * width;
            const envelope = 0.15 + levels[index] * 0.85;
            const y = centerY + Math.sin(index * 0.42 - elapsed * 6) * envelope * scopeHeight * 0.5;
            if (index === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          }
          context.strokeStyle = palette[0];
          context.lineWidth = 2;
          context.shadowColor = palette[0];
          context.shadowBlur = 16;
          context.stroke();
          context.shadowBlur = 0;
          break;
        }
        default: {
          drawFluidLayer(width, height, liveAppearance.cavaMirrored ? baseline : height * 0.92, liveAppearance.cavaMirrored ? 0.62 : 0.74, elapsed * 0.45, deepGradient, 0.24);
          drawFluidLayer(width, height, baseline, scale, -elapsed * 0.62, fluidGradient, 0.68, palette[1]);
          if (liveAppearance.cavaMirrored) {
            drawFluidLayer(width, height, baseline, scale, -elapsed * 0.62, fluidGradient, 0.36, palette[1], true);
          }
          if (liveAppearance.cavaPeakHold) {
            context.beginPath();
            for (let index = 0; index < count; index++) {
              const x = (index / (count - 1)) * width;
              const y = baseline - peaks[index] * height * scale;
              if (index === 0) context.moveTo(x, y);
              else context.lineTo(x, y);
            }
            context.strokeStyle = "rgba(255,255,255,0.68)";
            context.lineWidth = 1;
            context.stroke();
          }
          context.shadowBlur = 8;
          drawFluidLayer(width, height, liveAppearance.cavaMirrored ? baseline : height * 0.78, 0.42, elapsed * 0.88, "#ffffff", 0.16, "#ffffff", liveAppearance.cavaMirrored);
        }
      }
      context.restore();
      context.globalAlpha = 1;
    };

    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [appearance.cavaBars]);

  return (
    <div
      onDoubleClick={handleDoubleClick}
      title="Doble clic para cambiar estilo CAVA"
      className="h-full w-full min-h-0 bg-slate-950 p-2 flex items-stretch relative overflow-hidden"
    >
      <canvas ref={canvasRef} className="h-full w-full" aria-label="Visualizador CAVA" />
    </div>
  );
};