<script lang="ts">
  import { Tag } from "@lucide/svelte";
  import { useMusicStore } from "../../store/index.ts";

  const musicStore = useMusicStore;
  let currentTrack = $derived($musicStore.currentTrack);
  let telemetry = $derived($musicStore.telemetry);
  let appearance = $derived($musicStore.appearance);

  let fields = $derived([
    { label: "Título", value: telemetry.track_title || currentTrack?.title },
    { label: "Artista", value: telemetry.track_artist || currentTrack?.artist },
    { label: "Álbum", value: telemetry.track_album || currentTrack?.album },
    { label: "Pista", value: currentTrack?.track_number ? String(currentTrack.track_number) : undefined },
  ]);
</script>

<div class="flex h-full w-full flex-col overflow-hidden bg-audiophile-surface p-3 text-xs">
  <div class="mb-3 flex items-center gap-2 border-b border-audiophile-border pb-2 font-mono text-[10px] uppercase tracking-wider text-audiophile-muted">
    <Tag size={14} style="color: {appearance.accentColor}" />
    Etiquetas ID3
  </div>
  <dl class="grid min-h-0 grid-cols-1 gap-y-2 overflow-y-auto">
    {#each fields as field (field.label)}
      <div class="min-w-0">
        <dt class="text-[9px] uppercase text-audiophile-muted">{field.label}</dt>
        <dd class="truncate font-mono text-audiophile-text" title={field.value || undefined}>
          {field.value || "---"}
        </dd>
      </div>
    {/each}
  </dl>
</div>
