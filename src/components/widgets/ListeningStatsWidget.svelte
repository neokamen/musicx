<script lang="ts">
  import { Clock3, Disc3, Headphones } from "@lucide/svelte";
  import {
    listeningStatsStore,
    isPlayingStore,
    currentTrackStore,
    appearanceStore,
  } from "../../store/index.ts";

  let listeningStats = $derived($listeningStatsStore);
  let isPlaying = $derived($isPlayingStore);
  let currentTrack = $derived($currentTrackStore);
  let appearance = $derived($appearanceStore);

  let totalSeconds = $derived(Math.max(0, Math.floor(listeningStats.totalSecondsListened)));
  let hours = $derived(Math.floor(totalSeconds / 3600));
  let minutes = $derived(Math.floor((totalSeconds % 3600) / 60));
  let trackName = $derived(
    currentTrack
      ? `${currentTrack.artist || "Artista desconocido"} · ${currentTrack.title}`
      : "Sin pista activa"
  );
</script>

<div class="flex h-full min-h-0 flex-col overflow-hidden bg-audiophile-surface p-3 font-mono text-xs">
  <header class="flex shrink-0 items-center justify-between border-b border-audiophile-border pb-2">
    <span class="text-[10px] uppercase tracking-widest text-audiophile-muted">Listening log</span>
    <span class="size-1.5 rounded-full {isPlaying ? 'bg-emerald-400' : 'bg-slate-600'}"></span>
  </header>
  <div class="grid min-h-0 flex-1 grid-cols-3 gap-2 py-3">
    <div class="flex min-w-0 flex-col justify-center border-l-2 border-cyan-500/70 bg-audiophile-surface2/50 px-2">
      <Clock3 size={13} class="mb-1 text-cyan-300" />
      <span class="truncate text-lg font-bold" style:color={appearance.accentColor}>{hours}h {minutes}m</span>
      <span class="text-[9px] uppercase text-audiophile-muted">Tiempo total</span>
    </div>
    <div class="flex min-w-0 flex-col justify-center border-l-2 border-amber-500/70 bg-audiophile-surface2/50 px-2">
      <Disc3 size={13} class="mb-1 text-amber-300" />
      <span class="truncate text-lg font-bold text-audiophile-text">{listeningStats.totalTracksPlayed.toLocaleString()}</span>
      <span class="text-[9px] uppercase text-audiophile-muted">Pistas</span>
    </div>
    <div class="flex min-w-0 flex-col justify-center border-l-2 border-emerald-500/70 bg-audiophile-surface2/50 px-2">
      <Headphones size={13} class="mb-1 text-emerald-300" />
      <span class="truncate text-lg font-bold text-audiophile-text">{listeningStats.totalSessions.toLocaleString()}</span>
      <span class="text-[9px] uppercase text-audiophile-muted">Sesiones</span>
    </div>
  </div>
  <footer class="shrink-0 truncate border-t border-audiophile-border pt-2 text-[10px] text-slate-400" title={trackName}>
    {isPlaying ? trackName : "Reproducción en pausa"}
  </footer>
</div>
