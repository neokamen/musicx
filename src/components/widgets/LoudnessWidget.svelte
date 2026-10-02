<script lang="ts">
  import { AudioLines, Power, ShieldCheck } from "@lucide/svelte";
  import { useMusicStore } from "../../store/index.ts";

  const musicStore = useMusicStore;
  let audioSettings = $derived($musicStore.audioSettings);
  let telemetry = $derived($musicStore.telemetry);
  let appearance = $derived($musicStore.appearance);
  let enabled = $derived(audioSettings.isNormalizerEnabled);
  let accentColor = $derived(appearance.accentColor || "#06b6d4");

  let targetLufs = $state(-14);
  let truePeak = $state(-1.5);
  let lra = $state(11);

  let parameters = $derived([
    { label: "Target LUFS", value: targetLufs, min: -23, max: -9, step: 0.5, unit: "LUFS", set: (v: number) => (targetLufs = v) },
    { label: "True Peak", value: truePeak, min: -9, max: 0, step: 0.5, unit: "dBTP", set: (v: number) => (truePeak = v) },
    { label: "Rango LRA", value: lra, min: 1, max: 20, step: 0.5, unit: "LU", set: (v: number) => (lra = v) },
  ]);
</script>

<div class="flex h-full min-h-[170px] min-w-0 flex-col overflow-hidden bg-audiophile-surface font-mono">
  <header class="flex shrink-0 items-center justify-between border-b border-audiophile-border px-2.5 py-1.5">
    <span class="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-audiophile-muted">
      <AudioLines size={12} style="color: {accentColor}" /> Loudness Normalizer
    </span>
    <button
      type="button"
      title={enabled ? "Desactivar normalizador" : "Activar normalizador"}
      aria-label={enabled ? "Desactivar normalizador" : "Activar normalizador"}
      aria-pressed={enabled}
      onclick={() => musicStore.getState().setAudioSettings({ isNormalizerEnabled: !enabled })}
      class="grid size-6 place-items-center border {enabled ? 'border-emerald-500/60 text-emerald-300' : 'border-slate-700 text-slate-500'}"
    >
      <Power size={12} />
    </button>
  </header>
  <div class="grid min-h-0 flex-1 grid-cols-3 gap-2 px-2.5 py-2 {enabled ? '' : 'pointer-events-none opacity-40'}">
    {#each parameters as parameter (parameter.label)}
      {@const pct = Math.max(0, Math.min(100, ((parameter.value - parameter.min) / (parameter.max - parameter.min)) * 100))}
      <label class="flex min-w-0 flex-col justify-center gap-1">
        <span class="truncate text-[8px] uppercase text-audiophile-muted">{parameter.label}</span>
        <span class="truncate text-[11px] font-bold" style:color={accentColor}>
          {parameter.value > 0 ? "+" : ""}{parameter.value} {parameter.unit}
        </span>
        <input
          aria-label={parameter.label}
          type="range"
          min={parameter.min}
          max={parameter.max}
          step={parameter.step}
          value={parameter.value}
          oninput={(event) => parameter.set(Number(event.currentTarget.value))}
          class="eq-pocket-horizontal w-full cursor-pointer z-10"
          style:background="linear-gradient(to right, {accentColor}25 0%, {accentColor}85 {pct * 0.7}%, {accentColor} {pct}%, rgba(15, 23, 42, 0.95) {pct}%, rgba(15, 23, 42, 0.95) 100%)"
        />
      </label>
    {/each}
  </div>
  <footer class="flex shrink-0 items-center justify-between gap-2 border-t border-audiophile-border px-2.5 py-1.5 text-[8px] text-slate-500">
    <span class="flex min-w-0 items-center gap-1 truncate"><ShieldCheck size={10} /> EBU R128 · control true-peak</span>
    <span class="shrink-0">{telemetry.state}</span>
  </footer>
</div>
