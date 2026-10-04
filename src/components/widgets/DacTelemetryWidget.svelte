<script lang="ts">
  import { ShieldCheck, Cpu, Volume2 } from "@lucide/svelte";
  import {
    useMusicStore,
    audioFormatStore,
    selectedDeviceStore,
    appearanceStore,
    isPlayingStore,
    AUDIO_ENGINES,
  } from "../../store/index.ts";

  const musicStore = useMusicStore;
  let audioFormat = $derived($audioFormatStore);
  let selectedDevice = $derived($selectedDeviceStore);
  let appearance = $derived($appearanceStore);
  let isPlaying = $derived($isPlayingStore);
  let audioSettings = $derived($musicStore.audioSettings);
  let bitPerfectMode = $derived($musicStore.bitPerfectMode);

  let currentAudioEngine = $derived(
    AUDIO_ENGINES.find((e) => e.id === audioSettings?.resamplingQuality) ||
    (bitPerfectMode ? AUDIO_ENGINES[0] : AUDIO_ENGINES[AUDIO_ENGINES.length - 1])
  );

  function handleCycleEngine() {
    const currentId = audioSettings?.resamplingQuality || (bitPerfectMode ? "bit_perfect" : "float32");
    const currentIndex = AUDIO_ENGINES.findIndex((e) => e.id === currentId);
    const nextIndex = (currentIndex + 1) % AUDIO_ENGINES.length;
    const nextEngine = AUDIO_ENGINES[nextIndex];
    useMusicStore.getState().setAudioSettings({ resamplingQuality: nextEngine.id });
  }

  let sampleRateKhz = $derived(
    audioFormat.sample_rate > 0
      ? (audioFormat.sample_rate / 1000).toFixed(1)
      : "44.1"
  );
  let bitDepth = $derived(
    audioFormat.bits_per_sample > 0
      ? `${audioFormat.bits_per_sample}-bit`
      : "16-bit"
  );
  let bitrate = $derived(audioFormat.bitrate || 1411);
  let channels = $derived(
    audioFormat.channels === 1
      ? "1.0 Mono"
      : audioFormat.channels === 2
        ? "2.0 Stereo"
        : `${audioFormat.channels || 2} ch`
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
            class={isPlaying
              ? "text-emerald-400 font-bold"
              : "text-slate-500"}
          >
            {isPlaying ? "PLAYING" : "STOPPED"}
          </strong>
        </span>
      </div>
    </div>

    <button
      type="button"
      onclick={handleCycleEngine}
      class="w-full py-2 px-3 rounded-lg font-mono text-xs font-bold transition flex items-center justify-between gap-2 border cursor-pointer hover:brightness-110"
      style:border-color="{currentAudioEngine.color}80"
      style:background-color="{currentAudioEngine.color}18"
      style:box-shadow="0 0 14px {currentAudioEngine.color}35"
      style:color={currentAudioEngine.color}
      title={`Motor actual: ${currentAudioEngine.name} · ${currentAudioEngine.description} (clic para conmutar motor de audio)`}
    >
      <div class="flex items-center gap-2 min-w-0">
        <ShieldCheck
          size={14}
          style="color: {currentAudioEngine.color}"
        />
        <span class="truncate">{currentAudioEngine.name}</span>
      </div>
      <span
        class="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border"
        style:border-color="{currentAudioEngine.color}60"
        style:background-color="{currentAudioEngine.color}25"
      >
        {currentAudioEngine.badge}
      </span>
    </button>

    <div class="space-y-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[10px] text-slate-300">
      <div class="flex items-center justify-between">
        <span class="text-slate-400 flex items-center gap-1">
          <Cpu size={11} style="color: {appearance.accentColor}" />
          Dispositivo Hardware:
        </span>
        <span
          class="font-bold text-slate-200 truncate max-w-[150px]"
          title={selectedDevice}
        >
          {selectedDevice}
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
