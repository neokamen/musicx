<script lang="ts">
  import { Activity, Music2 } from "@lucide/svelte";
  import { useMusicStore } from "../../store/index.ts";

  const musicStore = useMusicStore;
  let telemetry = $derived($musicStore.telemetry);
  let isPlaying = $derived($musicStore.isPlaying);
  let appearance = $derived($musicStore.appearance);

  let manualBpm = $state<number | null>(null);
  let tapTimes: number[] = [];

  let detectedBpm = $derived(
    telemetry.tempo_bpm && telemetry.tempo_confidence >= 0.12
      ? Math.round(telemetry.tempo_bpm)
      : null
  );
  let bpm = $derived(manualBpm ?? detectedBpm);

  let lastTrackFilepath = "";
  $effect(() => {
    // Reset only when track actually changes
    const current = telemetry.filepath || "";
    if (current && current !== lastTrackFilepath) {
      lastTrackFilepath = current;
      tapTimes = [];
      manualBpm = null;
    }
  });

  function handleTapTempo() {
    const now = performance.now();
    const previousTap = tapTimes[tapTimes.length - 1];
    tapTimes = !previousTap || now - previousTap > 2200
      ? [now]
      : [...tapTimes.slice(-5), now];
    if (tapTimes.length < 3) return;
    const intervals = tapTimes.slice(1)
      .map((tap, index) => tap - tapTimes[index])
      .sort((left, right) => left - right);
    const medianInterval = intervals[Math.floor(intervals.length / 2)];
    manualBpm = Math.round(Math.max(40, Math.min(240, 60000 / medianInterval)));
  }
</script>

<button
  type="button"
  onclick={handleTapTempo}
  title="Toca al ritmo para ajustar el BPM manualmente"
  class="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-3 bg-audiophile-surface p-4 text-center"
>
  <div class="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-audiophile-muted">
    <Music2 size={14} style="color: {appearance.accentColor}" />
    BPM
  </div>
  <div class="flex items-baseline gap-2">
    <span class="font-mono text-5xl font-bold tabular-nums text-audiophile-text" style="color: {appearance.accentColor}">
      {bpm ?? "--"}
    </span>
    <span class="text-xs font-mono text-audiophile-muted">BPM</span>
  </div>
  <Activity size={14} class={isPlaying && bpm ? "animate-pulse text-emerald-400" : "text-audiophile-muted/50"} />
</button>
