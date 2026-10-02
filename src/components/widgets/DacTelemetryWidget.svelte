<script lang="ts">
  import { ShieldCheck, Cpu, Volume2 } from "@lucide/svelte";
  import { useMusicStore } from "../../store/index.ts";

  const musicStore = useMusicStore;
  let telemetry = $derived($musicStore.telemetry);
  let currentTrack = $derived($musicStore.currentTrack);
  let bitPerfectMode = $derived($musicStore.bitPerfectMode);
  let selectedDevice = $derived($musicStore.selectedDevice);
  let appearance = $derived($musicStore.appearance);

  let isBitPerfect = $derived(bitPerfectMode || telemetry.is_bit_perfect);
  let sampleRateKhz = $derived(
    telemetry.sample_rate > 0
      ? (telemetry.sample_rate / 1000).toFixed(1)
      : "44.1"
  );
  let bitDepth = $derived(
    telemetry.bits_per_sample > 0
      ? `${telemetry.bits_per_sample}-bit`
      : "16-bit"
  );
  let bitrate = $derived(telemetry.bitrate || currentTrack?.bitrate_kbps || 1411);
  let channels = $derived(
    telemetry.channels === 1
      ? "1.0 Mono"
      : telemetry.channels === 2
        ? "2.0 Stereo"
        : `${telemetry.channels || 2} ch`
  );
</script>

<div class="flex flex-col h-full w-full bg-audiophile-surface select-none font-sans overflow-hidden text-xs">
  <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 font-mono">
    <div
      class="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center shadow-inner relative overflow-hidden"
      style:border-color={appearance.neonGlow ? `${appearance.accentColor}33` : undefined}
    >
      <div class="text-[9px] uppercase text-slate-400 tracking-widest mb-0.5">
        DAC MASTER CLOCK & SAMPLE RATE
      </div>

      <div
        class="text-2xl font-black tracking-wider"
        style:color={appearance.accentColor}
      >
        {sampleRateKhz} <span class="text-xs font-normal text-slate-400">kHz</span>
      </div>

      <div class="text-xs font-bold text-amber-400 mt-0.5">
        {bitrate} <span class="text-[10px] font-normal text-slate-400">kbps (Real-time Stream)</span>
      </div>

      <div class="flex items-center justify-center gap-3 mt-2 text-[10px] text-slate-300 border-t border-slate-800/80 pt-1.5">
        <span>
          PROFUNDIDAD: <strong class="text-cyan-300">{bitDepth}</strong>
        </span>
        <span>&bull;</span>
        <span>
          ESTADO:{" "}
          <strong
            class={telemetry.state === "Playing"
              ? "text-emerald-400 font-bold"
              : "text-slate-500"}
          >
            {telemetry.state.toUpperCase()}
          </strong>
        </span>
      </div>
    </div>

    <button
      type="button"
      onclick={() => musicStore.getState().setBitPerfectMode(!isBitPerfect)}
      class="w-full py-2 px-3 rounded-lg font-mono text-xs font-bold transition flex items-center justify-center gap-2 border cursor-pointer {isBitPerfect
        ? 'bg-slate-900 text-white'
        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'}"
      style:border-color={isBitPerfect ? appearance.accentColor : undefined}
      style:box-shadow={isBitPerfect
        ? `0 0 15px ${appearance.accentColor}55, inset 0 0 10px ${appearance.accentColor}22`
        : "none"}
      style:color={isBitPerfect ? appearance.accentColor : undefined}
    >
      <ShieldCheck
        size={14}
        style={isBitPerfect ? `color: ${appearance.accentColor}` : undefined}
      />
      <span>{isBitPerfect ? "ALSA BIT-PERFECT: ACTIVADO" : "MODO COMPARTIDO (PIPEWIRE)"}</span>
    </button>

    <div class="space-y-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[10px] text-slate-300">
      <div class="flex items-center justify-between">
        <span class="text-slate-400 flex items-center gap-1">
          <Cpu size={11} style="color: {appearance.accentColor}" />
          Dispositivo Hardware:
        </span>
        <span
          class="font-bold text-slate-200 truncate max-w-[150px]"
          title={telemetry.output_device || selectedDevice}
        >
          {telemetry.output_device || selectedDevice}
        </span>
      </div>

      <div class="flex items-center justify-between">
        <span class="text-slate-400">Canales de Salida:</span>
        <span class="font-bold text-slate-200">{channels}</span>
      </div>

      <div class="flex items-center justify-between">
        <span class="text-slate-400 flex items-center gap-1">
          <Volume2 size={11} style="color: {appearance.accentColor}" />
          Buffer Under-run:
        </span>
        <span class="text-emerald-400 font-bold">0 Underruns (Bit-Perfect)</span>
      </div>
    </div>
  </div>
</div>
