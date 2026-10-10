<script lang="ts">
  import { onMount } from "svelte";
  import { useMusicStore } from "../../store/index.ts";

  export type QueueHudMode =
    | "waveform"
    | "stereo_vu"
    | "cava_fluid"
    | "cava_dots"
    | "cava_lines"
    | "live_led_matrix"
    | "live_peak_fall"
    | "live_fluid_wave"
    | "fftw3_vector"
    | "fftw3_monitor";

  interface Props {
    mode?: QueueHudMode;
    accentColor?: string;
  }

  let {
    mode = "waveform",
    accentColor = "#06b6d4",
  }: Props = $props();

  let canvasRef = $state<HTMLCanvasElement | null>(null);

  onMount(() => {
    const canvas = canvasRef;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let phase = 0;
    let lastTime = performance.now();

    // Visual states for ballistic meters & peaks
    let vuLevelL = 0;
    let vuLevelR = 0;
    let vuPeakL = 0;
    let vuPeakR = 0;

    const cavaLevels = new Float32Array(64);

    const liveLevels = new Float32Array(48);
    const livePeaks = new Float32Array(48);
    const liveVelocities = new Float32Array(48);

    const fftwLevels = new Float32Array(48);
    const fftwPeaks = new Float32Array(48);
    const fftwVelocities = new Float32Array(48);

    const resize = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.max(1, Math.floor(rect.width * dpr));
      const targetH = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    };

    resize();

    const render = (time: number) => {
      animId = requestAnimationFrame(render);
      if (document.hidden) return;

      const store = useMusicStore.getState();
      const tele = store.telemetry;
      const curTrack = store.currentTrack;
      const duration = tele.duration > 0 ? tele.duration : (curTrack?.duration_seconds || 0);
      const curTime = tele.current_time || 0;
      const progress = duration > 0 ? Math.min(1, Math.max(0, curTime / duration)) : 0;
      const isPlaying = (store.isPlaying || tele.state === "Playing") && tele.state !== "Stopped" && tele.state !== "Paused";

      // Frame interval throttle
      const minInterval = isPlaying ? 16 : 60;
      if (time - lastTime < minInterval) return;

      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      resize();
      const width = canvas.width;
      const height = canvas.height;
      if (width <= 0 || height <= 0) return;

      ctx.clearRect(0, 0, width, height);

      // =========================================================================
      // 1. ONDA DE CANCIÓN HD (Waveform) - Interactivo con el ratón
      // =========================================================================
      if (mode === "waveform") {
        const rawPeaks = tele.seekbar_spectrum || [];
        const hasRealPeaks = rawPeaks.length > 0;
        const binCount = hasRealPeaks ? Math.max(256, rawPeaks.length * 2) : 280;

        const centerY = height * 0.5;
        const maxH = height * 0.45;
        const barW = Math.max(0.65, (width / binCount) * 0.72);
        const gap = (width - binCount * barW) / Math.max(1, binCount - 1);
        const cursorX = progress * width;

        const playedGrad = ctx.createLinearGradient(0, centerY - maxH, 0, centerY + maxH);
        playedGrad.addColorStop(0, `${accentColor}99`);
        playedGrad.addColorStop(0.5, `${accentColor}ff`);
        playedGrad.addColorStop(1, `${accentColor}99`);
        const unplayedFill = `${accentColor}35`;

        for (let i = 0; i < binCount; i++) {
          let amp = 0;
          if (hasRealPeaks) {
            const t = (i / (binCount - 1)) * (rawPeaks.length - 1);
            const i0 = Math.floor(t);
            const i1 = Math.min(rawPeaks.length - 1, i0 + 1);
            const frac = t - i0;
            const v0 = rawPeaks[i0] || 0;
            const v1 = rawPeaks[i1] || 0;
            amp = Math.max(0.04, Math.min(1, v0 * (1 - frac) + v1 * frac));
          } else {
            const norm = i / (binCount - 1);
            const env = Math.sin(norm * Math.PI);
            amp = (0.22 + 0.28 * Math.sin(norm * 18) + 0.18 * Math.sin(norm * 44) + 0.1 * Math.cos(norm * 88)) * env;
            amp = Math.max(0.05, Math.min(0.95, Math.abs(amp)));
          }

          const barH = Math.max(1.5, amp * maxH);
          const x = i * (barW + gap);
          const isPlayed = x <= cursorX;

          ctx.fillStyle = isPlayed ? playedGrad : unplayedFill;
          ctx.fillRect(x, centerY - barH, barW, barH * 2);
        }

        ctx.fillStyle = `${accentColor}20`;
        ctx.fillRect(0, centerY - 0.5, width, 1);

        if (duration > 0 || isPlaying) {
          ctx.fillStyle = "#ffffff";
          ctx.shadowColor = accentColor;
          ctx.shadowBlur = 6;
          ctx.fillRect(Math.max(0, cursorX - 1), centerY - maxH * 1.02, 1.5, maxH * 2.04);
          ctx.shadowBlur = 0;
        }
      }

      // =========================================================================
      // 2. VÚMETRO ESTÉREO BALÍSTICO dB (Reemplazo en Espacio 5)
      // =========================================================================
      else if (mode === "stereo_vu") {
        const specLeft = tele.spectrum_left?.length ? tele.spectrum_left : tele.spectrum || [];
        const specRight = tele.spectrum_right?.length ? tele.spectrum_right : tele.spectrum || [];

        let targetL = 0;
        let targetR = 0;

        if (isPlaying) {
          const countL = Math.min(24, specLeft.length);
          for (let i = 0; i < countL; i++) targetL += specLeft[i] || 0;
          targetL = countL > 0 ? Math.min(1, (targetL / countL) * 1.6) : 0;

          const countR = Math.min(24, specRight.length);
          for (let i = 0; i < countR; i++) targetR += specRight[i] || 0;
          targetR = countR > 0 ? Math.min(1, (targetR / countR) * 1.6) : 0;
        }

        vuLevelL += (targetL - vuLevelL) * (targetL > vuLevelL ? 0.38 : 0.08);
        vuLevelR += (targetR - vuLevelR) * (targetR > vuLevelR ? 0.38 : 0.08);

        vuPeakL = Math.max(vuLevelL, vuPeakL - dt * 0.45);
        vuPeakR = Math.max(vuLevelR, vuPeakR - dt * 0.45);

        const padX = 24;
        const availW = width - padX - 8;
        const barH = Math.max(6, Math.floor(height * 0.26));
        const yL = Math.floor(height * 0.22);
        const yR = Math.floor(height * 0.58);

        ctx.font = `bold ${Math.max(9, Math.floor(height * 0.22))}px monospace`;
        ctx.fillStyle = `${accentColor}bb`;
        ctx.fillText("L", 6, yL + barH * 0.85);
        ctx.fillText("R", 6, yR + barH * 0.85);

        // Meter background track with segment ticks
        ctx.fillStyle = "rgba(15, 23, 42, 0.7)";
        ctx.fillRect(padX, yL, availW, barH);
        ctx.fillRect(padX, yR, availW, barH);

        // Render channels
        const drawVuChannel = (y: number, level: number, peak: number) => {
          const filledW = Math.max(2, level * availW);
          const grad = ctx.createLinearGradient(padX, 0, padX + availW, 0);
          grad.addColorStop(0, `${accentColor}aa`);
          grad.addColorStop(0.7, `${accentColor}ff`);
          grad.addColorStop(0.85, "#fbbf24");
          grad.addColorStop(1, "#f43f5e");

          ctx.fillStyle = grad;
          ctx.fillRect(padX, y, filledW, barH);

          // Peak needle
          if (peak > 0.02) {
            const peakX = Math.min(padX + availW - 2, padX + peak * availW);
            ctx.fillStyle = peak > 0.85 ? "#f43f5e" : "#ffffff";
            ctx.shadowColor = peak > 0.85 ? "#f43f5e" : "#ffffff";
            ctx.shadowBlur = 6;
            ctx.fillRect(peakX, y - 1, 2, barH + 2);
            ctx.shadowBlur = 0;
          }

          // Reference dB scale tick marks
          ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
          const ticks = [0.25, 0.5, 0.7, 0.85];
          for (const t of ticks) {
            ctx.fillRect(padX + t * availW, y, 1, barH);
          }
        };

        drawVuChannel(yL, vuLevelL, vuPeakL);
        drawVuChannel(yR, vuLevelR, vuPeakR);

        // dB labels under meters
        ctx.font = "8px monospace";
        ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
        ctx.fillText("-20", padX, height - 2);
        ctx.fillText("-10", padX + availW * 0.5 - 8, height - 2);
        ctx.fillText("-3", padX + availW * 0.7 - 6, height - 2);
        ctx.fillText("0dB", padX + availW * 0.85 - 8, height - 2);
        ctx.fillText("+3", padX + availW - 12, height - 2);
      }

      // =========================================================================
      // 3. CAVA: ONDA FLUIDA (cava_fluid) - Clon exacto de la Onda Fluida Continua Mejorada del widget
      // =========================================================================
      else if (mode === "cava_fluid") {
        phase += isPlaying ? dt * 4.5 : dt * 1.6;

        let bassEnergy = 0;
        let midEnergy = 0;
        const spectrum = tele.spectrum || [];
        if (isPlaying && spectrum.length > 0) {
          const sampleCount = Math.min(12, spectrum.length);
          for (let s = 0; s < sampleCount; s++) {
            bassEnergy += spectrum[s] || 0;
          }
          bassEnergy = bassEnergy / sampleCount;

          const midCount = Math.min(32, spectrum.length);
          for (let s = sampleCount; s < midCount; s++) {
            midEnergy += spectrum[s] || 0;
          }
          midEnergy = midEnergy / Math.max(1, midCount - sampleCount);
        } else {
          bassEnergy = 0.08;
          midEnergy = 0.04;
        }

        const midY = height * 0.5;
        const amplitude = Math.min(height * 0.44, Math.max(3, height * (bassEnergy * 0.65 + midEnergy * 0.35 + 0.1)));
        const pointsCount = 48;
        const step = width / (pointsCount - 1);
        const points: { x: number; y: number }[] = [];

        for (let i = 0; i < pointsCount; i++) {
          const x = i * step;
          const normX = i / (pointsCount - 1);
          const envelope = Math.sin(normX * Math.PI);

          const freqVal = isPlaying && spectrum.length > 0
            ? (spectrum[Math.min(i, spectrum.length - 1)] || 0) * 0.8
            : 0;

          const wave =
            Math.sin(normX * 10 + phase) * 0.6 +
            Math.sin(normX * 22 - phase * 1.4) * 0.28 +
            Math.cos(normX * 36 + phase * 2) * (0.12 + freqVal * 0.3);

          const y = midY + wave * amplitude * envelope;
          points.push({ x, y });
        }

        // Draw translucent underfill
        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(points[0].x, points[0].y);
        for (let i = 0; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2;
          const yc = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        ctx.lineTo(width, height);
        ctx.closePath();

        const areaGrad = ctx.createLinearGradient(0, midY - amplitude, 0, height);
        areaGrad.addColorStop(0, `${accentColor}35`);
        areaGrad.addColorStop(0.7, `${accentColor}10`);
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

        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1.8;
        ctx.shadowColor = accentColor;
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // White core filament
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }

      // =========================================================================
      // 4. CAVA: PUNTOS (cava_dots)
      // =========================================================================
      else if (mode === "cava_dots") {
        const spectrum = tele.spectrum || [];
        const count = 36;
        const rows = 8;
        const slotWidth = width / count;
        const radius = Math.max(1, Math.min(2.8, slotWidth * 0.28));

        for (let i = 0; i < count; i++) {
          const raw = isPlaying && spectrum.length ? (spectrum[Math.floor((i / count) * spectrum.length)] || 0) : 0;
          cavaLevels[i] += (raw - cavaLevels[i]) * 0.32;
          const litRows = Math.ceil(cavaLevels[i] * rows);

          for (let r = 0; r < litRows; r++) {
            const x = i * slotWidth + slotWidth * 0.5;
            const y = height - 4 - r * ((height - 8) / rows);
            const color = r > 6 ? "#f43f5e" : r > 4 ? "#fbbf24" : accentColor;

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 6;
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      }

      // =========================================================================
      // 5. CAVA: LÍNEAS (cava_lines)
      // =========================================================================
      else if (mode === "cava_lines") {
        const spectrum = tele.spectrum || [];
        const count = 44;
        const slotWidth = width / count;
        const lineW = Math.max(1.2, slotWidth * 0.5);

        for (let i = 0; i < count; i++) {
          const raw = isPlaying && spectrum.length ? (spectrum[Math.floor((i / count) * spectrum.length)] || 0) : 0;
          cavaLevels[i] += (raw - cavaLevels[i]) * 0.34;
          const lineH = Math.max(2, cavaLevels[i] * (height - 6));
          const x = i * slotWidth + slotWidth * 0.5;

          const grad = ctx.createLinearGradient(0, height - lineH, 0, height);
          grad.addColorStop(0, "#ffffff");
          grad.addColorStop(0.25, accentColor);
          grad.addColorStop(1, `${accentColor}44`);

          ctx.beginPath();
          ctx.moveTo(x, height - 3);
          ctx.lineTo(x, height - 3 - lineH);
          ctx.strokeStyle = grad;
          ctx.lineWidth = lineW;
          ctx.lineCap = "round";
          ctx.shadowColor = accentColor;
          ctx.shadowBlur = 6;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      // =========================================================================
      // 6. EN VIVO: MATRIZ LED (live_led_matrix)
      // =========================================================================
      else if (mode === "live_led_matrix") {
        const spectrum = tele.spectrum || [];
        const numBands = 36;
        const rows = 8;
        const barWidth = width / numBands;
        const rowH = (height - 6) / rows;

        for (let i = 0; i < numBands; i++) {
          const raw = isPlaying && spectrum.length ? (spectrum[Math.floor((i / numBands) * spectrum.length)] || 0) : 0;
          liveLevels[i] += (raw - liveLevels[i]) * 0.36;
          const litRows = Math.floor(liveLevels[i] * rows);
          const x = i * barWidth;

          for (let r = 0; r < rows; r++) {
            const y = height - 3 - (r + 1) * rowH;
            const isLit = r < litRows;
            const segColor = r > 6 ? "#f43f5e" : r > 4 ? "#fbbf24" : accentColor;

            ctx.fillStyle = isLit ? segColor : "rgba(30, 41, 59, 0.4)";
            if (isLit) {
              ctx.shadowColor = segColor;
              ctx.shadowBlur = 4;
            }
            ctx.fillRect(x + 1, y + 1, barWidth - 2, rowH - 2);
            ctx.shadowBlur = 0;
          }
        }
      }

      // =========================================================================
      // 7. EN VIVO: CAÍDA DE PICOS (live_peak_fall)
      // =========================================================================
      else if (mode === "live_peak_fall") {
        const spectrum = tele.spectrum || [];
        const numBands = 38;
        const barWidth = (width / numBands) * 0.78;
        const gap = (width / numBands) * 0.22;

        for (let i = 0; i < numBands; i++) {
          const raw = isPlaying && spectrum.length ? (spectrum[Math.floor((i / numBands) * spectrum.length)] || 0) : 0;
          liveLevels[i] += (raw - liveLevels[i]) * 0.38;

          // Gravity on peaks
          if (liveLevels[i] > livePeaks[i]) {
            livePeaks[i] = liveLevels[i];
            liveVelocities[i] = 0;
          } else {
            liveVelocities[i] += dt * 1.4;
            livePeaks[i] = Math.max(0, livePeaks[i] - liveVelocities[i] * dt);
          }

          const x = i * (barWidth + gap);
          const barH = Math.max(1, liveLevels[i] * (height - 8));
          const y = height - 4 - barH;

          // Bar
          ctx.fillStyle = `${accentColor}cc`;
          ctx.fillRect(x, y, barWidth, barH);

          // Falling Peak
          if (livePeaks[i] > 0.04) {
            const peakY = height - 4 - livePeaks[i] * (height - 8);
            ctx.fillStyle = "#ef4444";
            ctx.shadowColor = "#ef4444";
            ctx.shadowBlur = 6;
            ctx.fillRect(x, peakY - 2, barWidth, 2);
            ctx.shadowBlur = 0;
          }
        }
      }

      // =========================================================================
      // 8. EN VIVO: ONDA FLUIDA CONTINUA MEJORADA (live_fluid_wave)
      // =========================================================================
      else if (mode === "live_fluid_wave") {
        phase += isPlaying ? dt * 4.6 : dt * 1.5;

        let bassEnergy = 0;
        let midEnergy = 0;
        const spectrum = tele.spectrum || [];
        if (isPlaying && spectrum.length > 0) {
          const sampleCount = Math.min(12, spectrum.length);
          for (let s = 0; s < sampleCount; s++) bassEnergy += spectrum[s] || 0;
          bassEnergy = bassEnergy / sampleCount;

          const midCount = Math.min(32, spectrum.length);
          for (let s = sampleCount; s < midCount; s++) midEnergy += spectrum[s] || 0;
          midEnergy = midEnergy / Math.max(1, midCount - sampleCount);
        }

        const midY = height * 0.5;
        const amplitude = Math.min(height * 0.44, Math.max(3, height * (bassEnergy * 0.65 + midEnergy * 0.35 + 0.1)));
        const pointsCount = 48;
        const step = width / (pointsCount - 1);
        const points: { x: number; y: number }[] = [];

        for (let i = 0; i < pointsCount; i++) {
          const x = i * step;
          const normX = i / (pointsCount - 1);
          const envelope = Math.sin(normX * Math.PI);
          const freqVal = isPlaying && spectrum.length > 0
            ? (spectrum[Math.min(i, spectrum.length - 1)] || 0) * 0.8
            : 0;

          const wave =
            Math.sin(normX * 10 + phase) * 0.6 +
            Math.sin(normX * 22 - phase * 1.4) * 0.28 +
            Math.cos(normX * 36 + phase * 2) * (0.12 + freqVal * 0.3);

          const y = midY + wave * amplitude * envelope;
          points.push({ x, y });
        }

        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(points[0].x, points[0].y);
        for (let i = 0; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2;
          const yc = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        ctx.lineTo(width, height);
        ctx.closePath();

        const areaGrad = ctx.createLinearGradient(0, midY - amplitude, 0, height);
        areaGrad.addColorStop(0, `${accentColor}38`);
        areaGrad.addColorStop(0.7, `${accentColor}10`);
        areaGrad.addColorStop(1, "transparent");
        ctx.fillStyle = areaGrad;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 0; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2;
          const yc = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1.8;
        ctx.shadowColor = accentColor;
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }

        // =========================================================================
      // 9. FFTW3: CURVA VECTORIAL (fftw3_vector) - Estudio analítico puro, trazo continuo sin relleno ni rejilla
      // =========================================================================
      else if (mode === "fftw3_vector") {
        const specLeft = tele.spectrum_left?.length ? tele.spectrum_left : tele.spectrum || [];
        const specRight = tele.spectrum_right?.length ? tele.spectrum_right : tele.spectrum || [];
        const numBands = 48;
        const maxLen = Math.max(specLeft.length, specRight.length);

        for (let i = 0; i < numBands; i++) {
          let raw = 0;
          if (isPlaying && maxLen > 0) {
            const idx = Math.floor((i / numBands) * maxLen);
            const valL = specLeft[idx] || 0;
            const valR = specRight[idx] || 0;
            raw = Math.max(valL, valR);
          }
          fftwLevels[i] += (raw - fftwLevels[i]) * 0.42;
        }

        const usableH = height - 4;
        const points: { x: number; y: number }[] = [];
        for (let i = 0; i < numBands; i++) {
          const x = (i / (numBands - 1)) * width;
          const val = fftwLevels[i];
          const y = Math.max(2, usableH - val * (usableH - 3));
          points.push({ x, y });
        }

        if (points.length > 1) {
          // Main vector curve (100% stroke only, NO underfill)
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 0; i < points.length - 1; i++) {
            const xc = (points[i].x + points[i + 1].x) / 2;
            const yc = (points[i].y + points[i + 1].y) / 2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
          }
          ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

          ctx.strokeStyle = accentColor;
          ctx.lineWidth = 2.0;
          ctx.stroke();

          // White filament optical core
          ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }

        // Discrete baseline
        ctx.fillStyle = `${accentColor}25`;
        ctx.fillRect(0, height - 1, width, 1);
      }

      // =========================================================================
      // 10. FFTW3: MONITOR DE FRECUENCIA (fftw3_monitor) - Matriz espectral de precisión a altura completa
      // =========================================================================
      else if (mode === "fftw3_monitor") {
        const spec = tele.spectrum || [];
        const numBands = 44;
        const slotW = width / numBands;
        const barW = Math.max(1.4, slotW - 1.2);
        const gap = slotW - barW;
        const usableH = height - 4;
        const segH = 2.5;
        const segGap = 1.2;
        const maxSegments = Math.max(1, Math.floor(usableH / (segH + segGap)));

        for (let i = 0; i < numBands; i++) {
          const raw = isPlaying && spec.length ? (spec[Math.floor((i / numBands) * spec.length)] || 0) : 0;
          fftwLevels[i] += (raw - fftwLevels[i]) * 0.44;

          if (fftwLevels[i] > fftwPeaks[i]) {
            fftwPeaks[i] = fftwLevels[i];
            fftwVelocities[i] = 0;
          } else {
            fftwVelocities[i] += dt * 1.6;
            fftwPeaks[i] = Math.max(0, fftwPeaks[i] - fftwVelocities[i] * dt);
          }

          const val = fftwLevels[i];
          const litSegments = Math.min(maxSegments, Math.floor(val * maxSegments));
          const x = i * slotW + gap / 2;

          // Render discrete phosphor segments
          for (let s = 0; s < litSegments; s++) {
            const segY = usableH - (s + 1) * (segH + segGap);
            const frac = s / maxSegments;
            const segColor = frac > 0.85 ? "#f43f5e" : frac > 0.65 ? "#f59e0b" : accentColor;
            ctx.fillStyle = segColor;
            ctx.fillRect(x, segY, barW, segH);
          }

          // Peak needle
          if (fftwPeaks[i] > 0.03) {
            const peakSeg = Math.min(maxSegments - 1, Math.floor(fftwPeaks[i] * maxSegments));
            const peakY = usableH - (peakSeg + 1) * (segH + segGap);
            ctx.fillStyle = fftwPeaks[i] > 0.85 ? "#f43f5e" : "#ffffff";
            ctx.fillRect(x, peakY - 0.5, barW, 1.5);
          }
        }
      }
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  });
</script>

<div class="relative w-full h-full overflow-hidden select-none pointer-events-none">
  <canvas
    bind:this={canvasRef}
    class="w-full h-full block rounded"
  ></canvas>
</div>
