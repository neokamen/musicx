<script lang="ts">
  import { appearanceStore } from "../../store/index.ts";
  import { FORMAT_COLORS } from "../../types/spectrum.ts";
  import { Folder, Music, Play, Plus, FolderPlus } from "@lucide/svelte";
  import type { FileNode } from "../../types/index.ts";

  type ExplorerColumn = "name" | "type" | "size" | "duration" | "bitrate" | "action";
  type ExplorerColumnWidths = Record<ExplorerColumn, number>;

  interface Props {
    entry: FileNode;
    visibleColumns: {
      type: boolean;
      size: boolean;
      duration: boolean;
      bitrate: boolean;
      action: boolean;
    };
    columnWidths: ExplorerColumnWidths;
    durationSeconds: number | null;
    bitrateKbps: number | null;
    onPlay: (entry: FileNode) => void;
    onAddToQueue: (entry: FileNode) => void;
    onAddFolderToQueue: (entry: FileNode) => void;
    onNavigate: (path: string) => void;
  }

  let {
    entry,
    visibleColumns,
    columnWidths,
    durationSeconds,
    bitrateKbps,
    onPlay,
    onAddToQueue,
    onAddFolderToQueue,
    onNavigate,
  }: Props = $props();

  let appearance = $derived($appearanceStore);
  let extUpper = $derived(entry.extension?.toUpperCase() || "");
  let formatColor = $derived(
    appearance.coloredFormats !== false
      ? (FORMAT_COLORS[extUpper] || "#cbd5e1")
      : "#94a3b8"
  );
  let isHoveredLong = $state(false);
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;

  const handleMouseEnter = () => {
    const delayMs = Math.max(200, (appearance.marqueeDelay ?? 2) * 1000);
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
  ondblclick={() => (entry.is_dir ? onNavigate(entry.path) : onPlay(entry))}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  class="flex items-center justify-between px-2 py-1 rounded hover:bg-audiophile-surface2 cursor-pointer group transition-colors text-[11px]"
>
  <div class="relative flex items-center gap-2 overflow-hidden pr-2 min-w-0" style="flex: 0 0 {columnWidths.name}%;">
    {#if entry.is_dir}
      <Folder size={13} class="text-amber-400 shrink-0" />
    {:else}
      <Music size={13} class="text-cyan-400 shrink-0" />
    {/if}
    <div class="overflow-hidden whitespace-nowrap flex-1">
      <span
        class="text-audiophile-text {isHoveredLong ? 'inline-block animate-marquee' : 'truncate block'}"
        style={isHoveredLong ? "animation-duration: var(--marquee-duration, 10s);" : undefined}
      >
        {entry.name}
        {isHoveredLong ? ` \u00A0\u00A0\u00A0•\u00A0\u00A0\u00A0 ${entry.name}` : ""}
      </span>
    </div>
  </div>

  {#if visibleColumns.type}
    <div class="relative text-center shrink-0 text-audiophile-muted text-[10px]" style="flex: 0 0 {columnWidths.type}%;">
      {#if entry.is_dir}
        <span class="text-[9px] text-slate-500">DIR</span>
      {:else if entry.extension}
        <span
          class="uppercase px-1 rounded bg-slate-800/80 text-[9px] font-bold tracking-wide transition-colors"
          style="color: {formatColor};"
        >
          {entry.extension}
        </span>
      {:else}
        <span>---</span>
      {/if}
    </div>
  {/if}

  {#if visibleColumns.size}
    <div class="relative text-right shrink-0 text-audiophile-muted text-[10px] pr-2" style="flex: 0 0 {columnWidths.size}%;">
      {entry.is_dir ? "---" : `${(entry.size / (1024 * 1024)).toFixed(1)}M`}
    </div>
  {/if}

  {#if visibleColumns.duration}
    <div class="relative text-right shrink-0 text-audiophile-muted text-[10px] pr-2" style="flex: 0 0 {columnWidths.duration}%;">
      {entry.is_dir ? "---" : durationSeconds === null ? "--:--" : `${Math.floor(durationSeconds / 60)}:${String(Math.floor(durationSeconds % 60)).padStart(2, "0")}`}
    </div>
  {/if}

  {#if visibleColumns.bitrate}
    <div class="relative text-right shrink-0 text-audiophile-muted text-[10px] pr-2 font-mono" style="flex: 0 0 {columnWidths.bitrate}%;">
      {entry.is_dir ? "---" : bitrateKbps ? `${bitrateKbps}k` : "---"}
    </div>
  {/if}

  {#if visibleColumns.action}
    <div class="relative flex items-center justify-end gap-0 shrink-0" style="flex: 0 0 {columnWidths.action}%;">
      {#if entry.is_dir}
        <button
          onclick={(e) => {
            e.stopPropagation();
            onAddFolderToQueue(entry);
          }}
          class="px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-[10px] text-amber-300 opacity-0 group-hover:opacity-100 transition flex items-center gap-1 cursor-pointer"
          title="Añadir carpeta a la cola"
        >
          <FolderPlus size={11} />
          <span>+Cola</span>
        </button>
      {:else}
        <button
          onclick={(e) => {
            e.stopPropagation();
            onPlay(entry);
          }}
          class="flex h-6 w-6 items-center justify-center hover:text-cyan-400 opacity-0 group-hover:opacity-100 transition cursor-pointer"
          title="Reproducir pista"
        >
          <Play size={11} fill="currentColor" />
        </button>
        <button
          onclick={(e) => {
            e.stopPropagation();
            onAddToQueue(entry);
          }}
          class="flex h-6 w-6 items-center justify-center rounded bg-slate-800/80 hover:bg-emerald-900/40 text-emerald-300 opacity-0 group-hover:opacity-100 transition cursor-pointer"
          title="Añadir a la cola"
        >
          <Plus size={11} />
        </button>
      {/if}
    </div>
  {/if}
</div>
