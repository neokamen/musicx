<script lang="ts">
  import { useMusicStore } from "../../store/index.ts";

  const musicStore = useMusicStore;
  let currentTrack = $derived($musicStore.currentTrack);
  let telemetry = $derived($musicStore.telemetry);

  let format = $derived(
    currentTrack?.format ||
      (telemetry.filepath ? telemetry.filepath.split(".").pop()?.toUpperCase() : "PCM")
  );
  let sampleRate = $derived(telemetry.sample_rate || currentTrack?.sample_rate || 44100);
  let bitDepth = $derived(telemetry.bits_per_sample || currentTrack?.bit_depth || 16);
  let bitrate = $derived(telemetry.bitrate || currentTrack?.bitrate_kbps || 1411);
</script>

<div class="flex flex-col h-full w-full bg-audiophile-surface select-none font-sans overflow-hidden text-xs">
  <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-2 font-mono">
    <div class="grid grid-cols-2 gap-2">
      <div class="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center">
        <div>
          <div class="text-[9px] uppercase text-slate-400">Códec</div>
          <div class="text-xs font-bold text-white">{format}</div>
        </div>
      </div>

      <div class="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center">
        <div>
          <div class="text-[9px] uppercase text-slate-400">Sample Rate</div>
          <div class="text-xs font-bold text-white">{(sampleRate / 1000).toFixed(1)} kHz</div>
        </div>
      </div>

      <div class="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center">
        <div>
          <div class="text-[9px] uppercase text-slate-400">Profundidad</div>
          <div class="text-xs font-bold text-white">{bitDepth} bits</div>
        </div>
      </div>

      <div class="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center">
        <div>
          <div class="text-[9px] uppercase text-slate-400">Bitrate</div>
          <div class="text-xs font-bold text-white">{bitrate} kbps</div>
        </div>
      </div>
    </div>
  </div>
</div>
