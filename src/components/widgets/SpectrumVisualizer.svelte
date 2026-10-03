<script lang="ts">
  import { onMount } from "svelte";
  import { useMusicStore } from "../../store/index.ts";
  import type { SpectrumStyle } from "../../types/spectrum.ts";
  import { SPECTRUM_STYLES } from "../../types/spectrum.ts";

  interface Props {
    height?: number;
    nodeKey?: string;
    isEditing?: boolean;
  }

  let { height, nodeKey, isEditing = false }: Props = $props();

  const musicStore = useMusicStore;
  let appearance = $derived($musicStore.appearance);

  let canvas = $state<HTMLCanvasElement | null>(null);

  function getInitialStyle(): SpectrumStyle {
    if (nodeKey && typeof window !== "undefined") {
      const saved = localStorage.getItem(`musicx_spectrum_style_${nodeKey}`);
      if (saved === "quantum_laser") return "fluid_wave";
      if (saved && SPECTRUM_STYLES.some((s) => s.id === saved)) {
        return saved as SpectrumStyle;
      }
    }
    const current = appearance.spectrumStyle as string;
    return current === "quantum_laser" ? "fluid_wave" : (appearance.spectrumStyle || "bars");
  }

  let visualStyle = $state<SpectrumStyle>(getInitialStyle());

  $effect(() => {
    if (!nodeKey) {
      const current = appearance.spectrumStyle as string;
      visualStyle = current === "quantum_laser" ? "fluid_wave" : (appearance.spectrumStyle || "bars");
    }
  });

  function setStyleAndSave(newStyle: SpectrumStyle) {
    visualStyle = newStyle;
    if (nodeKey && typeof window !== "undefined") {
      localStorage.setItem(`musicx_spectrum_style_${nodeKey}`, newStyle);
    }
  }

  function handleDoubleClick() {
    const currentIndex = SPECTRUM_STYLES.findIndex((s) => s.id === visualStyle);
    const nextIndex = (currentIndex + 1) % SPECTRUM_STYLES.length;
    setStyleAndSave(SPECTRUM_STYLES[nextIndex].id);
  }

  onMount(() => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let lastTime = performance.now();
    let fluidWavePhase = 0;

    const numBands = Math.max(16, Math.min(128, appearance.cavaBars || 64));
    const currentBands = new Float32Array(numBands);
    const peaks = new Float32Array(numBands);
    const peakVelocity = new Float32Array(numBands);
    const channelBands = [new Float32Array(numBands), new Float32Array(numBands)];
    let rectWidth = 300;
    let rectHeight = 150;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !canvas) return;
      rectWidth = entry.contentRect.width;
      rectHeight = entry.contentRect.height;
      const pixelRatio = window.devicePixelRatio || 1;
      const canvasWidth = Math.max(1, Math.floor(rectWidth * pixelRatio));
      const canvasHeight = Math.max(1, Math.floor(rectHeight * pixelRatio));
      if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
      }
    });
    resizeObserver.observe(canvas);

    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      if (!canvas) return;

      const store = musicStore.getState();
      const currentTelemetry = store.telemetry;
      const currentIsPlaying = (store.isPlaying || currentTelemetry.state === "Playing") &&
        currentTelemetry.state !== "Stopped" && currentTelemetry.state !== "Paused";
      const currentVol = currentTelemetry.volume ?? store.volume ?? 1;
      const currentApp = store.appearance;

      // Throttle when silent and paused
      if (!currentIsPlaying && currentBands.every((b) => b < 0.001)) {
        if (now - lastTime < 200) return;
      }

      const frameInterval = 1000 / Math.max(30, currentApp.spectrumFps || 60);
      if (now - lastTime < frameInterval) return;
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const pixelRatio = window.devicePixelRatio || 1;
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      const w = rectWidth;
      const h = rectHeight;
      ctx.clearRect(0, 0, w, h);

      if (w === 0 || h === 0) return;

      const accent = currentApp.accentColor || "#06b6d4";
      const timeSec = now / 1000;

      const targetBands = currentTelemetry.spectrum && currentTelemetry.spectrum.length > 0
        ? currentTelemetry.spectrum
        : [];
      const targetChannels = [currentTelemetry.spectrum_left, currentTelemetry.spectrum_right];
      const spectrumGain = (currentApp.spectrumSensitivity / 100) * 1.7;
      const amplifyBand = (value: number) => Math.min(
        1,
        Math.pow(Math.max(0, value), 0.72) * spectrumGain * Math.min(1, currentVol)
      );

      for (let i = 0; i < numBands; i++) {
        if (!currentIsPlaying || currentVol === 0) {
          currentBands[i] = Math.max(0, currentBands[i] - dt * 2.5);
        } else if (targetBands.length > 0) {
          const specIdx = Math.floor((i / numBands) * targetBands.length);
          const rawVal = amplifyBand(targetBands[specIdx] || 0);
          const factor = 1 - Math.exp(-dt * (22 - currentApp.cavaSmoothing * 0.16));
          currentBands[i] += (rawVal - currentBands[i]) * factor;
        } else if (currentApp.cavaOfflineFallback) {
          const synth = Math.min(1, (Math.sin(timeSec * 5 + i * 0.4) * 0.4 + 0.5) * Math.min(1, currentVol) * 0.85 * (currentApp.spectrumSensitivity / 100));
          const factor = 1 - Math.exp(-dt * (18 - currentApp.cavaSmoothing * 0.12));
          currentBands[i] += (synth - currentBands[i]) * factor;
        } else {
          currentBands[i] = Math.max(0, currentBands[i] - dt * 2.5);
        }

        for (let channelIdx = 0; channelIdx < 2; channelIdx++) {
          const channelSpectrum = targetChannels[channelIdx]?.length ? targetChannels[channelIdx] : targetBands;
          if (!currentIsPlaying || currentVol === 0) {
            channelBands[channelIdx][i] = Math.max(0, channelBands[channelIdx][i] - dt * 2.5);
          } else if (channelSpectrum.length > 0) {
            const channelIndex = Math.floor((i / numBands) * channelSpectrum.length);
            const value = amplifyBand(channelSpectrum[channelIndex] || 0);
            const channelFactor = 1 - Math.exp(-dt * (22 - currentApp.cavaSmoothing * 0.16));
            channelBands[channelIdx][i] += (value - channelBands[channelIdx][i]) * channelFactor;
          } else {
            channelBands[channelIdx][i] = Math.max(0, channelBands[channelIdx][i] - dt * 2.5);
          }
          channelPeaks[channelIdx][i] = currentApp.cavaPeakHold
            ? Math.max(channelBands[channelIdx][i], channelPeaks[channelIdx][i] - dt * 0.7)
            : channelBands[channelIdx][i];
        }

        if (!currentApp.cavaPeakHold || currentApp.cavaGravity === "instant") {
          peaks[i] = currentBands[i];
          peakVelocity[i] = 0;
        } else if (currentBands[i] > peaks[i]) {
          peaks[i] = currentBands[i];
          peakVelocity[i] = 0;
        } else {
          peakVelocity[i] += dt * (currentApp.cavaGravity === "studio" ? 0.65 : 1.2);
          peaks[i] = Math.max(0, peaks[i] - peakVelocity[i] * dt * 60);
        }
      }

      switch (visualStyle) {
        case "fluid_wave": {
          fluidWavePhase += currentIsPlaying ? dt * 4.5 : dt * 1.6;

          let bassEnergy = 0;
          let midEnergy = 0;
          const spectrum = currentTelemetry.spectrum || [];
          if (currentIsPlaying && spectrum.length > 0) {
            const sampleCount = Math.min(12, spectrum.length);
            for (let s = 0; s < sampleCount; s++) {
              bassEnergy += spectrum[s] || 0;
            }
            bassEnergy = (bassEnergy / sampleCount);

            const midCount = Math.min(32, spectrum.length);
            for (let s = sampleCount; s < midCount; s++) {
              midEnergy += spectrum[s] || 0;
            }
            midEnergy = (midEnergy / (midCount - sampleCount));
          } else {
            bassEnergy = 0.08;
            midEnergy = 0.04;
          }

          const midY = h * 0.5;
          const amplitude = Math.min(h * 0.44, Math.max(3, h * (bassEnergy * 0.65 + midEnergy * 0.35 + 0.1)));
          const pointsCount = 48;
          const step = w / (pointsCount - 1);
          const points: { x: number; y: number }[] = [];

          for (let i = 0; i < pointsCount; i++) {
            const x = i * step;
            const normX = i / (pointsCount - 1);
            const envelope = Math.sin(normX * Math.PI);

            const freqVal = currentIsPlaying && spectrum.length > 0
              ? (spectrum[Math.min(i, spectrum.length - 1)] || 0) * 0.8
              : 0;

            const wave =
              Math.sin(normX * 10 + fluidWavePhase) * 0.6 +
              Math.sin(normX * 22 - fluidWavePhase * 1.4) * 0.28 +
              Math.cos(normX * 36 + fluidWavePhase * 2) * (0.12 + freqVal * 0.3);

            const y = midY + wave * amplitude * envelope;
            points.push({ x, y });
          }

          // Draw translucent underfill
          ctx.beginPath();
          ctx.moveTo(0, h);
          ctx.lineTo(points[0].x, points[0].y);
          for (let i = 0; i < points.length - 1; i++) {
            const xc = (points[i].x + points[i + 1].x) / 2;
            const yc = (points[i].y + points[i + 1].y) / 2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
          }
          ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
          ctx.lineTo(w, h);
          ctx.closePath();

          const areaGrad = ctx.createLinearGradient(0, midY - amplitude, 0, h);
          areaGrad.addColorStop(0, `${accent}35`);
          areaGrad.addColorStop(0.7, `${accent}10`);
          areaGrad.addColorStop(1, "transparent");
          ctx.fillStyle = areaGrad;
          ctx.fill();

          // Draw luminous wave crest
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 0; i < points.length - 1; i++) {
            const xc = (points[i].x + points[i + 1].x) / 2;
            const yc = (points[i].y + points[i + 1].y) / 2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
          }
          ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

          ctx.strokeStyle = accent;
          ctx.lineWidth = 1.8;
          ctx.shadowColor = accent;
          ctx.shadowBlur = 8;
          ctx.stroke();
          ctx.shadowBlur = 0;

          // White core filament
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 0.6;
          ctx.stroke();
          break;
        }

        case "bars": {
          const barWidth = (w / numBands) * 0.8;
          const gap = (w / numBands) * 0.2;
          const baseline = h - 2;
          for (let i = 0; i < numBands; i++) {
            const barHeight = currentBands[i] * (baseline - 2);
            const x = i * (barWidth + gap) + gap / 2;
            const y = baseline - barHeight;

            if (barHeight > 1) {
              const grad = ctx.createLinearGradient(0, baseline, 0, y);
              grad.addColorStop(0, `${accent}40`);
              grad.addColorStop(0.65, accent);
              grad.addColorStop(1, "#f8fafc");

              ctx.fillStyle = grad;
              ctx.shadowColor = accent;
              ctx.shadowBlur = currentApp.neonGlow ? (currentApp.neonIntensity / 100) * 10 : 0;
              ctx.fillRect(x, y, barWidth, barHeight);
            }

            if (peaks[i] > 0.02) {
              const peakY = Math.max(3, baseline - peaks[i] * (baseline - 2));
              ctx.fillStyle = "#ffffff";
              ctx.shadowColor = accent;
              ctx.shadowBlur = currentApp.neonGlow ? (currentApp.neonIntensity / 100) * 13 : 7;
              ctx.fillRect(x - 1, peakY - 1, barWidth + 2, 2);
              ctx.shadowBlur = 0;
            }
          }
          break;
        }

        case "wave": {
          ctx.beginPath();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = accent;
          ctx.shadowColor = accent;
          ctx.shadowBlur = currentApp.neonGlow ? (currentApp.neonIntensity / 100) * 15 : 0;

          const centerY = h / 2;
          ctx.moveTo(0, centerY);

          for (let x = 0; x < w; x += 4) {
            const idx = Math.floor((x / w) * numBands);
            const amp = currentBands[idx] * (h / 2.5);
            const waveY = centerY + (currentIsPlaying ? Math.sin(x * 0.06 + timeSec * 14) * amp : 0);
            ctx.lineTo(x, waveY);
          }
          ctx.stroke();
          if (currentApp.cavaMirrored) {
            ctx.beginPath();
            ctx.moveTo(0, centerY);
            for (let x = 0; x < w; x += 4) {
              const idx = Math.floor((x / w) * numBands);
              const amp = currentBands[idx] * (h / 2.5);
              const waveY = centerY - (currentIsPlaying ? Math.sin(x * 0.06 + timeSec * 14) * amp : 0);
              ctx.lineTo(x, waveY);
            }
            ctx.stroke();
          }
          break;
        }

        case "circular": {
          const cx = w / 2;
          const cy = h / 2;
          const baseRadius = Math.min(w, h) * 0.28;

          for (let i = 0; i < numBands; i++) {
            const angle = (i / numBands) * Math.PI * 2;
            const barLen = currentBands[i] * (Math.min(w, h) * 0.25);

            const x1 = cx + Math.cos(angle) * baseRadius;
            const y1 = cy + Math.sin(angle) * baseRadius;
            const x2 = cx + Math.cos(angle) * (baseRadius + barLen);
            const y2 = cy + Math.sin(angle) * (baseRadius + barLen);

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = accent;
            ctx.lineWidth = 3;
            ctx.shadowColor = accent;
            ctx.shadowBlur = currentApp.neonGlow ? (currentApp.neonIntensity / 100) * 10 : 0;
            ctx.stroke();
          }
          break;
        }

        case "oscilloscope": {
          ctx.beginPath();
          ctx.lineWidth = 2;
          ctx.strokeStyle = accent;
          ctx.shadowColor = accent;
          ctx.shadowBlur = 12;

          for (let i = 0; i < numBands; i++) {
            const t = (i / numBands) * Math.PI * 2;
            const r = currentBands[i] * (h / 2.2);
            const x = w / 2 + (currentIsPlaying ? Math.cos(t * 3 + timeSec * 5) * (r + 10) : 0);
            const y = h / 2 + (currentIsPlaying ? Math.sin(t * 5 + timeSec * 7) * (r + 10) : 0);

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
          break;
        }

        case "stereo_vu": {
          const halfH = h / 2;

          for (let channelIdx = 0; channelIdx < 2; channelIdx++) {
            const startY = channelIdx * halfH;
            const barHeight = halfH - 12;
            const totalSegments = 24;

            const avgAmp = currentIsPlaying
              ? channelBands[channelIdx].reduce((sum, band) => sum + band, 0) / numBands
              : 0;

            const activeSegs = Math.floor(avgAmp * totalSegments);
            const segW = w / totalSegments;

            for (let s = 0; s < totalSegments; s++) {
              const segX = s * segW;
              const isLit = s < activeSegs;

              let color = "#22c55e";
              if (s > 16) color = "#f59e0b";
              if (s > 21) color = "#ef4444";

              ctx.fillStyle = isLit ? color : "#1e293b";
              ctx.shadowColor = isLit ? color : "transparent";
              ctx.shadowBlur = isLit && currentApp.neonGlow ? 6 : 0;
              ctx.fillRect(segX, startY + 16, segW - 2, barHeight - 8);
            }
          }
          break;
        }

        case "stereo_vu_vertical": {
          const totalSegments = 24;
          const meterWidth = Math.min(48, w * 0.24);
          const meterGap = Math.min(44, w * 0.18);
          const meterHeight = h * 0.72;
          const segmentHeight = meterHeight / totalSegments;
          const top = (h - meterHeight) / 2;
          const startX = (w - meterWidth * 2 - meterGap) / 2;

          for (let channelIdx = 0; channelIdx < 2; channelIdx++) {
            const avgAmp = currentIsPlaying
              ? channelBands[channelIdx].reduce((sum, band) => sum + band, 0) / numBands
              : 0;
            const litSegments = Math.floor(avgAmp * totalSegments);
            const x = startX + channelIdx * (meterWidth + meterGap);

            ctx.fillStyle = "#0f172a";
            ctx.fillRect(x, top, meterWidth, meterHeight);
            for (let segment = 0; segment < totalSegments; segment++) {
              const level = segment / totalSegments;
              const color = level > 0.88 ? "#ef4444" : level > 0.68 ? "#f59e0b" : "#22c55e";
              const y = top + meterHeight - (segment + 1) * segmentHeight;
              ctx.fillStyle = segment < litSegments ? color : "#1e293b";
              ctx.shadowColor = segment < litSegments ? color : "transparent";
              ctx.shadowBlur = segment < litSegments && currentApp.neonGlow ? 5 : 0;
              ctx.fillRect(x + 3, y + 1, meterWidth - 6, Math.max(1, segmentHeight - 2));
            }
            ctx.shadowBlur = 0;
          }
          break;
        }

        case "retro_needle": {
          const gaugeWidth = w / 2;
          const radius = Math.min(gaugeWidth * 0.39, h * 0.52);
          const centerY = h * 0.77;

          for (let channelIdx = 0; channelIdx < 2; channelIdx++) {
            const centerX = gaugeWidth * (channelIdx + 0.5);
            const average = currentIsPlaying
              ? channelBands[channelIdx].reduce((sum, band) => sum + band, 0) / numBands
              : 0;
            const cardX = channelIdx * gaugeWidth + 5;
            const cardWidth = gaugeWidth - 10;
            const arcRadius = Math.min(radius, cardWidth * 0.43);

            ctx.strokeStyle = currentApp.accentColor || "#475569";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(cardX, 5, cardWidth, h - 10, 8);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(centerX, centerY, arcRadius, Math.PI, Math.PI * 2);
            ctx.strokeStyle = "#cbd5e1";
            ctx.lineWidth = 2;
            ctx.stroke();

            for (let tick = 0; tick <= 10; tick++) {
              const angle = Math.PI + (tick / 10) * Math.PI;
              const outerX = centerX + Math.cos(angle) * arcRadius;
              const outerY = centerY + Math.sin(angle) * arcRadius;
              const tickLength = tick > 7 ? 10 : 6;
              const innerX = centerX + Math.cos(angle) * (arcRadius - tickLength);
              const innerY = centerY + Math.sin(angle) * (arcRadius - tickLength);
              ctx.beginPath();
              ctx.moveTo(innerX, innerY);
              ctx.lineTo(outerX, outerY);
              ctx.strokeStyle = tick > 7 ? currentApp.accentColor || "#fb7185" : "#94a3b8";
              ctx.lineWidth = tick > 7 ? 2 : 1;
              ctx.stroke();
            }

            const needleAngle = Math.PI + Math.min(1, average) * Math.PI;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(centerX + Math.cos(needleAngle) * arcRadius * 0.78, centerY + Math.sin(needleAngle) * arcRadius * 0.78);
            ctx.strokeStyle = accent;
            ctx.lineWidth = 2.5;
            ctx.lineCap = "round";
            ctx.shadowColor = accent;
            ctx.shadowBlur = currentApp.neonGlow ? 5 : 0;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
            ctx.fillStyle = "#e2e8f0";
            ctx.fill();
          }
          break;
        }

        case "retro_glow_meter": {
          const gaugeWidth = w / 2;
          const radius = Math.min(gaugeWidth * 0.38, h * 0.38);
          const centerY = h * 0.5;
          const colors = [accent, "#44e6a8"];
          for (let channelIdx = 0; channelIdx < 2; channelIdx++) {
            const centerX = gaugeWidth * (channelIdx + 0.5);
            const level = currentIsPlaying ? channelBands[channelIdx].reduce((sum, band) => sum + band, 0) / numBands : 0;
            const color = colors[channelIdx];
            const arc = (Math.PI * 2) * 0.82;
            ctx.fillStyle = "#081018";
            ctx.strokeStyle = `${color}55`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(channelIdx * gaugeWidth + 5, 4, gaugeWidth - 10, h - 8, 9);
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, Math.PI + 0.09, Math.PI + 0.09 + arc);
            ctx.strokeStyle = "#1e293b";
            ctx.lineWidth = 7;
            ctx.lineCap = "round";
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, Math.PI + 0.09, Math.PI + 0.09 + arc * Math.min(1, level));
            ctx.strokeStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 8 + level * 14;
            ctx.lineWidth = 5;
            ctx.stroke();
            ctx.shadowBlur = 0;
            for (let tick = 0; tick <= 20; tick++) {
              const angle = Math.PI + 0.09 + (tick / 20) * arc;
              const outer = radius + 8;
              const inner = radius + (tick % 5 === 0 ? 1 : 4);
              ctx.beginPath();
              ctx.moveTo(centerX + Math.cos(angle) * inner, centerY + Math.sin(angle) * inner);
              ctx.lineTo(centerX + Math.cos(angle) * outer, centerY + Math.sin(angle) * outer);
              ctx.strokeStyle = tick > 16 ? "#fb7185" : `${color}aa`;
              ctx.lineWidth = tick % 5 === 0 ? 1.5 : 0.8;
              ctx.stroke();
            }
            const needleAngle = Math.PI + 0.09 + arc * Math.min(1, level);
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(centerX + Math.cos(needleAngle) * radius * 0.83 * 1.25, centerY + Math.sin(needleAngle) * radius * 0.83 * 1.25);
            ctx.strokeStyle = "#f8fafc";
            ctx.lineWidth = 1.8;
            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
          break;
        }

        case "retro_tube_meter": {
          const gaugeWidth = w / 2;
          const radius = Math.min(gaugeWidth * 0.39, h * 0.53);
          const centerY = h * 0.78;
          for (let channelIdx = 0; channelIdx < 2; channelIdx++) {
            const centerX = gaugeWidth * (channelIdx + 0.5);
            const level = currentIsPlaying ? channelBands[channelIdx].reduce((sum, band) => sum + band, 0) / numBands : 0;
            const warm = channelIdx === 0 ? "#fbbf24" : "#fb7185";
            const tubeGradient = ctx.createRadialGradient(centerX, centerY - radius * 0.35, 2, centerX, centerY, radius * 1.3);
            tubeGradient.addColorStop(0, "#38241a");
            tubeGradient.addColorStop(0.65, "#15191b");
            tubeGradient.addColorStop(1, "#080b0d");
            ctx.fillStyle = tubeGradient;
            ctx.strokeStyle = `${warm}66`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.roundRect(channelIdx * gaugeWidth + 5, 5, gaugeWidth - 10, h - 10, 10);
            ctx.fill();
            ctx.stroke();
            for (let glow = 2; glow >= 0; glow--) {
              ctx.beginPath();
              ctx.arc(centerX, centerY, radius - glow * 5, Math.PI, Math.PI * 2);
              ctx.strokeStyle = `${warm}${glow === 0 ? "bb" : "24"}`;
              ctx.lineWidth = glow === 0 ? 1.2 : 4;
              ctx.shadowColor = warm;
              ctx.shadowBlur = glow === 0 ? 0 : 14;
              ctx.stroke();
            }
            ctx.shadowBlur = 0;
            for (let tick = 0; tick <= 12; tick++) {
              const angle = Math.PI + (tick / 12) * Math.PI;
              const inner = radius - (tick % 3 === 0 ? 8 : 4);
              ctx.beginPath();
              ctx.moveTo(centerX + Math.cos(angle) * inner, centerY + Math.sin(angle) * inner);
              ctx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
              ctx.strokeStyle = tick > 9 ? "#fb7185" : "#f8d59b";
              ctx.lineWidth = tick % 3 === 0 ? 1.4 : 0.7;
              ctx.stroke();
            }
            const angle = Math.PI + Math.min(1, level) * Math.PI;
            const tailX = centerX - Math.cos(angle) * radius * 0.17;
            const tailY = centerY - Math.sin(angle) * radius * 0.17;
            const tipX = centerX + Math.cos(angle) * radius * 0.78;
            const tipY = centerY + Math.sin(angle) * radius * 0.78;
            ctx.beginPath();
            ctx.moveTo(tailX, tailY);
            ctx.lineTo(tipX, tipY);
            ctx.strokeStyle = "#ffe7bd";
            ctx.lineWidth = 2;
            ctx.shadowColor = warm;
            ctx.shadowBlur = 11;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
            ctx.fillStyle = "#e7b86d";
            ctx.fill();
          }
          break;
        }

        case "retro_scope_meter": {
          const gaugeWidth = w / 2;
          const radius = Math.min(gaugeWidth * 0.4, h * 0.54);
          const centerY = h * 0.79 - 6;
          const theme = getComputedStyle(canvas);
          const panelColor = theme.getPropertyValue("--app-surface").trim() || "#0c1220";
          const borderColor = theme.getPropertyValue("--app-border").trim() || "#334155";
          for (let channelIdx = 0; channelIdx < 2; channelIdx++) {
            const centerX = gaugeWidth * (channelIdx + 0.5);
            const channel = channelBands[channelIdx];
            const level = currentIsPlaying ? channel.reduce((sum, band) => sum + band, 0) / numBands : 0;
            const color = accent;
            ctx.fillStyle = panelColor;
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(channelIdx * gaugeWidth + 5, 5, gaugeWidth - 10, h - 10, 8);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, Math.PI, Math.PI * 2);
            ctx.strokeStyle = `${color}44`;
            ctx.lineWidth = 3.2;
            ctx.stroke();
            const sweep = Math.PI * Math.min(1, level);
            const angle = Math.PI + sweep;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, Math.PI, angle);
            ctx.strokeStyle = color;
            ctx.lineWidth = 4.5;
            ctx.shadowColor = color;
            ctx.shadowBlur = currentApp.neonGlow ? (currentApp.neonIntensity / 100) * 22 : 14;
            ctx.stroke();
            ctx.shadowBlur = 0;
            for (let tick = 0; tick <= 16; tick++) {
              const tickAngle = Math.PI + (tick / 16) * Math.PI;
              const inner = radius - (tick % 4 === 0 ? 9 : 5);
              ctx.beginPath();
              ctx.moveTo(centerX + Math.cos(tickAngle) * inner, centerY + Math.sin(tickAngle) * inner);
              ctx.lineTo(centerX + Math.cos(tickAngle) * radius, centerY + Math.sin(tickAngle) * radius);
              ctx.strokeStyle = tick > 13 ? "#fb7185" : `${color}cc`;
              ctx.lineWidth = tick % 4 === 0 ? 2 : 1.1;
              ctx.stroke();
            }
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            const needleTipX = centerX + Math.cos(angle) * radius * 0.77;
            const needleTipY = centerY + Math.sin(angle) * radius * 0.77;
            ctx.lineTo(needleTipX, needleTipY);
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2.2;
            ctx.shadowColor = color;
            ctx.shadowBlur = currentApp.neonGlow ? 12 : 6;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(centerX, centerY, 2.2, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 5;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.font = "bold 9px monospace";
            ctx.textAlign = "center";
            ctx.fillStyle = "#94a3b8";
            ctx.fillText(channelIdx === 0 ? "CH 01 · L" : "CH 02 · R", centerX, h - 16);
          }
          break;
        }

        case "stereo_wave": {
          for (let channelIdx = 0; channelIdx < 2; channelIdx++) {
            const centerY = channelIdx * (h / 2) + h / 4;
            const channel = channelBands[channelIdx];
            const channelColor = channelIdx === 0 ? accent : "#f472b6";
            ctx.beginPath();
            for (let index = 0; index < numBands; index++) {
              const x = (index / (numBands - 1)) * w;
              const amplitude = channel[index] * (h * 0.22);
              const y = centerY + Math.sin(index * 0.42 + timeSec * 5) * amplitude;
              if (index === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = channelColor;
            ctx.lineWidth = 2;
            ctx.shadowColor = channelColor;
            ctx.shadowBlur = currentApp.neonGlow ? 9 : 0;
            ctx.stroke();
          }
          break;
        }

        case "stereo_split": {
          const halfH = h / 2;
          const channelColors = [accent, "#f472b6"];
          const slotWidth = w / numBands;
          for (let channelIdx = 0; channelIdx < 2; channelIdx++) {
            const channel = channelBands[channelIdx];
            for (let index = 0; index < numBands; index++) {
              const barHeight = channel[index] * (halfH - 8);
              const y = channelIdx === 0 ? halfH - barHeight : halfH + 4;
              ctx.fillStyle = channelColors[channelIdx];
              ctx.globalAlpha = 0.85;
              ctx.shadowColor = channelColors[channelIdx];
              ctx.shadowBlur = currentApp.neonGlow ? 7 : 0;
              ctx.fillRect(index * slotWidth + 1, y, Math.max(1, slotWidth - 2), barHeight);
              if (currentApp.cavaPeakHold && channelPeaks[channelIdx][index] > channel[index]) {
                const peakY = channelIdx === 0
                  ? halfH - channelPeaks[channelIdx][index] * (halfH - 8)
                  : halfH + 4 + channelPeaks[channelIdx][index] * (halfH - 8);
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(index * slotWidth + 1, peakY, Math.max(1, slotWidth - 2), 2);
              }
            }
            ctx.globalAlpha = 1;
            ctx.strokeStyle = channelColors[channelIdx];
            ctx.globalAlpha = 0.24;
            ctx.beginPath();
            ctx.moveTo(0, (channelIdx + 1) * halfH);
            ctx.lineTo(w, (channelIdx + 1) * halfH);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
          break;
        }

        case "stereo_mirror": {
          const centerX = w / 2;
          const channelColors = [accent, "#f472b6"];
          const halfBands = Math.ceil(numBands / 2);
          const slotWidth = (w / 2) / halfBands;
          for (let channelIdx = 0; channelIdx < 2; channelIdx++) {
            const channel = channelBands[channelIdx];
            for (let index = 0; index < halfBands; index++) {
              const level = channel[index] || 0;
              const barHeight = level * h * 0.9;
              const x = channelIdx === 0
                ? centerX - (index + 1) * slotWidth
                : centerX + index * slotWidth;
              ctx.fillStyle = channelColors[channelIdx];
              ctx.shadowColor = channelColors[channelIdx];
              ctx.shadowBlur = currentApp.neonGlow ? 8 : 0;
              ctx.fillRect(x + 1, h - barHeight, Math.max(1, slotWidth - 2), barHeight);
            }
          }
          break;
        }

        case "led_matrix": {
          const barWidth = w / numBands;
          const rows = 12;
          const rowH = (h - 10) / rows;

          for (let i = 0; i < numBands; i++) {
            const litRows = currentIsPlaying ? Math.floor(currentBands[i] * rows) : 0;
            const x = i * barWidth;

            for (let r = 0; r < rows; r++) {
              const y = h - (r + 1) * rowH;
              const isLit = r < litRows;
              let segColor = accent;
              if (r > 8) segColor = "#f43f5e";

              ctx.fillStyle = isLit ? segColor : "#1e293b";
              ctx.shadowColor = isLit ? segColor : "transparent";
              ctx.shadowBlur = isLit && currentApp.neonGlow ? 4 : 0;
              ctx.fillRect(x + 1, y + 1, barWidth - 2, rowH - 2);
            }
          }
          break;
        }

        case "mirror": {
          const halfH = h / 2;
          const barWidth = w / numBands;

          for (let i = 0; i < numBands; i++) {
            const barH = currentBands[i] * (halfH - 5);
            const x = i * barWidth;

            if (barH > 1) {
              ctx.fillStyle = accent;
              ctx.shadowColor = accent;
              ctx.shadowBlur = currentApp.neonGlow ? 8 : 0;

              ctx.fillRect(x + 1, halfH - barH, barWidth - 2, barH);
              ctx.fillRect(x + 1, halfH, barWidth - 2, barH);
            }
          }
          break;
        }

        case "gradient_flow": {
          const grad = ctx.createLinearGradient(0, 0, w, 0);
          grad.addColorStop(0, "#06b6d4");
          grad.addColorStop(0.33, "#3b82f6");
          grad.addColorStop(0.66, "#8b5cf6");
          grad.addColorStop(1, "#ec4899");

          ctx.beginPath();
          ctx.moveTo(0, h);

          for (let i = 0; i < numBands; i++) {
            const x = (i / (numBands - 1)) * w;
            const y = h - currentBands[i] * (h - 15);
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.closePath();

          ctx.fillStyle = grad;
          ctx.shadowColor = accent;
          ctx.shadowBlur = currentApp.neonGlow ? 12 : 0;
          ctx.fill();
          break;
        }

        case "peak_meter": {
          const barWidth = (w / numBands) * 0.8;
          const gap = (w / numBands) * 0.2;

          for (let i = 0; i < numBands; i++) {
            const x = i * (barWidth + gap);
            const barH = currentBands[i] * (h - 15);
            const y = h - barH;

            if (barH > 1) {
              ctx.fillStyle = `${accent}bb`;
              ctx.fillRect(x, y, barWidth, barH);
            }

            if (peaks[i] > 0.02) {
              const peakY = h - peaks[i] * (h - 15);
              ctx.fillStyle = "#ef4444";
              ctx.shadowColor = "#ef4444";
              ctx.shadowBlur = 8;
              ctx.fillRect(x, peakY - 3, barWidth, 3);
            }
          }
          break;
        }
      }
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  ondblclick={handleDoubleClick}
  class="w-full h-full relative rounded-lg overflow-hidden border border-slate-800/80 bg-slate-950/90 shadow-inner cursor-pointer group"
  style:height={height ? `${height}px` : undefined}
  style={visualStyle === "retro_needle" || visualStyle === "retro_scope_meter"
    ? "background-color: var(--app-bg); border-color: var(--app-border)"
    : undefined}
  title="Doble clic para cambiar estilo de espectro"
>
  <canvas bind:this={canvas} class="w-full h-full block"></canvas>
  {#if isEditing}
    <div class="absolute top-1 right-1 z-30">
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <select
        value={visualStyle}
        onchange={(e) => setStyleAndSave(e.currentTarget.value as SpectrumStyle)}
        onclick={(e) => e.stopPropagation()}
        ondblclick={(e) => e.stopPropagation()}
        class="bg-slate-900/95 border border-cyan-500/50 text-[10px] text-cyan-300 rounded px-1.5 py-0.5 font-mono focus:outline-none focus:border-cyan-400 cursor-pointer shadow-lg backdrop-blur"
      >
        {#each SPECTRUM_STYLES as s (s.id)}
          <option value={s.id}>
            {s.name}
          </option>
        {/each}
      </select>
    </div>
  {/if}
</div>
