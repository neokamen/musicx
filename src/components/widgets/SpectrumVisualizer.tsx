import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/index.ts';

export type SpectrumStyle =
  | 'bars'
  | 'wave'
  | 'circular'
  | 'oscilloscope'
  | 'stereo_vu'
  | 'stereo_vu_vertical'
  | 'retro_needle'
  | 'stereo_wave'
  | 'stereo_split'
  | 'stereo_mirror'
  | 'neon_pulse'
  | 'led_matrix'
  | 'mirror'
  | 'gradient_flow'
  | 'peak_meter'
  | 'retro_glow_meter'
  | 'retro_tube_meter'
  | 'retro_scope_meter';

export const SPECTRUM_STYLES: { id: SpectrumStyle; name: string }[] = [
  { id: 'bars', name: 'Espectro de Barras Hi-Fi' },
  { id: 'wave', name: 'Onda Fluida Continua' },
  { id: 'circular', name: 'Espectro Radial / Circular' },
  { id: 'oscilloscope', name: 'Osciloscopio Láser' },
  { id: 'stereo_vu', name: 'Vúmetro Estéreo' },
  { id: 'stereo_vu_vertical', name: 'Vúmetro Estéreo Vertical' },
  { id: 'retro_needle', name: 'Aguja Retro de Minicadena' },
  { id: 'retro_glow_meter', name: 'Agujas Neón · Doble VU' },
  { id: 'retro_tube_meter', name: 'Válvulas de Fósforo' },
  { id: 'retro_scope_meter', name: 'Osciloscopio Analógico' },
  { id: 'stereo_wave', name: 'Ondas Estéreo' },
  { id: 'stereo_split', name: 'Espectro Estéreo Dividido' },
  { id: 'stereo_mirror', name: 'Espectro Estéreo Espejo' },
  { id: 'neon_pulse', name: 'Anillos Neón Pulsantes' },
  { id: 'led_matrix', name: 'Matriz LED de Segmentos' },
  { id: 'mirror', name: 'Espectro Simétrico Espejo' },
  { id: 'gradient_flow', name: 'Cinta Térmica Fluida' },
  { id: 'peak_meter', name: 'Caída de Picos con Gravedad' },
];

export interface SpectrumVisualizerProps {
  height?: number;
}

export const SpectrumVisualizer: React.FC<SpectrumVisualizerProps> = ({
  height,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const telemetry = useAppStore((s) => s.telemetry);
  const isPlayingStore = useAppStore((s) => s.isPlaying);
  const storeVolume = useAppStore((s) => s.volume);
  const appearance = useAppStore((s) => s.appearance);
  const setAppearance = useAppStore((s) => s.setAppearance);

  const isPlaying = (isPlayingStore || telemetry.state === 'Playing') && telemetry.state !== 'Stopped' && telemetry.state !== 'Paused';
  const volume = telemetry.volume ?? storeVolume ?? 1;
  const numBands = Math.max(16, Math.min(128, appearance.cavaBars || 64));
  const latestState = useRef({ telemetry, isPlaying, volume, appearance });
  latestState.current = { telemetry, isPlaying, volume, appearance };

  // Double-click to cycle spectrum visualizer styles
  const handleDoubleClick = () => {
    const currentStyle = appearance.spectrumStyle || 'bars';
    const currentIndex = SPECTRUM_STYLES.findIndex((s) => s.id === currentStyle);
    const nextIndex = (currentIndex + 1) % SPECTRUM_STYLES.length;
    setAppearance({ spectrumStyle: SPECTRUM_STYLES[nextIndex].id });
  };

  // Ultra-fluid 60 FPS continuous physics rendering loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let lastTime = performance.now();

    const currentBands = new Float32Array(numBands);
    const peaks = new Float32Array(numBands);
    const peakVelocity = new Float32Array(numBands);
    const channelBands = [new Float32Array(numBands), new Float32Array(numBands)];
    const channelPeaks = [new Float32Array(numBands), new Float32Array(numBands)];
    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      const liveState = latestState.current;
      const { telemetry, isPlaying, volume, appearance } = liveState;
      const frameInterval = 1000 / Math.max(30, appearance.spectrumFps || 60);
      if (now - lastTime < frameInterval) return;
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const rect = canvas.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      const canvasWidth = Math.max(1, Math.floor(rect.width * pixelRatio));
      const canvasHeight = Math.max(1, Math.floor(rect.height * pixelRatio));
      if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
      }

      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      if (w === 0 || h === 0) return;

      const accent = appearance.accentColor || '#06b6d4';
      const timeSec = now / 1000;

      // Extract real audio spectrum values from Rust telemetry
      const targetBands = telemetry.spectrum && telemetry.spectrum.length > 0
        ? telemetry.spectrum
        : [];
      const targetChannels = [telemetry.spectrum_left, telemetry.spectrum_right];
      const spectrumGain = (appearance.spectrumSensitivity / 100) * 1.7;
      const amplifyBand = (value: number) => Math.min(
        1,
        Math.pow(Math.max(0, value), 0.72) * spectrumGain * Math.min(1, volume),
      );

      for (let i = 0; i < numBands; i++) {
        if (!isPlaying || volume === 0) {
          // Smooth decay when paused/stopped
          currentBands[i] = Math.max(0, currentBands[i] - dt * 2.5);
        } else if (targetBands.length > 0) {
          const specIdx = Math.floor((i / numBands) * targetBands.length);
          const rawVal = amplifyBand(targetBands[specIdx] || 0);
          // Exponential decay/attack interpolation (ultra smooth curve style)
          const factor = 1 - Math.exp(-dt * (22 - appearance.cavaSmoothing * 0.16));
          currentBands[i] += (rawVal - currentBands[i]) * factor;
        } else if (appearance.cavaOfflineFallback) {
          // Dynamic organic wave synthesis during active playback
          const synth = Math.min(1, (Math.sin(timeSec * 5 + i * 0.4) * 0.4 + 0.5) * Math.min(1, volume) * 0.85 * (appearance.spectrumSensitivity / 100));
          const factor = 1 - Math.exp(-dt * (18 - appearance.cavaSmoothing * 0.12));
          currentBands[i] += (synth - currentBands[i]) * factor;
        } else {
          currentBands[i] = Math.max(0, currentBands[i] - dt * 2.5);
        }

        for (let channelIdx = 0; channelIdx < 2; channelIdx++) {
          const channelSpectrum = targetChannels[channelIdx]?.length ? targetChannels[channelIdx] : targetBands;
          if (!isPlaying || volume === 0) {
            channelBands[channelIdx][i] = Math.max(0, channelBands[channelIdx][i] - dt * 2.5);
          } else if (channelSpectrum.length > 0) {
            const channelIndex = Math.floor((i / numBands) * channelSpectrum.length);
            const value = amplifyBand(channelSpectrum[channelIndex] || 0);
            const channelFactor = 1 - Math.exp(-dt * (22 - appearance.cavaSmoothing * 0.16));
            channelBands[channelIdx][i] += (value - channelBands[channelIdx][i]) * channelFactor;
          } else {
            channelBands[channelIdx][i] = Math.max(0, channelBands[channelIdx][i] - dt * 2.5);
          }
          channelPeaks[channelIdx][i] = appearance.cavaPeakHold
            ? Math.max(channelBands[channelIdx][i], channelPeaks[channelIdx][i] - dt * 0.7)
            : channelBands[channelIdx][i];
        }

        // Gravity physics for peaks
        if (!appearance.cavaPeakHold || appearance.cavaGravity === 'instant') {
          peaks[i] = currentBands[i];
          peakVelocity[i] = 0;
        } else if (currentBands[i] > peaks[i]) {
          peaks[i] = currentBands[i];
          peakVelocity[i] = 0;
        } else {
          peakVelocity[i] += dt * (appearance.cavaGravity === 'studio' ? 0.65 : 1.2);
          peaks[i] = Math.max(0, peaks[i] - peakVelocity[i] * dt * 60);
        }
      }

      const style = appearance.spectrumStyle || 'bars';

      switch (style) {
        case 'bars': {
          const barWidth = (w / numBands) * 0.8;
          const gap = (w / numBands) * 0.2;
          for (let i = 0; i < numBands; i++) {
            // Bars reach up to 98% of total height for full impact
            const barHeight = Math.max(2, currentBands[i] * (h - 4));
            const x = i * (barWidth + gap) + gap / 2;
            const y = h - barHeight;

            if (barHeight > 2) {
              const grad = ctx.createLinearGradient(0, h, 0, 0);
              grad.addColorStop(0, `${accent}40`);
              grad.addColorStop(0.65, accent);
              grad.addColorStop(1, '#ffffff');

              ctx.fillStyle = grad;
              ctx.shadowColor = accent;
              ctx.shadowBlur = appearance.neonGlow ? (appearance.neonIntensity / 100) * 10 : 0;
              ctx.fillRect(x, y, barWidth, barHeight);
            }

            if (peaks[i] > 0.02) {
              const peakY = Math.max(2, h - peaks[i] * (h - 4));
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(x, peakY - 2, barWidth, 2);
            }
          }
          break;
        }

        case 'wave': {
          ctx.beginPath();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = accent;
          ctx.shadowColor = accent;
          ctx.shadowBlur = appearance.neonGlow ? (appearance.neonIntensity / 100) * 15 : 0;

          const centerY = h / 2;
          ctx.moveTo(0, centerY);

          for (let x = 0; x < w; x += 4) {
            const idx = Math.floor((x / w) * numBands);
            const amp = currentBands[idx] * (h / 2.5);
            const waveY = centerY + (isPlaying ? Math.sin(x * 0.06 + timeSec * 14) * amp : 0);
            ctx.lineTo(x, waveY);
          }
          ctx.stroke();
          if (appearance.cavaMirrored) {
            ctx.beginPath();
            ctx.moveTo(0, centerY);
            for (let x = 0; x < w; x += 4) {
              const idx = Math.floor((x / w) * numBands);
              const amp = currentBands[idx] * (h / 2.5);
              const waveY = centerY - (isPlaying ? Math.sin(x * 0.06 + timeSec * 14) * amp : 0);
              ctx.lineTo(x, waveY);
            }
            ctx.stroke();
          }
          break;
        }

        case 'circular': {
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
            ctx.shadowBlur = appearance.neonGlow ? (appearance.neonIntensity / 100) * 10 : 0;
            ctx.stroke();
          }
          break;
        }

        case 'oscilloscope': {
          ctx.beginPath();
          ctx.lineWidth = 2;
          ctx.strokeStyle = accent;
          ctx.shadowColor = accent;
          ctx.shadowBlur = 12;

          for (let i = 0; i < numBands; i++) {
            const t = (i / numBands) * Math.PI * 2;
            const r = currentBands[i] * (h / 2.2);
            const x = w / 2 + (isPlaying ? Math.cos(t * 3 + timeSec * 5) * (r + 10) : 0);
            const y = h / 2 + (isPlaying ? Math.sin(t * 5 + timeSec * 7) * (r + 10) : 0);

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
          break;
        }

        case 'stereo_vu': {
          const halfH = h / 2;

          for (let channelIdx = 0; channelIdx < 2; channelIdx++) {
            const startY = channelIdx * halfH;
            const barHeight = halfH - 12;
            const totalSegments = 24;

            const avgAmp = isPlaying
              ? channelBands[channelIdx].reduce((sum, band) => sum + band, 0) / numBands
              : 0;

            const activeSegs = Math.floor(avgAmp * totalSegments);
            const segW = w / totalSegments;

            for (let s = 0; s < totalSegments; s++) {
              const segX = s * segW;
              const isLit = s < activeSegs;

              let color = '#22c55e';
              if (s > 16) color = '#f59e0b';
              if (s > 21) color = '#ef4444';

              ctx.fillStyle = isLit ? color : '#1e293b';
              ctx.shadowColor = isLit ? color : 'transparent';
              ctx.shadowBlur = isLit && appearance.neonGlow ? 6 : 0;
              ctx.fillRect(segX, startY + 16, segW - 2, barHeight - 8);
            }
          }
          break;
        }

        case 'stereo_vu_vertical': {
          const totalSegments = 24;
          const meterWidth = Math.min(48, w * 0.24);
          const meterGap = Math.min(44, w * 0.18);
          const meterHeight = h * 0.72;
          const segmentHeight = meterHeight / totalSegments;
          const top = (h - meterHeight) / 2;
          const startX = (w - meterWidth * 2 - meterGap) / 2;

          for (let channelIdx = 0; channelIdx < 2; channelIdx++) {
            const avgAmp = isPlaying
              ? channelBands[channelIdx].reduce((sum, band) => sum + band, 0) / numBands
              : 0;
            const litSegments = Math.floor(avgAmp * totalSegments);
            const x = startX + channelIdx * (meterWidth + meterGap);

            ctx.fillStyle = '#0f172a';
            ctx.fillRect(x, top, meterWidth, meterHeight);
            for (let segment = 0; segment < totalSegments; segment++) {
              const level = segment / totalSegments;
              const color = level > 0.88 ? '#ef4444' : level > 0.68 ? '#f59e0b' : '#22c55e';
              const y = top + meterHeight - (segment + 1) * segmentHeight;
              ctx.fillStyle = segment < litSegments ? color : '#1e293b';
              ctx.shadowColor = segment < litSegments ? color : 'transparent';
              ctx.shadowBlur = segment < litSegments && appearance.neonGlow ? 5 : 0;
              ctx.fillRect(x + 3, y + 1, meterWidth - 6, Math.max(1, segmentHeight - 2));
            }
            ctx.shadowBlur = 0;
          }
          break;
        }

        case 'retro_needle': {
          const gaugeWidth = w / 2;
          const radius = Math.min(gaugeWidth * 0.39, h * 0.52);
          const centerY = h * 0.77;

          for (let channelIdx = 0; channelIdx < 2; channelIdx++) {
            const centerX = gaugeWidth * (channelIdx + 0.5);
            const average = isPlaying
              ? channelBands[channelIdx].reduce((sum, band) => sum + band, 0) / numBands
              : 0;
            const cardX = channelIdx * gaugeWidth + 5;
            const cardWidth = gaugeWidth - 10;
            const arcRadius = Math.min(radius, cardWidth * 0.43);

            ctx.strokeStyle = appearance.accentColor || '#475569';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(cardX, 5, cardWidth, h - 10, 8);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(centerX, centerY, arcRadius, Math.PI, Math.PI * 2);
            ctx.strokeStyle = '#cbd5e1';
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
              ctx.strokeStyle = tick > 7 ? appearance.accentColor || '#fb7185' : '#94a3b8';
              ctx.lineWidth = tick > 7 ? 2 : 1;
              ctx.stroke();
            }

            const needleAngle = Math.PI + Math.min(1, average) * Math.PI;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(centerX + Math.cos(needleAngle) * arcRadius * 0.78, centerY + Math.sin(needleAngle) * arcRadius * 0.78);
            ctx.strokeStyle = accent;
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.shadowColor = accent;
            ctx.shadowBlur = appearance.neonGlow ? 5 : 0;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#e2e8f0';
            ctx.fill();
          }
          break;
        }

        case 'retro_glow_meter': {
          const gaugeWidth = w / 2;
          const radius = Math.min(gaugeWidth * 0.38, h * 0.38);
          const centerY = h * 0.5;
          const colors = [accent, '#44e6a8'];
          for (let channelIdx = 0; channelIdx < 2; channelIdx++) {
            const centerX = gaugeWidth * (channelIdx + 0.5);
            const level = isPlaying ? channelBands[channelIdx].reduce((sum, band) => sum + band, 0) / numBands : 0;
            const color = colors[channelIdx];
            const arc = (Math.PI * 2) * 0.82;
            ctx.fillStyle = '#081018';
            ctx.strokeStyle = `${color}55`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(channelIdx * gaugeWidth + 5, 4, gaugeWidth - 10, h - 8, 9);
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, Math.PI + 0.09, Math.PI + 0.09 + arc);
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 7;
            ctx.lineCap = 'round';
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
              ctx.strokeStyle = tick > 16 ? '#fb7185' : `${color}aa`;
              ctx.lineWidth = tick % 5 === 0 ? 1.5 : 0.8;
              ctx.stroke();
            }
            const needleAngle = Math.PI + 0.09 + arc * Math.min(1, level);
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(centerX + Math.cos(needleAngle) * radius * 0.83 * 1.25, centerY + Math.sin(needleAngle) * radius * 0.83 * 1.25);
            ctx.strokeStyle = '#f8fafc';
            ctx.lineWidth = 1.8;
            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.fillStyle = color;
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(channelIdx === 0 ? 'LEFT' : 'RIGHT', centerX, h - 8);
          }
          break;
        }

        case 'retro_tube_meter': {
          const gaugeWidth = w / 2;
          const radius = Math.min(gaugeWidth * 0.39, h * 0.53);
          const centerY = h * 0.78;
          for (let channelIdx = 0; channelIdx < 2; channelIdx++) {
            const centerX = gaugeWidth * (channelIdx + 0.5);
            const level = isPlaying ? channelBands[channelIdx].reduce((sum, band) => sum + band, 0) / numBands : 0;
            const warm = channelIdx === 0 ? '#fbbf24' : '#fb7185';
            const tubeGradient = ctx.createRadialGradient(centerX, centerY - radius * 0.35, 2, centerX, centerY, radius * 1.3);
            tubeGradient.addColorStop(0, '#38241a');
            tubeGradient.addColorStop(0.65, '#15191b');
            tubeGradient.addColorStop(1, '#080b0d');
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
              ctx.strokeStyle = `${warm}${glow === 0 ? 'bb' : '24'}`;
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
              ctx.strokeStyle = tick > 9 ? '#fb7185' : '#f8d59b';
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
            ctx.strokeStyle = '#ffe7bd';
            ctx.lineWidth = 2;
            ctx.shadowColor = warm;
            ctx.shadowBlur = 11;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#e7b86d';
            ctx.fill();
            ctx.fillStyle = '#d6a96f';
            ctx.font = '8px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(channelIdx === 0 ? 'VACUUM / L' : 'VACUUM / R', centerX, h - 10);
          }
          break;
        }

        case 'retro_scope_meter': {
          const gaugeWidth = w / 2;
          const radius = Math.min(gaugeWidth * 0.4, h * 0.54);
          const centerY = h * 0.79;
          for (let channelIdx = 0; channelIdx < 2; channelIdx++) {
            const centerX = gaugeWidth * (channelIdx + 0.5);
            const channel = channelBands[channelIdx];
            const level = isPlaying ? channel.reduce((sum, band) => sum + band, 0) / numBands : 0;
            const color = channelIdx === 0 ? '#38bdf8' : '#a3e635';
            ctx.fillStyle = '#06111a';
            ctx.beginPath();
            ctx.roundRect(channelIdx * gaugeWidth + 5, 5, gaugeWidth - 10, h - 10, 8);
            ctx.fill();
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(channelIdx * gaugeWidth + 6, 6, gaugeWidth - 12, h - 12, 7);
            ctx.clip();
            ctx.strokeStyle = `${color}20`;
            ctx.lineWidth = 1;
            for (let grid = 0; grid < 5; grid++) {
              const y = h * (0.24 + grid * 0.1);
              ctx.beginPath();
              ctx.moveTo(channelIdx * gaugeWidth + 10, y);
              ctx.lineTo((channelIdx + 1) * gaugeWidth - 10, y);
              ctx.stroke();
            }
            ctx.restore();
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, Math.PI, Math.PI * 2);
            ctx.strokeStyle = '#29404d';
            ctx.lineWidth = 2;
            ctx.stroke();
            const sweep = Math.PI * Math.min(1, level);
            const angle = Math.PI + sweep;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, Math.PI, angle);
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
            ctx.stroke();
            ctx.shadowBlur = 0;
            for (let tick = 0; tick <= 16; tick++) {
              const tickAngle = Math.PI + (tick / 16) * Math.PI;
              const inner = radius - (tick % 4 === 0 ? 9 : 5);
              ctx.beginPath();
              ctx.moveTo(centerX + Math.cos(tickAngle) * inner, centerY + Math.sin(tickAngle) * inner);
              ctx.lineTo(centerX + Math.cos(tickAngle) * radius, centerY + Math.sin(tickAngle) * radius);
              ctx.strokeStyle = tick > 13 ? '#fb7185' : `${color}cc`;
              ctx.lineWidth = tick % 4 === 0 ? 1.5 : 0.8;
              ctx.stroke();
            }
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(centerX + Math.cos(angle) * radius * 0.72, centerY + Math.sin(angle) * radius * 0.72);
            ctx.strokeStyle = '#f8fafc';
            ctx.lineWidth = 1.5;
            ctx.shadowColor = color;
            ctx.shadowBlur = 9;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.fillStyle = color;
            ctx.font = 'bold 8px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(channelIdx === 0 ? 'CH 01 · L' : 'CH 02 · R', centerX, h - 10);
          }
          break;
        }

        case 'stereo_wave': {
          for (let channelIdx = 0; channelIdx < 2; channelIdx++) {
            const centerY = channelIdx * (h / 2) + h / 4;
            const channel = channelBands[channelIdx];
            const channelColor = channelIdx === 0 ? accent : '#f472b6';
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
            ctx.shadowBlur = appearance.neonGlow ? 9 : 0;
            ctx.stroke();
          }
          break;
        }

        case 'stereo_split': {
          const halfH = h / 2;
          const channelColors = [accent, '#f472b6'];
          const slotWidth = w / numBands;
          for (let channelIdx = 0; channelIdx < 2; channelIdx++) {
            const channel = channelBands[channelIdx];
            for (let index = 0; index < numBands; index++) {
              const barHeight = channel[index] * (halfH - 8);
              const y = channelIdx === 0 ? halfH - barHeight : halfH + 4;
              ctx.fillStyle = channelColors[channelIdx];
              ctx.globalAlpha = 0.85;
              ctx.shadowColor = channelColors[channelIdx];
              ctx.shadowBlur = appearance.neonGlow ? 7 : 0;
              ctx.fillRect(index * slotWidth + 1, y, Math.max(1, slotWidth - 2), barHeight);
              if (appearance.cavaPeakHold && channelPeaks[channelIdx][index] > channel[index]) {
                const peakY = channelIdx === 0
                  ? halfH - channelPeaks[channelIdx][index] * (halfH - 8)
                  : halfH + 4 + channelPeaks[channelIdx][index] * (halfH - 8);
                ctx.fillStyle = '#ffffff';
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

        case 'stereo_mirror': {
          const centerX = w / 2;
          const channelColors = [accent, '#f472b6'];
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
              ctx.shadowBlur = appearance.neonGlow ? 8 : 0;
              ctx.fillRect(x + 1, h - barHeight, Math.max(1, slotWidth - 2), barHeight);
            }
          }
          break;
        }

        case 'neon_pulse': {
          const cx = w / 2;
          const cy = h / 2;
          const maxR = Math.min(w, h) * 0.45;
          const pulseVal = isPlaying ? currentBands.reduce((a, b) => a + b, 0) / numBands : 0;

          for (let ring = 1; ring <= 4; ring++) {
            const r = (maxR / 4) * ring * (0.8 + pulseVal * 0.4);
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(2, r), 0, Math.PI * 2);
            ctx.strokeStyle = `${accent}${Math.floor((1 - ring / 5) * 255)
              .toString(16)
              .padStart(2, '0')}`;
            ctx.lineWidth = 2 + ring;
            ctx.shadowColor = accent;
            ctx.shadowBlur = (appearance.neonIntensity / 100) * 16;
            ctx.stroke();
          }
          break;
        }

        case 'led_matrix': {
          const barWidth = w / numBands;
          const rows = 12;
          const rowH = (h - 10) / rows;

          for (let i = 0; i < numBands; i++) {
            const litRows = isPlaying ? Math.floor(currentBands[i] * rows) : 0;
            const x = i * barWidth;

            for (let r = 0; r < rows; r++) {
              const y = h - (r + 1) * rowH;
              const isLit = r < litRows;
              let segColor = accent;
              if (r > 8) segColor = '#f43f5e';

              ctx.fillStyle = isLit ? segColor : '#1e293b';
              ctx.shadowColor = isLit ? segColor : 'transparent';
              ctx.shadowBlur = isLit && appearance.neonGlow ? 4 : 0;
              ctx.fillRect(x + 1, y + 1, barWidth - 2, rowH - 2);
            }
          }
          break;
        }

        case 'mirror': {
          const halfH = h / 2;
          const barWidth = w / numBands;

          for (let i = 0; i < numBands; i++) {
            const barH = currentBands[i] * (halfH - 5);
            const x = i * barWidth;

            if (barH > 1) {
              ctx.fillStyle = accent;
              ctx.shadowColor = accent;
              ctx.shadowBlur = appearance.neonGlow ? 8 : 0;

              ctx.fillRect(x + 1, halfH - barH, barWidth - 2, barH);
              ctx.fillRect(x + 1, halfH, barWidth - 2, barH);
            }
          }
          break;
        }

        case 'gradient_flow': {
          const grad = ctx.createLinearGradient(0, 0, w, 0);
          grad.addColorStop(0, '#06b6d4');
          grad.addColorStop(0.33, '#3b82f6');
          grad.addColorStop(0.66, '#8b5cf6');
          grad.addColorStop(1, '#ec4899');

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
          ctx.shadowBlur = appearance.neonGlow ? 12 : 0;
          ctx.fill();
          break;
        }

        case 'peak_meter': {
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
              ctx.fillStyle = '#ef4444';
              ctx.shadowColor = '#ef4444';
              ctx.shadowBlur = 8;
              ctx.fillRect(x, peakY - 3, barWidth, 3);
            }
          }
          break;
        }
      }
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [numBands]);

  return (
    <div
      onDoubleClick={handleDoubleClick}
      className="w-full h-full relative rounded-lg overflow-hidden border border-slate-800/80 bg-slate-950/90 shadow-inner cursor-pointer"
      style={{
        ...(height ? { height } : {}),
        ...(appearance.spectrumStyle === 'retro_needle'
          ? { backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }
          : {}),
      }}
      title="Doble clic para cambiar estilo de espectro"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
