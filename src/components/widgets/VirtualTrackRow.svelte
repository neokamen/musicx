<script lang="ts">
  import { useMusicStore } from "../../store/index.ts";
  import { Volume2 } from "@lucide/svelte";
  import type { Track } from "../../types/index.ts";

  type TrackColumn = "track" | "title" | "artist" | "album" | "format" | "bitrate" | "duration";
  type TrackColumnWidths = Record<TrackColumn, number>;

  function formatDuration(sec: number): string {
    if (!sec || isNaN(sec)) return "0:00";
    const mins = Math.floor(sec / 60);
    const remainingSecs = Math.floor(sec % 60);
    return `${mins}:${remainingSecs.toString().padStart(2, "0")}`;
  }

  interface Props {
    track: Track;
    index: number;
    top: number;
    height: number;
    isCurrent: boolean;
    isPlaying: boolean;
    columnWidths: TrackColumnWidths;
    visibleCols: {
      artist: boolean;
      album: boolean;
      format: boolean;
      bitrate: boolean;
      duration: boolean;
    };
    onDoubleClick: () => void;
    onContextMenu: (e: MouseEvent) => void;
  }

  let {
    track,
    index,
    top,
    height,
    isCurrent,
    isPlaying,
    columnWidths,
    visibleCols,
    onDoubleClick,
    onContextMenu,
  }: Props = $props();

  let isHoveredLong = $state(false);
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;

  const handleMouseEnter = () => {
    const delayMs = Math.max(200, (useMusicStore.getState().appearance.marqueeDelay ?? 2) * 1000);
    hoverTimer = setTimeout(() => {
      isHoveredLong = true;
    }, delayMs);
  };

  const handleMouseLeave = () => {
    if (hoverTimer) clearTimeout(hoverTimer);
    isHoveredLong = false;
  };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  ondblclick={onDoubleClick}
  oncontextmenu={onContextMenu}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  style="position: absolute; top: 0; left: 0; width: 100%; height: {height}px; transform: translateY({top}px);"
  class="flex items-center px-3 hover:bg-audiophile-surface2/80 cursor-pointer font-mono text-[11px] group transition-colors {isCurrent ? 'bg-audiophile-cyan/15 text-audiophile-cyan font-semibold' : 'text-audiophile-text'}"
>
  <div class="w-10 text-center text-audiophile-muted shrink-0" style="flex: 0 0 {columnWidths.track}%;">
    {#if isCurrent && isPlaying}
      <Volume2 size={12} class="inline text-audiophile-cyan animate-pulse" />
    {:else}
      {track.track_number || index + 1}
    {/if}
  </div>

  <div class="min-w-0 pr-2 overflow-hidden whitespace-nowrap" style="flex: 0 0 {columnWidths.title}%;">
    <span
      class="group-hover:text-white {isHoveredLong ? 'inline-block animate-marquee' : 'truncate block'}"
      style={isHoveredLong ? "animation-duration: var(--marquee-duration, 10s);" : undefined}
    >
      {track.title}
      {isHoveredLong ? ` \u00A0\u00A0\u00A0•\u00A0\u00A0\u00A0 ${track.title}` : ""}
    </span>
  </div>

  {#if visibleCols.artist}
    <div class="w-40 text-audiophile-muted group-hover:text-audiophile-text truncate pr-2 shrink-0" style="flex: 0 0 {columnWidths.artist}%;">
      {track.artist}
    </div>
  {/if}

  {#if visibleCols.album}
    <div class="w-40 text-audiophile-muted group-hover:text-audiophile-text truncate pr-2 shrink-0" style="flex: 0 0 {columnWidths.album}%;">
      {track.album}
    </div>
  {/if}

  {#if visibleCols.format}
    <div class="w-20 text-center shrink-0" style="flex: 0 0 {columnWidths.format}%;">
      <span class="text-[9px] px-1.5 py-0.5 rounded bg-audiophile-border/80 font-medium text-slate-300">
        {track.format}
      </span>
    </div>
  {/if}

  {#if visibleCols.bitrate}
    <div class="w-20 text-right text-audiophile-muted shrink-0 text-[10px] pr-2" style="flex: 0 0 {columnWidths.bitrate}%;">
      {track.bitrate_kbps > 0 ? `${track.bitrate_kbps}k` : "---"}
    </div>
  {/if}

  {#if visibleCols.duration}
    <div class="w-16 text-right text-audiophile-muted shrink-0" style="flex: 0 0 {columnWidths.duration}%;">
      {formatDuration(track.duration_seconds)}
    </div>
  {/if}
</div>
