<script lang="ts">
  import { Layers, Power, RotateCcw, Zap } from "@lucide/svelte";
  import { SOUNDIX_PRESETS } from "../../types/eq.ts";
  import { useMusicStore } from "../../store/index.ts";
  import VerticalEqSlider from "../audio/VerticalEqSlider.svelte";

  const FREQUENCIES = ["32", "64", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];

  const musicStore = useMusicStore;
  let audioSettings = $derived($musicStore.audioSettings);
  let appearance = $derived($musicStore.appearance);
  let accent = $derived(appearance.accentColor || "#06b6d4");
  let gains = $derived(audioSettings.eqGains || Array(10).fill(0));
  let activePreset = $derived(
    SOUNDIX_PRESETS.find(
      (preset) =>
        preset.gains.every((gain, index) => Math.abs(gain - (gains[index] ?? 0)) < 0.05) &&
        Math.abs(preset.sub - (audioSettings.eqSubBoost || 0)) < 0.05 &&
        Math.abs(preset.bass - (audioSettings.eqBassBoost || 0)) < 0.05 &&
        Math.abs(preset.highpass - (audioSettings.eqHighpass || 0)) < 1 &&
        Math.abs(preset.lowpass - (audioSettings.eqLowpass || 0)) < 1
    )?.name || "Personalizado"
  );

  function updateGain(index: number, value: number) {
    const next = [...gains];
    next[index] = Math.round(value * 10) / 10;
    musicStore.getState().setAudioSettings({ eqGains: next, isEqEnabled: true });
  }

  function updateSetting(
    key: "eqSubBoost" | "eqBassBoost" | "eqHighpass" | "eqLowpass",
    value: number
  ) {
    musicStore.getState().setAudioSettings({ [key]: value });
  }

  function applyPreset(name: string) {
    const preset = SOUNDIX_PRESETS.find((item) => item.name === name);
    if (!preset) return;
    musicStore.getState().setAudioSettings({
      eqGains: [...preset.gains],
      eqSubBoost: preset.sub,
      eqBassBoost: preset.bass,
      eqHighpass: preset.highpass,
      eqLowpass: preset.lowpass,
      isEqEnabled: true,
    });
  }
  let subVal = $derived(audioSettings.eqSubBoost || 0);
  let subPct = $derived(Math.max(0, Math.min(100, ((subVal - (-6)) / (12 - (-6))) * 100)));
  let isSubActive = $derived(subVal !== 0);

  let hpVal = $derived(audioSettings.eqHighpass || 0);
  let hpPct = $derived(Math.max(0, Math.min(100, ((hpVal - 0) / (400 - 0)) * 100)));
  let isHpActive = $derived(hpVal > 0);

  let bassVal = $derived(audioSettings.eqBassBoost || 0);
  let bassPct = $derived(Math.max(0, Math.min(100, ((bassVal - (-6)) / (12 - (-6))) * 100)));
  let isBassActive = $derived(bassVal !== 0);

  let lpVal = $derived(audioSettings.eqLowpass ?? 0);
  let lpPct = $derived(Math.max(0, Math.min(100, ((lpVal - 0) / (22000 - 0)) * 100)));
  let isLpActive = $derived(lpVal !== 0 && lpVal !== 22000);
</script>

<div class="flex h-full min-h-0 w-full flex-col overflow-auto bg-audiophile-surface font-mono text-xs select-none">
  <!-- Header -->
  <header class="flex shrink-0 items-center justify-between gap-1.5 border-b border-audiophile-border px-2.5 py-1.5 bg-slate-950/40">
    <div class="flex items-center gap-2 min-w-0">
      <span
        class="truncate text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors {audioSettings.isEqEnabled ? 'text-white drop-shadow-sm' : 'text-slate-500 font-medium'}"
        style:color={audioSettings.isEqEnabled ? accent : undefined}
      >
        <span
          class="size-1.5 rounded-full transition-all {audioSettings.isEqEnabled ? '' : 'bg-slate-600 opacity-60'}"
          style:background-color={audioSettings.isEqEnabled ? accent : undefined}
          style:box-shadow={audioSettings.isEqEnabled ? `0 0 6px ${accent}` : undefined}
        ></span>
        EQ PRO
      </span>

      <select
        aria-label="Preset de ecualizador"
        value={activePreset}
        onchange={(e) => applyPreset(e.currentTarget.value)}
        class="min-w-0 bg-transparent border-0 text-[9px] font-mono text-slate-400 hover:text-slate-200 focus:text-slate-100 outline-none cursor-pointer p-0 truncate transition-colors"
        style="color-scheme: dark"
      >
        {#if activePreset === "Personalizado"}
          <option value="Personalizado" class="bg-slate-900 text-slate-200">Personalizado</option>
        {/if}
        {#each SOUNDIX_PRESETS as preset (preset.name)}
          <option value={preset.name} class="bg-slate-900 text-slate-200">
            {preset.name}
          </option>
        {/each}
      </select>
    </div>

    <div class="flex shrink-0 items-center gap-1">
      <button
        type="button"
        title={audioSettings.isEqEnabled ? "Desactivar EQ" : "Activar EQ"}
        aria-label={audioSettings.isEqEnabled ? "Desactivar EQ" : "Activar EQ"}
        onclick={() => musicStore.getState().setAudioSettings({ isEqEnabled: !audioSettings.isEqEnabled })}
        class="grid size-5 place-items-center rounded border transition cursor-pointer {audioSettings.isEqEnabled
          ? 'bg-emerald-950/60 border-emerald-500/80 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
          : 'border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-200'}"
      >
        <Power size={11} />
      </button>
      <button
        type="button"
        title={audioSettings.isXdssEnabled ? "Desactivar XDSS" : "Activar XDSS"}
        aria-label={audioSettings.isXdssEnabled ? "Desactivar XDSS" : "Activar XDSS"}
        onclick={() => musicStore.getState().setAudioSettings({ isXdssEnabled: !audioSettings.isXdssEnabled })}
        class="grid size-5 place-items-center rounded border transition cursor-pointer {audioSettings.isXdssEnabled
          ? 'border-amber-500/80 bg-amber-950/60 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
          : 'border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-200'}"
      >
        <Zap size={11} />
      </button>
      <button
        type="button"
        title={audioSettings.isXtsProEnabled ? "Desactivar XTS" : "Activar XTS"}
        aria-label={audioSettings.isXtsProEnabled ? "Desactivar XTS" : "Activar XTS"}
        onclick={() => musicStore.getState().setAudioSettings({ isXtsProEnabled: !audioSettings.isXtsProEnabled })}
        class="grid size-5 place-items-center rounded border transition cursor-pointer {audioSettings.isXtsProEnabled
          ? 'border-cyan-500/80 bg-cyan-950/60 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
          : 'border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-200'}"
      >
        <Layers size={11} />
      </button>
      <button
        type="button"
        title="Restablecer todas las bandas a 0 dB"
        aria-label="Restablecer todas las bandas"
        onclick={() => musicStore.getState().setAudioSettings({ eqGains: Array(10).fill(0) })}
        class="grid size-5 place-items-center rounded border border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-200 transition cursor-pointer"
      >
        <RotateCcw size={11} />
      </button>
    </div>
  </header>

  <!-- 10 Vertical Pro Faders -->
  <div class="grid shrink-0 grid-cols-10 gap-1 px-2 pt-1 pb-1.5 bg-gradient-to-b from-slate-950/30 to-transparent">
    {#each FREQUENCIES as frequency, index (frequency)}
      {@const gain = gains[index] || 0}
      {@const isBoost = gain > 0}
      {@const isCut = gain < 0}
      <div class="flex min-w-0 flex-col items-center justify-between gap-0.5 group">
        <span
          class="text-[8px] font-mono leading-none tracking-tighter transition-all {isBoost
            ? 'font-bold text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.6)]'
            : isCut
              ? 'text-rose-400/90 font-medium'
              : 'text-slate-500'}"
          style:color={isBoost ? accent : undefined}
          style:text-shadow={isBoost ? `0 0 6px ${accent}` : undefined}
        >
          {isBoost ? `+${gain.toFixed(1)}` : gain.toFixed(1)}
        </span>

        <div class="relative h-18 w-5 flex items-center justify-center py-0.5">
          <VerticalEqSlider
            value={gain}
            min={-12}
            max={12}
            step={0.5}
            height={64}
            accentColor={accent}
            title={`${frequency} Hz: ${gain > 0 ? '+' : ''}${gain} dB`}
            ariaLabel={`${frequency} Hz`}
            onchange={(val) => updateGain(index, val)}
          />
        </div>

        <span
          class="text-[8px] font-mono leading-none tracking-tight text-slate-400 group-hover:text-white transition-colors"
          style:color={isBoost ? accent : undefined}
          style:opacity={isBoost ? 0.95 : 0.65}
        >
          {frequency}
        </span>
      </div>
    {/each}
  </div>

  <!-- 2 Unified Boxes: [Sub Boost + Highpass] and [Bass Boost + Lowpass] -->
  <div class="grid shrink-0 grid-cols-2 gap-1.5 border-t border-slate-800/80 bg-slate-950/60 p-1.5">
    <!-- Box 1: Sub Boost & Highpass -->
    <div class="min-w-0 rounded-lg border border-slate-800/70 bg-slate-900/60 p-1.5 flex flex-col gap-1.5 shadow-sm transition hover:border-slate-700">
      <!-- Sub Boost Row -->
      <div>
        <div class="flex items-center justify-between text-[8.5px] leading-tight">
          <span class="truncate text-slate-400 uppercase tracking-wider font-semibold">Sub Boost</span>
          <span class="shrink-0 font-mono font-bold text-[8.5px]" style:color={isSubActive ? accent : "#94a3b8"}>
            {subVal > 0 ? `+${subVal.toFixed(1)}` : subVal.toFixed(1)} dB
          </span>
        </div>
        <div class="relative mt-0.5 flex items-center">
          <input
            aria-label="Sub Boost"
            type="range"
            min={-6}
            max={12}
            step={0.5}
            value={subVal}
            oninput={(e) => updateSetting("eqSubBoost", Number(e.currentTarget.value))}
            class="eq-pocket-horizontal w-full cursor-pointer z-10"
            style:background="linear-gradient(to right, {accent}80 0%, {accent} {subPct}%, rgba(15, 23, 42, 0.9) {subPct}%, rgba(15, 23, 42, 0.9) 100%)"
            style:box-shadow={isSubActive ? `inset 0 1px 3px rgba(0,0,0,0.8), 0 0 6px ${accent}25` : undefined}
          />
        </div>
      </div>

      <!-- Highpass Row -->
      <div>
        <div class="flex items-center justify-between text-[8.5px] leading-tight">
          <span class="truncate text-slate-400 uppercase tracking-wider font-semibold">Highpass</span>
          <span class="shrink-0 font-mono font-bold text-[8.5px]" style:color={isHpActive ? accent : "#94a3b8"}>
            {hpVal === 0 ? "Off" : `${hpVal} Hz`}
          </span>
        </div>
        <div class="relative mt-0.5 flex items-center">
          <input
            aria-label="Highpass"
            type="range"
            min={0}
            max={400}
            step={5}
            value={hpVal}
            oninput={(e) => updateSetting("eqHighpass", Number(e.currentTarget.value))}
            class="eq-pocket-horizontal w-full cursor-pointer z-10"
            style:background="linear-gradient(to right, {accent}80 0%, {accent} {hpPct}%, rgba(15, 23, 42, 0.9) {hpPct}%, rgba(15, 23, 42, 0.9) 100%)"
            style:box-shadow={isHpActive ? `inset 0 1px 3px rgba(0,0,0,0.8), 0 0 6px ${accent}25` : undefined}
          />
        </div>
      </div>
    </div>

    <!-- Box 2: Bass Boost & Lowpass -->
    <div class="min-w-0 rounded-lg border border-slate-800/70 bg-slate-900/60 p-1.5 flex flex-col gap-1.5 shadow-sm transition hover:border-slate-700">
      <!-- Bass Boost Row -->
      <div>
        <div class="flex items-center justify-between text-[8.5px] leading-tight">
          <span class="truncate text-slate-400 uppercase tracking-wider font-semibold">Bass Boost</span>
          <span class="shrink-0 font-mono font-bold text-[8.5px]" style:color={isBassActive ? accent : "#94a3b8"}>
            {bassVal > 0 ? `+${bassVal.toFixed(1)}` : bassVal.toFixed(1)} dB
          </span>
        </div>
        <div class="relative mt-0.5 flex items-center">
          <input
            aria-label="Bass Boost"
            type="range"
            min={-6}
            max={12}
            step={0.5}
            value={bassVal}
            oninput={(e) => updateSetting("eqBassBoost", Number(e.currentTarget.value))}
            class="eq-pocket-horizontal w-full cursor-pointer z-10"
            style:background="linear-gradient(to right, {accent}80 0%, {accent} {bassPct}%, rgba(15, 23, 42, 0.9) {bassPct}%, rgba(15, 23, 42, 0.9) 100%)"
            style:box-shadow={isBassActive ? `inset 0 1px 3px rgba(0,0,0,0.8), 0 0 6px ${accent}25` : undefined}
          />
        </div>
      </div>

      <!-- Lowpass Row -->
      <div>
        <div class="flex items-center justify-between text-[8.5px] leading-tight">
          <span class="truncate text-slate-400 uppercase tracking-wider font-semibold">Lowpass</span>
          <span class="shrink-0 font-mono font-bold text-[8.5px]" style:color={isLpActive ? accent : "#94a3b8"}>
            {lpVal === 22000 || lpVal === 0 ? "Off" : lpVal >= 1000 ? `${(lpVal / 1000).toFixed(1)}k Hz` : `${lpVal} Hz`}
          </span>
        </div>
        <div class="relative mt-0.5 flex items-center">
          <input
            aria-label="Lowpass"
            type="range"
            min={0}
            max={22000}
            step={500}
            value={lpVal}
            oninput={(e) => updateSetting("eqLowpass", Number(e.currentTarget.value))}
            class="eq-pocket-horizontal w-full cursor-pointer z-10"
            style:background="linear-gradient(to right, {accent}80 0%, {accent} {lpPct}%, rgba(15, 23, 42, 0.9) {lpPct}%, rgba(15, 23, 42, 0.9) 100%)"
            style:box-shadow={isLpActive ? `inset 0 1px 3px rgba(0,0,0,0.8), 0 0 6px ${accent}25` : undefined}
          />
        </div>
      </div>
    </div>
  </div>
</div>
