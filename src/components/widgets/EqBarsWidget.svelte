<script lang="ts">
  import { Sliders, RotateCcw } from "@lucide/svelte";
  import { useMusicStore } from "../../store/index.ts";
  import VerticalEqSlider from "../audio/VerticalEqSlider.svelte";

  const musicStore = useMusicStore;
  let audioSettings = $derived($musicStore.audioSettings);
  let appearance = $derived($musicStore.appearance);

  let isEqEnabled = $derived(audioSettings?.isEqEnabled ?? false);
  let isXdssEnabled = $derived(audioSettings?.isXdssEnabled ?? false);
  let gains = $derived(audioSettings?.eqGains || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  const freqs = ["31Hz", "62Hz", "125Hz", "250Hz", "500Hz", "1kHz", "2kHz", "4kHz", "8kHz", "16kHz"];

  function handleGainChange(index: number, val: number) {
    const nextGains = [...gains];
    nextGains[index] = val;
    musicStore.getState().setAudioSettings({ eqGains: nextGains, isEqEnabled: true });
  }

  function handleResetEq() {
    musicStore.getState().setAudioSettings({ eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
  }
</script>

<div class="flex flex-col h-full w-full bg-audiophile-surface select-none font-sans overflow-hidden text-xs">
  <div class="p-2 border-b border-audiophile-border bg-audiophile-surface2 flex items-center justify-between shrink-0">
    <div class="flex items-center gap-2">
      <Sliders size={12} style="color: {appearance.accentColor}" />
      <span class="font-mono text-[10px] uppercase tracking-wider text-audiophile-muted">
        Ecualizador Gráfico (10 Bandas)
      </span>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        onclick={() => musicStore.getState().setAudioSettings({ isXdssEnabled: !isXdssEnabled })}
        class="px-2 py-0.5 rounded font-mono text-[9px] font-bold border transition {isXdssEnabled
          ? 'bg-amber-950/60 border-amber-600 text-amber-300'
          : 'bg-slate-900 border-slate-700 text-slate-400'}"
      >
        ⚡ XDSS Dynamic
      </button>

      <button
        type="button"
        onclick={() => musicStore.getState().setAudioSettings({ isEqEnabled: !isEqEnabled })}
        class="px-2 py-0.5 rounded font-mono text-[9px] font-bold border transition {isEqEnabled
          ? 'border-cyan-500 bg-cyan-950/60 text-cyan-300'
          : 'border-slate-700 bg-slate-900 text-slate-400'}"
      >
        {isEqEnabled ? "EQ ON" : "EQ BYPASS"}
      </button>

      <button
        type="button"
        onclick={handleResetEq}
        class="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
        title="Restablecer a 0 dB"
      >
        <RotateCcw size={11} />
      </button>
    </div>
  </div>

  <div class="flex-1 p-3 flex items-center justify-between gap-1 overflow-x-auto custom-scrollbar bg-slate-950/30">
    {#each freqs as freq, idx (freq)}
      {@const gain = gains[idx] || 0}
      {@const isBoost = gain > 0}
      {@const isCut = gain < 0}
      {@const accent = appearance.accentColor}
      <div class="flex-1 min-w-[28px] flex flex-col items-center gap-1.5 h-full justify-center group">
        <span
          class="font-mono text-[9px] transition-colors leading-none {isBoost
            ? 'font-bold text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.7)]'
            : isCut
              ? 'text-rose-400 font-medium'
              : 'text-slate-500'}"
          style:color={isBoost ? accent : undefined}
          style:text-shadow={isBoost ? `0 0 6px ${accent}` : undefined}
        >
          {gain > 0 ? `+${gain.toFixed(0)}` : gain.toFixed(0)}
        </span>

        <div class="relative flex-1 flex items-center justify-center w-full py-1">
          <VerticalEqSlider
            value={gain}
            min={-12}
            max={12}
            step={0.5}
            height="100%"
            accentColor={accent}
            title={`${freq}: ${gain > 0 ? '+' : ''}${gain} dB`}
            ariaLabel={freq}
            onchange={(val) => handleGainChange(idx, val)}
          />
        </div>

        <span
          class="font-mono text-[9px] font-bold truncate transition-colors"
          style:color={isBoost ? accent : "#94a3b8"}
        >
          {freq}
        </span>
      </div>
    {/each}
  </div>
</div>
