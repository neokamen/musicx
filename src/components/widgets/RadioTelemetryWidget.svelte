<script lang="ts">
  import { onMount } from "svelte";
  import { Activity, Radio, Signal, Wifi } from "@lucide/svelte";
  import { useMusicStore } from "../../store/index.ts";
  import { radioAudioService } from "../../services/radioAudioService.ts";
  import { formatDataSize } from "../../lib/formatBytes.ts";
  import type { RadioPlaybackState } from "../../types/radio.ts";

  const musicStore = useMusicStore;
  let activeRadioStation = $derived($musicStore.activeRadioStation);
  let isRadioPlaying = $derived($musicStore.isRadioPlaying);
  let appearance = $derived($musicStore.appearance);

  let stream = $state<RadioPlaybackState>({ status: "stopped", elapsedSeconds: 0 });

  onMount(() => {
    const unsubscribe = radioAudioService.subscribe((s) => {
      stream = s;
    });
    return unsubscribe;
  });

  let isLive = $derived(isRadioPlaying && stream.status === "playing");
  let kbps = $derived(stream.bitrateKbps || activeRadioStation?.bitrate || 0);
  let throughput = $derived((stream.bytesPerSecond || 0) / 1024);
  let throughputPercent = $derived(kbps > 0 ? Math.min(100, ((throughput * 8) / kbps) * 100) : 0);
  let stationName = $derived(activeRadioStation?.name || "Sin emisora");
  let location = $derived(
    [activeRadioStation?.country, activeRadioStation?.language].filter(Boolean).join(" · ") || "Origen no indicado"
  );
</script>

<div class="flex h-full min-h-0 flex-col overflow-hidden bg-[#101719] font-mono text-xs text-slate-100">
  <header class="flex shrink-0 items-center justify-between border-b border-emerald-950/80 px-3 py-2">
    <span class="flex items-center gap-2 text-[10px] uppercase tracking-widest text-emerald-200/70">
      <Radio size={14} style="color: {appearance.accentColor}" />Radio telemetry
    </span>
    <span class="flex items-center gap-1.5 text-[9px] uppercase {isLive ? 'text-emerald-300' : 'text-slate-500'}">
      <span class="size-1.5 rounded-full {isLive ? 'animate-pulse bg-emerald-400' : 'bg-slate-600'}"></span>
      {stream.status}
    </span>
  </header>
  <div class="min-h-0 flex-1 overflow-auto p-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="truncate text-base font-bold" title={stationName}>{stationName}</div>
        <div class="truncate text-[10px] text-slate-400">{location}</div>
      </div>
      <div class="shrink-0 text-right">
        <div class="text-lg font-bold" style:color={appearance.accentColor}>
          {throughput.toFixed(1)}<span class="ml-1 text-[9px] text-slate-400">KB/s</span>
        </div>
        <div class="text-[9px] text-slate-500">{stream.isRealDataUsage ? "medido" : "estimado"}</div>
      </div>
    </div>
    <div class="mt-3 h-2 overflow-hidden border border-emerald-950 bg-black/60 p-px">
      <div
        class="h-full transition-[width] duration-300"
        style:width="{throughputPercent}%"
        style:background-color={appearance.accentColor}
        style:box-shadow="0 0 12px {appearance.accentColor}"
      ></div>
    </div>
    <div class="mt-3 grid grid-cols-2 gap-2">
      <div class="border border-white/10 bg-white/[0.03] p-2">
        <div class="flex items-center gap-1 text-[9px] uppercase text-slate-500"><Signal size={10} />Stream</div>
        <div class="mt-1 truncate text-sm font-bold">{activeRadioStation?.codec?.toUpperCase() || "Audio"} · {kbps || "?"} kb/s</div>
      </div>
      <div class="border border-white/10 bg-white/[0.03] p-2">
        <div class="flex items-center gap-1 text-[9px] uppercase text-slate-500"><Wifi size={10} />Sesión</div>
        <div class="mt-1 text-sm font-bold">{formatDataSize(stream.sessionBytesTotal || 0)}</div>
      </div>
    </div>
    <div class="mt-3 flex min-w-0 items-center gap-2 border-t border-white/10 pt-2 text-[10px] text-slate-400">
      <Activity size={12} class="shrink-0 text-emerald-300" />
      <span class="truncate" title={stream.streamTitle || activeRadioStation?.description || "Esperando metadatos"}>
        {stream.streamTitle || activeRadioStation?.description || "Esperando metadatos de pista"}
      </span>
    </div>
  </div>
</div>
