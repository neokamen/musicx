<script lang="ts">
  import { useMusicStore } from "../../store/index.ts";

  const musicStore = useMusicStore;
  let telemetry = $derived($musicStore.telemetry);
  let currentTrack = $derived($musicStore.currentTrack);
  let bitPerfectMode = $derived($musicStore.bitPerfectMode);

  let sampleRate = $derived(telemetry.sample_rate || currentTrack?.sample_rate || 44100);
  let bitDepth = $derived(telemetry.bits_per_sample || currentTrack?.bit_depth || 16);
  let bitrate = $derived(telemetry.bitrate || currentTrack?.bitrate_kbps || 0);
  let channels = $derived(telemetry.channels || 2);
  let channelLabel = $derived(
    channels === 1
      ? "1.0 Mono"
      : channels === 2
        ? "2.0 Stereo"
        : `${channels}.0 ${channels > 2 ? "Surround" : "Canales"}`
  );
  let isBitPerfect = $derived(bitPerfectMode || telemetry.is_bit_perfect);
</script>

<div class="flex h-full min-h-[76px] min-w-0 flex-col justify-between overflow-hidden border border-[#323232] bg-[#0b0c0e] px-2.5 py-2 font-mono text-[10px] text-slate-100">
  <header class="flex items-center justify-between border-b border-[#303236] pb-1.5 text-[8px] uppercase tracking-[0.16em]">
    <span class="text-slate-400">Sample rate</span>
    <span class={isBitPerfect ? "text-emerald-400" : "text-slate-500"}>{isBitPerfect ? "Bit-perfect" : "Shared"}</span>
  </header>
  <div class="flex min-w-0 items-end justify-between gap-2 py-1">
    <div class="flex min-w-0 items-baseline gap-1">
      <span class="truncate text-[23px] font-bold leading-none tracking-normal text-[#e87532]">{(sampleRate / 1000).toFixed(1)}</span>
      <span class="text-[10px] text-slate-400">kHz</span>
    </div>
    <div class="flex shrink-0 items-baseline gap-1 text-amber-300">
      <span class="text-[14px] font-bold leading-none">{bitrate || "PCM"}</span>
      {#if bitrate > 0}
        <span class="text-[9px] text-slate-400">kb/s</span>
      {/if}
    </div>
  </div>
  <footer class="flex items-center justify-between border-t border-[#303236] pt-1.5 text-[9px]">
    <span class="truncate text-slate-300">{bitDepth}-bit <span class="px-1 text-slate-600">|</span> {channelLabel}</span>
    <span class={telemetry.state === "Playing" ? "shrink-0 text-emerald-400" : "shrink-0 text-emerald-500/80"}>{telemetry.state}</span>
  </footer>
</div>
