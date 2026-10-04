<script lang="ts">
  import { Heart, Play, Radio, Trash2 } from "@lucide/svelte";
  import type { RadioStation } from "../../types/radio.ts";
  import { isStationLossless } from "../../services/radioApi.ts";

  interface Props {
    station: RadioStation;
    isFavorite: boolean;
    isActive: boolean;
    isPlaying: boolean;
    onPlay: (station: RadioStation) => void;
    onToggleFavorite: (station: RadioStation) => void;
    onRemoveCustom?: (station: RadioStation) => void;
  }

  let {
    station,
    isFavorite,
    isActive,
    isPlaying,
    onPlay,
    onToggleFavorite,
    onRemoveCustom,
  }: Props = $props();

  let faviconFailed = $state(false);
  let isLossless = $derived(isStationLossless(station));
  let normalizedBitrate = $derived.by(() => {
    const b = station.bitrate || 0;
    return b > 1000 ? Math.round(b / 1000) : b;
  });
  let qualityLabel = $derived(
    isLossless
      ? "Lossless"
      : normalizedBitrate >= 320
        ? `${normalizedBitrate} kbps`
        : ""
  );
  let details = $derived(
    [station.country, station.codec, normalizedBitrate > 0 ? `${normalizedBitrate} kbps` : null]
      .filter(Boolean)
      .join(" · ")
  );
</script>

<article
  class="flex min-w-0 items-center gap-3 border-b border-audiophile-border/70 px-3 py-2.5 transition-colors {isActive ? 'bg-audiophile-cyan/10' : 'hover:bg-audiophile-surface2/70'}"
>
  <div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-audiophile-surface2 text-audiophile-cyan">
    {#if station.favicon && !faviconFailed}
      <img
        src={station.favicon}
        alt=""
        class="h-full w-full object-cover"
        onerror={() => (faviconFailed = true)}
      />
    {:else}
      <Radio size={17} />
    {/if}
  </div>
  <div class="min-w-0 flex-1">
    <div class="flex min-w-0 items-center gap-2">
      <h3 class="truncate text-xs font-semibold text-audiophile-text" title={station.name}>
        {station.name}
      </h3>
      {#if qualityLabel}
        <span
          class="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold {isLossless ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}"
        >
          {qualityLabel}
        </span>
      {/if}
      {#if isActive && isPlaying}
        <span class="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" title="En directo"></span>
      {/if}
    </div>
    <p class="mt-0.5 truncate text-[10px] text-audiophile-muted">
      {station.tags || details || "Emisora online"}
    </p>
  </div>
  <div class="flex shrink-0 items-center gap-1">
    <button
      type="button"
      onclick={() => onToggleFavorite(station)}
      class="rounded p-1.5 transition-colors {isFavorite ? 'text-rose-400' : 'text-audiophile-muted hover:text-rose-300'}"
      title={isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
      aria-label={isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
    >
      <Heart size={14} fill={isFavorite ? "currentColor" : "none"} />
    </button>
    <button
      type="button"
      onclick={() => onPlay(station)}
      class="rounded p-1.5 transition-colors hover:brightness-125 focus:outline-none"
      style="color: var(--app-accent);"
      title="Reproducir {station.name}"
      aria-label="Reproducir {station.name}"
    >
      <Play size={16} fill="currentColor" />
    </button>
    {#if station.isCustom && onRemoveCustom}
      <button
        type="button"
        onclick={() => onRemoveCustom(station)}
        class="rounded p-1.5 text-audiophile-muted hover:text-rose-400"
        title="Eliminar emisora personalizada"
        aria-label="Eliminar emisora personalizada"
      >
        <Trash2 size={14} />
      </button>
    {/if}
  </div>
</article>
