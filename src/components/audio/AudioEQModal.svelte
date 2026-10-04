<script lang="ts">
  import {
    X,
    Zap,
    Music,
    ChevronDown,
    RefreshCw,
    Radio,
    SlidersHorizontal,
    Flame,
    Disc3,
    Layers,
  } from "@lucide/svelte";
  import { useMusicStore } from "../../store/index.ts";
  import type { EqBand, Preset } from "../../types/eq.ts";
  import { DEFAULT_BANDS, BAND_LABELS, BAND_NAMES, SOUNDIX_PRESETS } from "../../types/eq.ts";
  import FreqResponseCanvas from "./FreqResponseCanvas.svelte";
  import VerticalEqSlider from "./VerticalEqSlider.svelte";

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  const musicStore = useMusicStore;
  let audioSettings = $derived($musicStore.audioSettings);
  let appearance = $derived($musicStore.appearance);
  let accentColor = $derived(appearance.accentColor || "#06b6d4");

  let currentGains = $derived(audioSettings.eqGains || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  let activePreset = $derived(
    SOUNDIX_PRESETS.find(
      (preset) =>
        preset.gains.every((gain, index) => Math.abs(gain - (currentGains[index] ?? 0)) < 0.05) &&
        Math.abs(preset.sub - (audioSettings.eqSubBoost || 0)) < 0.05 &&
        Math.abs(preset.bass - (audioSettings.eqBassBoost || 0)) < 0.05 &&
        Math.abs(preset.highpass - (audioSettings.eqHighpass || 0)) < 1 &&
        Math.abs(preset.lowpass - (audioSettings.eqLowpass || 0)) < 1
    )?.name || "Personalizado"
  );
  let showPresetsPanel = $state(false);

  let subBoost = $state(0);
  let bassBoost = $state(0);
  let highpass = $state(0);
  let lowpass = $state(0);

  $effect(() => {
    const s = audioSettings.eqSubBoost || 0;
    const b = audioSettings.eqBassBoost || 0;
    const h = audioSettings.eqHighpass || 0;
    const l = audioSettings.eqLowpass || 0;
    if (subBoost !== s) subBoost = s;
    if (bassBoost !== b) bassBoost = b;
    if (highpass !== h) highpass = h;
    if (lowpass !== l) lowpass = l;
  });

  let targetLufs = $state(-14);
  let truePeak = $state(-1.5);
  let lra = $state(11);
  let normalizeMode = $state<"ebur128" | "dynaudnorm">("ebur128");

  let vinylSim = $state(false);

  let bands = $derived<EqBand[]>(
    DEFAULT_BANDS.map((b, idx) => ({
      ...b,
      gain: currentGains[idx] ?? 0,
    }))
  );

  function updateBandGain(index: number, gain: number) {
    const nextGains = [...currentGains];
    nextGains[index] = Math.round(gain * 10) / 10;
    musicStore.getState().setAudioSettings({ eqGains: nextGains });
  }

  function applyPreset(p: Preset) {
    const store = musicStore.getState();
    store.setAudioSettings({
      eqGains: [...p.gains],
      eqSubBoost: p.sub,
      eqBassBoost: p.bass,
      eqHighpass: p.highpass,
      eqLowpass: p.lowpass,
      isEqEnabled: true,
    });
    subBoost = p.sub;
    bassBoost = p.bass;
    highpass = p.highpass;
    lowpass = p.lowpass;
  }

  function resetEq() {
    subBoost = 0;
    bassBoost = 0;
    highpass = 0;
    lowpass = 0;
    musicStore.getState().setAudioSettings({
      eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      eqSubBoost: 0,
      eqBassBoost: 0,
      eqHighpass: 0,
      eqLowpass: 0,
    });
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in select-none"
    onclick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
  >
    <div
      class="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-700/80 bg-slate-900/95 shadow-2xl p-5 flex flex-col gap-4 text-slate-100"
      style:box-shadow={appearance.neonGlow ? `0 0 35px ${accentColor}30` : undefined}
    >
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <div class="flex items-center gap-3">
          <div
            class="p-2 rounded-xl flex items-center justify-center"
            style:background-color="{accentColor}20"
            style:color={accentColor}
          >
            <SlidersHorizontal size={20} />
          </div>
          <div>
            <h2 class="text-base font-bold tracking-wide">
              Audio EQ PRO
            </h2>
            <p class="text-xs text-slate-400">
              Curva paramétrica biquad en tiempo real, normalizador EBU R128 y filtros DSP
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      <div class="flex items-center justify-between flex-wrap gap-2">
        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={() => musicStore.getState().setAudioSettings({ isEqEnabled: !audioSettings.isEqEnabled })}
            class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer"
            style={audioSettings.isEqEnabled
              ? `background-color: ${accentColor}25; border-color: ${accentColor}80; color: ${accentColor}; box-shadow: 0 0 12px ${accentColor}40`
              : "background-color: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: rgba(255,255,255,0.4)"}
          >
            <Zap size={13} />
            {audioSettings.isEqEnabled ? "ECUALIZADOR ON" : "ECUALIZADOR OFF"}
          </button>

          <button
            type="button"
            onclick={() => musicStore.getState().setAudioSettings({ isXdssEnabled: !audioSettings.isXdssEnabled })}
            class="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer"
            style={audioSettings.isXdssEnabled
              ? `background-color: ${accentColor}20; border-color: ${accentColor}70; color: ${accentColor}`
              : "background-color: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.1); color: rgba(255,255,255,0.4)"}
            title="XDSS Plus: Extreme Dynamic Sound System"
          >
            <Flame size={12} />
            XDSS Plus
          </button>

          <button
            type="button"
            onclick={() => musicStore.getState().setAudioSettings({ isXtsProEnabled: !audioSettings.isXtsProEnabled })}
            class="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer"
            style={audioSettings.isXtsProEnabled
              ? `background-color: ${accentColor}20; border-color: ${accentColor}70; color: ${accentColor}`
              : "background-color: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.1); color: rgba(255,255,255,0.4)"}
            title="XTS Pro: Excelente resolución de agudos"
          >
            <Layers size={12} />
            XTS Pro
          </button>
        </div>

        <div class="flex items-center gap-2">
          <div class="relative">
            <button
              type="button"
              onclick={() => (showPresetsPanel = !showPresetsPanel)}
              class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 border border-slate-700 text-slate-200 hover:border-slate-500 transition cursor-pointer"
            >
              <Music size={12} style="color: {accentColor}" />
              <span>{activePreset}</span>
              <ChevronDown size={12} />
            </button>
            {#if showPresetsPanel}
              <div class="absolute right-0 top-full mt-1 z-[110] bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-2 w-48 max-h-60 overflow-y-auto">
                {#each SOUNDIX_PRESETS as p (p.name)}
                  <button
                    type="button"
                    onclick={() => {
                      applyPreset(p);
                      showPresetsPanel = false;
                    }}
                    class="w-full text-left px-3 py-1.5 rounded-lg text-xs transition cursor-pointer {activePreset === p.name ? 'font-bold' : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'}"
                    style={activePreset === p.name ? `background-color: ${accentColor}25; color: ${accentColor}` : undefined}
                  >
                    {p.name}
                  </button>
                {/each}
              </div>
            {/if}
          </div>

          <button
            type="button"
            onclick={resetEq}
            class="p-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-400 hover:text-white hover:border-slate-500 transition cursor-pointer"
            title="Restablecer EQ a 0 dB"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      <div class="w-full h-32 rounded-xl bg-slate-950/80 border border-slate-800 overflow-hidden shadow-inner relative">
        <FreqResponseCanvas
          bands={audioSettings.isEqEnabled ? bands : DEFAULT_BANDS.map((b) => ({ ...b, gain: 0 }))}
          highpass={highpass > 0 ? highpass : undefined}
          lowpass={lowpass > 0 ? lowpass : undefined}
          {accentColor}
        />
        <div class="absolute bottom-1 right-2 text-[9px] font-mono text-slate-500 pointer-events-none">
          20 Hz - 20 kHz &bull; Bi-Quad IIR Filters
        </div>
      </div>

      <div
        class="flex gap-1.5 justify-between bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 shadow-inner transition-opacity {!audioSettings.isEqEnabled ? 'opacity-35 pointer-events-none' : ''}"
      >
        {#each bands as band, i (i)}
          <div class="flex flex-col items-center gap-1.5 flex-1 group">
            <span
              class="text-[10px] font-mono leading-none tracking-tight font-bold {band.gain > 0 ? '' : band.gain < 0 ? 'text-rose-400' : 'text-slate-400'}"
              style:color={band.gain > 0 ? accentColor : undefined}
            >
              {band.gain > 0 ? `+${band.gain.toFixed(1)}` : band.gain.toFixed(1)}
            </span>

            <div class="relative flex flex-col items-center justify-center py-1" style="height: 130px">
              {#each [-12, -6, 0, 6, 12] as db}
                <div
                  class="absolute pointer-events-none {db === 0 ? 'w-5 h-[1.5px] bg-slate-500/60' : 'w-3 h-px bg-slate-700/40'}"
                  style:top="{((12 - db) / 24) * 120 + 5}px"
                ></div>
              {/each}

              <VerticalEqSlider
                value={band.gain}
                min={-12}
                max={12}
                step={0.5}
                height={130}
                {accentColor}
                title={`${BAND_NAMES[i]}: ${band.gain > 0 ? '+' : ''}${band.gain.toFixed(1)} dB`}
                ariaLabel={BAND_NAMES[i]}
                onchange={(val) => updateBandGain(i, val)}
              />
            </div>

            <span
              class="text-[10px] font-mono font-bold transition-colors"
              style:color={band.gain > 0 ? accentColor : "#cbd5e1"}
              style:opacity={band.gain > 0 ? 1 : 0.8}
            >
              {BAND_LABELS[i]}
            </span>
            <span class="text-[9px] text-slate-500 text-center leading-tight truncate w-full">
              {BAND_NAMES[i]}
            </span>
          </div>
        {/each}
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 shadow-inner">
        {#each [
          {
            label: "Sub Boost",
            val: subBoost,
            min: -6,
            max: 12,
            step: 0.5,
            unit: "dB",
            onChange: (v: number) => {
              subBoost = v;
              musicStore.getState().setAudioSettings({ eqSubBoost: v });
            },
          },
          {
            label: "Bass Boost",
            val: bassBoost,
            min: -6,
            max: 12,
            step: 0.5,
            unit: "dB",
            onChange: (v: number) => {
              bassBoost = v;
              musicStore.getState().setAudioSettings({ eqBassBoost: v });
            },
          },
          {
            label: "Highpass",
            val: highpass,
            min: 0,
            max: 400,
            step: 5,
            unit: "Hz",
            onChange: (v: number) => {
              highpass = v;
              musicStore.getState().setAudioSettings({ eqHighpass: v });
            },
          },
          {
            label: "Lowpass",
            val: lowpass,
            min: 0,
            max: 22000,
            step: 500,
            unit: "Hz",
            onChange: (v: number) => {
              lowpass = v;
              musicStore.getState().setAudioSettings({ eqLowpass: v });
            },
          },
        ] as const as item}
          {@const pct = Math.max(0, Math.min(100, ((item.val - item.min) / (item.max - item.min)) * 100))}
          {@const isActive = item.val !== 0 && !(item.label === "Lowpass" && item.val === 22000)}
          {@const displayVal =
            item.label === "Lowpass"
              ? item.val > 0 && item.val < 22000
                ? `${(item.val / 1000).toFixed(1)}k Hz`
                : "Off"
              : item.label === "Highpass"
                ? item.val > 0
                  ? `${item.val} Hz`
                  : "Off"
                : `${item.val > 0 ? `+${item.val}` : item.val} dB`}

          <div
            class="flex flex-col justify-between gap-1.5 p-2 rounded-lg border border-slate-800/80 bg-slate-900/60 shadow-sm transition hover:border-slate-700"
          >
            <div class="flex items-center justify-between text-[10px]">
              <span class="font-semibold uppercase tracking-wider text-slate-400">
                {item.label}
              </span>
              <span
                class="font-mono font-bold px-1.5 py-0.5 rounded text-[10px] transition-all"
                style:color={isActive ? accentColor : "#94a3b8"}
                style:background-color={isActive ? `${accentColor}18` : "rgba(15,23,42,0.6)"}
                style:border="1px solid {isActive ? `${accentColor}45` : 'rgba(51,65,85,0.4)'}"
                style:box-shadow={isActive ? `0 0 8px ${accentColor}25` : undefined}
              >
                {displayVal}
              </span>
            </div>
            <div class="relative flex items-center mt-1">
              <input
                type="range"
                min={item.min}
                max={item.max}
                step={item.step}
                value={item.val}
                oninput={(e) => item.onChange(parseFloat(e.currentTarget.value))}
                class="eq-pocket-horizontal w-full cursor-pointer z-10"
                style:background="linear-gradient(to right, {accentColor}85 0%, {accentColor} {pct}%, rgba(15, 23, 42, 0.95) {pct}%, rgba(15, 23, 42, 0.95) 100%)"
                style:box-shadow={isActive ? `inset 0 1px 3px rgba(0,0,0,0.85), 0 0 8px ${accentColor}25` : undefined}
                title="{item.label}: {displayVal}"
              />
            </div>
          </div>
        {/each}
      </div>

      <div class="rounded-xl bg-slate-950/60 border border-slate-800 p-4 flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Radio size={16} style="color: {accentColor}" />
            <div>
              <span class="text-xs font-bold text-slate-200">
                Normalizador de Loudness Integrado
              </span>
              <span class="ml-2 text-[10px] text-slate-400">
                EBU R128 &bull; Dynaudnorm &bull; True Peak
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Activar o desactivar normalizador"
            onclick={() =>
              musicStore.getState().setAudioSettings({ isNormalizerEnabled: !audioSettings.isNormalizerEnabled })
            }
            class="relative w-11 h-6 rounded-full transition-colors cursor-pointer"
            style:background-color={audioSettings.isNormalizerEnabled ? accentColor : "rgba(255,255,255,0.15)"}
          >
            <span
              class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all {audioSettings.isNormalizerEnabled ? 'left-5' : 'left-0.5'}"
            ></span>
          </button>
        </div>

        <div
          class="flex flex-col gap-3 transition-opacity {!audioSettings.isNormalizerEnabled ? 'opacity-35 pointer-events-none' : ''}"
        >
          <div class="grid grid-cols-2 gap-2">
            {#each [
              { id: "ebur128", label: "EBU R128", desc: "Estándar broadcast / streaming internacional" },
              { id: "dynaudnorm", label: "Dinámico (Dynaudnorm)", desc: "Compresión dinámica continua multibanda" },
            ] as m (m.id)}
              <button
                type="button"
                onclick={() => (normalizeMode = m.id as "ebur128" | "dynaudnorm")}
                class="flex flex-col items-start px-3 py-2 rounded-xl border transition cursor-pointer text-left"
                style={normalizeMode === m.id
                  ? `background-color: ${accentColor}18; border-color: ${accentColor}70`
                  : "background-color: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.08)"}
              >
                <span
                  class="text-xs font-bold"
                  style:color={normalizeMode === m.id ? accentColor : "rgba(255,255,255,0.8)"}
                >
                  {m.label}
                </span>
                <span class="text-[10px] text-slate-400">{m.desc}</span>
              </button>
            {/each}
          </div>

          {#if normalizeMode === "ebur128"}
            {@const lufsPct = Math.max(0, Math.min(100, ((targetLufs - -23) / (-9 - -23)) * 100))}
            {@const peakPct = Math.max(0, Math.min(100, ((truePeak - -9) / (0 - -9)) * 100))}
            {@const lraPct = Math.max(0, Math.min(100, ((lra - 1) / (50 - 1)) * 100))}
            <div class="grid grid-cols-3 gap-3">
              <div class="flex flex-col gap-1">
                <div class="flex items-center justify-between text-[11px]">
                  <span class="text-slate-400">Target LUFS</span>
                  <span class="font-mono font-bold" style:color={accentColor}>
                    {targetLufs} LUFS
                  </span>
                </div>
                <input
                  type="range"
                  min={-23}
                  max={-9}
                  step={0.5}
                  value={targetLufs}
                  oninput={(e) => (targetLufs = parseFloat(e.currentTarget.value))}
                  class="eq-pocket-horizontal w-full cursor-pointer z-10"
                  style:background="linear-gradient(to right, {accentColor}25 0%, {accentColor}85 {lufsPct * 0.7}%, {accentColor} {lufsPct}%, rgba(15, 23, 42, 0.95) {lufsPct}%, rgba(15, 23, 42, 0.95) 100%)"
                />
              </div>

              <div class="flex flex-col gap-1">
                <div class="flex items-center justify-between text-[11px]">
                  <span class="text-slate-400">True Peak</span>
                  <span class="font-mono text-slate-300">{truePeak} dBTP</span>
                </div>
                <input
                  type="range"
                  min={-9}
                  max={0}
                  step={0.5}
                  value={truePeak}
                  oninput={(e) => (truePeak = parseFloat(e.currentTarget.value))}
                  class="eq-pocket-horizontal w-full cursor-pointer z-10"
                  style:background="linear-gradient(to right, {accentColor}25 0%, {accentColor}85 {peakPct * 0.7}%, {accentColor} {peakPct}%, rgba(15, 23, 42, 0.95) {peakPct}%, rgba(15, 23, 42, 0.95) 100%)"
                />
              </div>

              <div class="flex flex-col gap-1">
                <div class="flex items-center justify-between text-[11px]">
                  <span class="text-slate-400">Rango LRA</span>
                  <span class="font-mono text-slate-300">{lra} LU</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={50}
                  step={1}
                  value={lra}
                  oninput={(e) => (lra = parseInt(e.currentTarget.value))}
                  class="eq-pocket-horizontal w-full cursor-pointer z-10"
                  style:background="linear-gradient(to right, {accentColor}25 0%, {accentColor}85 {lraPct * 0.7}%, {accentColor} {lraPct}%, rgba(15, 23, 42, 0.95) {lraPct}%, rgba(15, 23, 42, 0.95) 100%)"
                />
              </div>
            </div>
          {/if}
        </div>
      </div>

      <div class="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-slate-800">
        <div class="flex items-center gap-2">
          <Disc3
            size={16}
            class={vinylSim ? "animate-spin" : ""}
            style="color: {vinylSim ? accentColor : 'rgba(255,255,255,0.4)'}; animation-duration: 3s"
          />
          <div>
            <span class="text-xs font-semibold text-slate-200">
              Simulación de Vinilo Analógico 33.3 RPM
            </span>
            <p class="text-[10px] text-slate-400">
              Añade micro-calidez armónica par y saturación de aguja magnética
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={() => (vinylSim = !vinylSim)}
          class="px-3 py-1 rounded-lg text-xs font-mono font-semibold border transition cursor-pointer"
          style={vinylSim
            ? `background-color: ${accentColor}25; border-color: ${accentColor}80; color: ${accentColor}`
            : "background-color: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: rgba(255,255,255,0.4)"}
        >
          {vinylSim ? "33.3 RPM ACTIVO" : "INACTIVO"}
        </button>
      </div>
    </div>
  </div>
{/if}
