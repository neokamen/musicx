<script lang="ts">
  import { Disc3, Music2 } from "@lucide/svelte";
  import {
    useMusicStore,
    currentTrackStore,
    currentCoverArtStore,
    appearanceStore,
    isPlayingStore,
  } from "../../store/index.ts";

  let currentTrack = $derived($currentTrackStore);
  let currentCoverArt = $derived($currentCoverArtStore);
  let appearance = $derived($appearanceStore);
  let isPlaying = $derived($isPlayingStore);

  let title = $derived(currentTrack?.title || "Musicx Hi-Fi");
  let artist = $derived(currentTrack?.artist || "Listo para reproducir");
  let album = $derived(currentTrack?.album || "Sin Álbum");
</script>

<div class="flex flex-col h-full w-full bg-audiophile-surface select-none font-sans overflow-hidden text-xs justify-center items-center p-3">
  <div
    class="relative w-full max-w-[220px] aspect-square rounded-xl bg-slate-950 border border-slate-800 shadow-2xl flex items-center justify-center group overflow-hidden transition-all duration-300 shrink-0"
    style:border-color={appearance.neonGlow ? `${appearance.accentColor}55` : undefined}
    style:box-shadow={appearance.neonGlow
      ? `0 0 25px ${appearance.accentColor}25`
      : "0 10px 30px rgba(0,0,0,0.5)"}
  >
    {#if currentCoverArt}
      <img
        src={currentCoverArt}
        alt={album}
        class="w-full h-full object-cover rounded-xl group-hover:scale-105 transition-transform duration-500"
      />
    {:else}
      <div class="relative flex flex-col items-center justify-center text-slate-600">
        <div
          class="w-28 h-28 rounded-full border-4 border-slate-800 flex items-center justify-center bg-slate-900/80 shadow-inner {isPlaying ? 'animate-spin' : ''}"
          style="animation-duration: 5s"
        >
          <div
            class="w-10 h-10 rounded-full border-2 border-slate-700 flex items-center justify-center shadow-md"
            style:background-color="{appearance.accentColor}20"
          >
            <Music2 size={18} style="color: {appearance.accentColor}" />
          </div>
        </div>
        <Disc3
          size={22}
          class="absolute text-slate-500 opacity-50 pointer-events-none"
        />
      </div>
    {/if}

    <div class="absolute bottom-2 left-2 right-2 text-center pointer-events-none">
      <span class="font-mono text-[9px] uppercase tracking-wider text-white bg-slate-950/85 px-2 py-0.5 rounded backdrop-blur border border-slate-700/60 block truncate shadow-lg">
        {album}
      </span>
    </div>
  </div>

  <div class="text-center w-full px-2 mt-2">
    <h3 class="font-bold text-xs text-white truncate" title={title}>
      {title}
    </h3>
    <p class="text-[11px] text-slate-400 truncate mt-0.5">{artist}</p>
  </div>
</div>
