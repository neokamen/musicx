<script lang="ts">
  import { AudioLines } from "@lucide/svelte";
  import FreqResponseCanvas from "../audio/FreqResponseCanvas.svelte";
  import type { EqBand } from "../../types/eq.ts";
  import { useMusicStore } from "../../store/index.ts";

  const FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  const musicStore = useMusicStore;
  let audioSettings = $derived($musicStore.audioSettings);
  let appearance = $derived($musicStore.appearance);

  let gains = $derived(audioSettings.eqGains || Array(10).fill(0));
  let bands = $derived<EqBand[]>(
    FREQUENCIES.map((freq, index) => ({
      freq,
      gain: audioSettings.isEqEnabled ? gains[index] || 0 : 0,
      q: 1.4,
    }))
  );
</script>

<div class="flex h-full min-h-[120px] min-w-0 flex-col overflow-hidden bg-audiophile-surface font-mono">
  <header class="flex shrink-0 items-center justify-between border-b border-audiophile-border px-2.5 py-1.5">
    <span class="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-audiophile-muted">
      <AudioLines size={12} style="color: {appearance.accentColor}" /> EQ Spectrum
    </span>
    <span class="text-[8px] uppercase {audioSettings.isEqEnabled ? 'text-emerald-400' : 'text-slate-500'}">
      {audioSettings.isEqEnabled ? "EQ activo" : "Bypass"}
    </span>
  </header>
  <div class="min-h-0 flex-1 bg-[#090b0e] px-2 py-1">
    <FreqResponseCanvas
      {bands}
      highpass={audioSettings.eqHighpass > 0 ? audioSettings.eqHighpass : undefined}
      lowpass={audioSettings.eqLowpass > 0 ? audioSettings.eqLowpass : undefined}
      accentColor={appearance.accentColor}
    />
  </div>
  <footer class="flex shrink-0 justify-between px-2.5 pb-1.5 text-[8px] text-slate-500">
    <span>20 Hz</span><span>0 dB</span><span>20 kHz</span>
  </footer>
</div>
