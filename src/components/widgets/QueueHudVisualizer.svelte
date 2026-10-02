<script lang="ts">
  import { onMount } from "svelte";
  import { useMusicStore } from "../../store/index.ts";

  interface Props {
    mode?: "spectrum" | "wave" | "cyber_flux";
    accentColor?: string;
  }

  let {
    mode = "spectrum",
    accentColor = "#06b6d4",
  }: Props = $props();

  let canvasRef = $state<HTMLCanvasElement | null>(null);

  onMount(() => {
    const canvas = canvasRef;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let lastTime = performance.now();
    let phase = 0;

    // Smoothed values & peak tracking for HD spectrum (48 bands)
    const BANDS_48 = 48;
    const smoothedBands = new Float32Array(BANDS_48);
    const peakCaps = new Float32Array(BANDS_48);
    const peakSpeeds = new Float32Array(BANDS_48);

    // Stereo bands for cyber_flux (32 bands per channel = 64 total)
    const BANDS_STEREO = 32;
    const leftBands = new Float32Array(BANDS_STEREO);
    const rightBands = new Float32Array(BANDS_STEREO);

    // Particle system for cyber_flux
    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
      size: number;
      hueShift: number;
    }
    const particles: Particle[] = [];
    const MAX_PARTICLES = 36;

    const resize = () => {
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
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const render = (time: number) => {
      animId = requestAnimationFrame(render);
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      const width = canvas.width;
      const height = canvas.height;
      if (width <= 0 || height <= 0) return;

      // Always read fresh telemetry directly from store
      const store = useMusicStore.getState();
      const tele = store.telemetry;
      const active = (store.isPlaying || tele.state === "Playing") && tele.state !== "Stopped" && tele.state !== "Paused";
      const vol = Math.min(1, tele.volume ?? store.volume ?? 1);

      const spectrum = tele.spectrum || [];
      const spectrumLeft = tele.spectrum_left?.length ? tele.spectrum_left : spectrum;
      const spectrumRight = tele.spectrum_right?.length ? tele.spectrum_right : spectrum;

      ctx.clearRect(0, 0, width, height);

      // -------------------------------------------------------------
      // MODE 1: HIGH DEFINITION SPECTRUM (Real song FFT 48-bands)
      // -------------------------------------------------------------
      if (mode === "spectrum") {
        const gap = Math.max(1.5, Math.floor(width / (BANDS_48 * 4.5)));
        const totalGaps = (BANDS_48 - 1) * gap;
        const barWidth = Math.max(2, (width - totalGaps) / BANDS_48);
        const baseline = height - 1;
        const maxBarH = baseline * 0.94;

        for (let i = 0; i < BANDS_48; i++) {
          let raw = 0;
          if (active && spectrum.length > 0) {
            // Logarithmic mapping: power curve gives emphasis to bass and musical mid-tones
            const specIdx = Math.floor(Math.pow(i / BANDS_48, 1.28) * spectrum.length);
            const val = spectrum[Math.min(specIdx, spectrum.length - 1)] || 0;
            // Amplification with perceptual loudness curve
            raw = Math.min(1, Math.pow(Math.max(0, val), 0.72) * 1.65 * vol);
          } else {
            // Subtle idle resting ripple
            raw = 0.03 + 0.02 * Math.sin(time * 0.003 + i * 0.22);
          }

          // Ballistics: fast rise, studio gravity decay
          if (raw > smoothedBands[i]) {
            smoothedBands[i] += (raw - smoothedBands[i]) * Math.min(1, dt * 26);
          } else {
            smoothedBands[i] += (raw - smoothedBands[i]) * Math.min(1, dt * 8);
          }

          const barH = Math.max(1.5, smoothedBands[i] * maxBarH);

          // Peak caps physics
          if (barH >= peakCaps[i]) {
            peakCaps[i] = barH;
            peakSpeeds[i] = 0;
          } else {
            peakSpeeds[i] += dt * 55;
            peakCaps[i] = Math.max(1.5, peakCaps[i] - peakSpeeds[i] * dt * 20);
          }

          const x = i * (barWidth + gap);
          const y = baseline - barH;

          // Studio gradient: deep saturated base to bright luminous head
          const grad = ctx.createLinearGradient(0, baseline, 0, y);
          grad.addColorStop(0, `${accentColor}30`);
          grad.addColorStop(0.7, accentColor);
          grad.addColorStop(1, "#f8fafc");

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barH, [1.5, 1.5, 0, 0]);
          ctx.fill();

          // High-visibility glowing peak indicator
          const peakY = baseline - peakCaps[i];
          ctx.fillStyle = active ? "#ffffff" : `${accentColor}aa`;
          ctx.fillRect(x, Math.max(0, peakY - 1.2), barWidth, 1.2);
        }
      }

      // -------------------------------------------------------------
      // MODE 2: CONTINUOUS FLUID OSCILLOSCOPE WAVE
      // -------------------------------------------------------------
      else if (mode === "wave") {
        phase += active ? dt * 4.2 : dt * 1.5;

        // Calculate bass & overall power
        let bassEnergy = 0;
        let midEnergy = 0;
        if (active && spectrum.length > 0) {
          const sampleCount = Math.min(12, spectrum.length);
          for (let s = 0; s < sampleCount; s++) {
            bassEnergy += spectrum[s] || 0;
          }
          bassEnergy = (bassEnergy / sampleCount) * vol;

          const midCount = Math.min(32, spectrum.length);
          for (let s = sampleCount; s < midCount; s++) {
            midEnergy += spectrum[s] || 0;
          }
          midEnergy = (midEnergy / (midCount - sampleCount)) * vol;
        } else {
          bassEnergy = 0.08;
          midEnergy = 0.04;
        }

        const midY = height * 0.52;
        const amplitude = Math.min(height * 0.44, Math.max(4, height * (bassEnergy * 0.65 + midEnergy * 0.35 + 0.1)));
        const pointsCount = 42;
        const step = width / (pointsCount - 1);
        const points: { x: number; y: number }[] = [];

        for (let i = 0; i < pointsCount; i++) {
          const x = i * step;
          const normX = i / (pointsCount - 1);
          const envelope = Math.sin(normX * Math.PI); // Pin ends to center line

          const freqVal = active && spectrum.length > 0
            ? (spectrum[Math.min(i, spectrum.length - 1)] || 0) * 0.8
            : 0;

          const wave =
            Math.sin(normX * 10 + phase) * 0.6 +
            Math.sin(normX * 22 - phase * 1.4) * 0.28 +
            Math.cos(normX * 36 + phase * 2) * (0.12 + freqVal * 0.3);

          const y = midY + wave * amplitude * envelope;
          points.push({ x, y });
        }

        // Draw glowing translucent fluid underfill
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
        areaGrad.addColorStop(0, `${accentColor}44`);
        areaGrad.addColorStop(0.6, `${accentColor}18`);
        areaGrad.addColorStop(1, "transparent");
        ctx.fillStyle = areaGrad;
        ctx.fill();

        // Draw main illuminated neon wave crest
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 0; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2;
          const yc = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2.2;
        ctx.shadowColor = accentColor;
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Bright white core ribbon
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // -------------------------------------------------------------
      // MODE 3: STEREO CYBER-FLUX (Dual Quantum Holographic Prism)
      // -------------------------------------------------------------
      else if (mode === "cyber_flux") {
        phase += dt * 3.5;

        // Stereo split geometry
        const halfWidth = width / 2;
        const horizonY = height * 0.72; // 72% upper laser field, 28% ground mirror
        const maxLaserH = horizonY * 0.92;
        const barW = Math.max(1.8, (halfWidth - 4) / BANDS_STEREO - 1);
        const gap = 1;

        let bassKick = 0;
        if (active && spectrum.length > 0) {
          bassKick = ((spectrum[0] || 0) + (spectrum[1] || 0) + (spectrum[2] || 0)) / 3;
        }

        // Spawn particles on strong bass transient
        if (active && bassKick > 0.45 && particles.length < MAX_PARTICLES) {
          const spawnCount = Math.floor(bassKick * 3);
          for (let p = 0; p < spawnCount; p++) {
            particles.push({
              x: width * 0.5 + (Math.random() - 0.5) * width * 0.7,
              y: horizonY - 2,
              vx: (Math.random() - 0.5) * 45,
              vy: -(Math.random() * 50 + 35),
              life: 1.0,
              maxLife: Math.random() * 0.6 + 0.4,
              size: Math.random() * 2 + 1.2,
              hueShift: Math.random() * 40 - 20,
            });
          }
        }

        // Draw Left Channel (firing mirrored outward from center or left-to-center)
        for (let i = 0; i < BANDS_STEREO; i++) {
          const specIdx = Math.floor(Math.pow(i / BANDS_STEREO, 1.25) * spectrumLeft.length);
          const rawL = active && spectrumLeft.length > 0
            ? Math.min(1, Math.pow(Math.max(0, spectrumLeft[specIdx] || 0), 0.7) * 1.7 * vol)
            : 0.04 + 0.03 * Math.sin(time * 0.003 - i * 0.2);

          const rawR = active && spectrumRight.length > 0
            ? Math.min(1, Math.pow(Math.max(0, spectrumRight[specIdx] || 0), 0.7) * 1.7 * vol)
            : 0.04 + 0.03 * Math.sin(time * 0.003 + i * 0.2);

          leftBands[i] += (rawL - leftBands[i]) * Math.min(1, dt * 22);
          rightBands[i] += (rawR - rightBands[i]) * Math.min(1, dt * 22);

          const hL = Math.max(1, leftBands[i] * maxLaserH);
          const hR = Math.max(1, rightBands[i] * maxLaserH);

          // Left channel x: going from center leftward
          const xL = halfWidth - 2 - (i + 1) * (barW + gap);
          // Right channel x: going from center rightward
          const xR = halfWidth + 2 + i * (barW + gap);

          // Render Left Laser Beam
          const gradL = ctx.createLinearGradient(0, horizonY, 0, horizonY - hL);
          gradL.addColorStop(0, `${accentColor}30`);
          gradL.addColorStop(0.7, accentColor);
          gradL.addColorStop(1, "#38bdf8");

          ctx.fillStyle = gradL;
          ctx.fillRect(xL, horizonY - hL, barW, hL);

          // Laser tip
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(xL, horizonY - hL, barW, 1.5);

          // Left Specular Floor Reflection
          const reflectHL = hL * 0.38;
          const refGradL = ctx.createLinearGradient(0, horizonY, 0, horizonY + reflectHL);
          refGradL.addColorStop(0, `${accentColor}50`);
          refGradL.addColorStop(1, "transparent");
          ctx.fillStyle = refGradL;
          ctx.fillRect(xL, horizonY + 1, barW, reflectHL);

          // Render Right Laser Beam
          const gradR = ctx.createLinearGradient(0, horizonY, 0, horizonY - hR);
          gradR.addColorStop(0, `${accentColor}30`);
          gradR.addColorStop(0.7, accentColor);
          gradR.addColorStop(1, "#ec4899");

          ctx.fillStyle = gradR;
          ctx.fillRect(xR, horizonY - hR, barW, hR);

          // Right tip
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(xR, horizonY - hR, barW, 1.5);

          // Right Specular Floor Reflection
          const reflectHR = hR * 0.38;
          const refGradR = ctx.createLinearGradient(0, horizonY, 0, horizonY + reflectHR);
          refGradR.addColorStop(0, `${accentColor}50`);
          refGradR.addColorStop(1, "transparent");
          ctx.fillStyle = refGradR;
          ctx.fillRect(xR, horizonY + 1, barW, reflectHR);
        }

        // Center stereo divider line
        ctx.fillStyle = `${accentColor}88`;
        ctx.fillRect(halfWidth - 0.5, 0, 1, horizonY);
        // Horizon neon guideline
        ctx.fillStyle = `${accentColor}40`;
        ctx.fillRect(0, horizonY, width, 1);

        // Update and draw floating energy particles
        for (let p = particles.length - 1; p >= 0; p--) {
          const pt = particles[p];
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          pt.life -= dt / pt.maxLife;

          if (pt.life <= 0 || pt.y < 0) {
            particles.splice(p, 1);
            continue;
          }

          const alpha = Math.max(0, pt.life);
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
          ctx.shadowColor = accentColor;
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size * alpha, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
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

<canvas
  bind:this={canvasRef}
  class="w-full h-8 block rounded bg-black/20"
></canvas>
