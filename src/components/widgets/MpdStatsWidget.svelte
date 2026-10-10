<script lang="ts">
  import { onMount } from "svelte";
  import {
    HardDrive,
    Server,
    Music,
    Disc,
    User,
    Clock,
    RefreshCw,
    ExternalLink,
    Calendar,
  } from "@lucide/svelte";
  import { useMusicStore, appearanceStore } from "../../store/index.ts";
  import type { MpdServerStatus, MpdConfig } from "../../types/mpd";
  import {
    getSavedMpdConfig,
    mpdGetStatus,
    mpdSendCommand,
  } from "../../services/mpdService";

  const appearance = $derived($appearanceStore);

  let config = $state<MpdConfig>(getSavedMpdConfig());
  let status = $state<MpdServerStatus | null>(null);
  let isUpdating = $state(false);

  async function fetchStatus(silent = true) {
    if (!silent) isUpdating = true;
    try {
      config = getSavedMpdConfig();
      status = await mpdGetStatus(config.host, config.port, config.password);
    } catch (e) {
      // Ignored
    } finally {
      if (!silent) isUpdating = false;
    }
  }

  async function triggerUpdate() {
    try {
      await mpdSendCommand(config.host, config.port, config.password, "update");
      await fetchStatus(true);
    } catch (e) {
      console.error("Error updating MPD DB:", e);
    }
  }

  function formatUptime(secs: number): string {
    if (!secs) return "0h";
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    return d > 0 ? `${d}d ${h}h` : `${h}h`;
  }

  function formatUpdateDate(ts: number): string {
    if (!ts) return "Desconocida";
    const date = new Date(ts * 1000);
    return date.toLocaleDateString();
  }

  onMount(() => {
    void fetchStatus(false);
  });
</script>

<div class="flex flex-col h-full w-full bg-audiophile-surface border border-audiophile-border rounded-lg overflow-hidden text-slate-100 font-sans p-3 justify-between">
  <!-- Header -->
  <div class="flex items-center justify-between pb-2 border-b border-audiophile-border select-none">
    <div class="flex items-center gap-2">
      <HardDrive size={14} style="color: {appearance.accentColor || '#06b6d4'};" />
      <span class="text-xs font-bold text-white font-mono">MPD Estadísticas</span>
      {#if status?.connected}
        <span class="text-[10px] font-mono text-emerald-400 font-bold">({status.ping_ms}ms)</span>
      {/if}
    </div>

    <div class="flex items-center gap-1.5">
      <button
        type="button"
        onclick={triggerUpdate}
        class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-audiophile-surface border border-audiophile-border hover:border-audiophile-cyan text-slate-200 transition cursor-pointer"
        title="Actualizar base de datos de MPD (update)"
      >
        <RefreshCw size={10} class={isUpdating ? "animate-spin text-audiophile-cyan" : ""} />
        <span>Update</span>
      </button>

      <button
        type="button"
        onclick={() => useMusicStore.getState().setMpdHubOpen(true)}
        class="p-1 rounded text-slate-400 hover:text-audiophile-cyan transition cursor-pointer"
        title="Abrir Hub MPD completo"
      >
        <ExternalLink size={12} />
      </button>
    </div>
  </div>

  <!-- Content Metric Grid -->
  <div class="grid grid-cols-2 gap-2 py-2">
    <!-- Songs -->
    <div class="p-2 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center gap-2.5">
      <div class="p-1.5 rounded-lg bg-cyan-500/15 text-cyan-400 shrink-0">
        <Music size={14} />
      </div>
      <div class="min-w-0">
        <span class="block text-[9px] font-mono text-slate-400">Canciones</span>
        <span class="text-sm font-bold font-mono text-white leading-none">
          {status?.stats.songs ? status.stats.songs.toLocaleString() : "—"}
        </span>
      </div>
    </div>

    <!-- Albums -->
    <div class="p-2 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center gap-2.5">
      <div class="p-1.5 rounded-lg bg-purple-500/15 text-purple-400 shrink-0">
        <Disc size={14} />
      </div>
      <div class="min-w-0">
        <span class="block text-[9px] font-mono text-slate-400">Álbumes</span>
        <span class="text-sm font-bold font-mono text-white leading-none">
          {status?.stats.albums ? status.stats.albums.toLocaleString() : "—"}
        </span>
      </div>
    </div>

    <!-- Artists -->
    <div class="p-2 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center gap-2.5">
      <div class="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 shrink-0">
        <User size={14} />
      </div>
      <div class="min-w-0">
        <span class="block text-[9px] font-mono text-slate-400">Artistas</span>
        <span class="text-sm font-bold font-mono text-white leading-none">
          {status?.stats.artists ? status.stats.artists.toLocaleString() : "—"}
        </span>
      </div>
    </div>

    <!-- Playtime -->
    <div class="p-2 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center gap-2.5">
      <div class="p-1.5 rounded-lg bg-amber-500/15 text-amber-400 shrink-0">
        <Clock size={14} />
      </div>
      <div class="min-w-0">
        <span class="block text-[9px] font-mono text-slate-400">Tiempo Total</span>
        <span class="text-sm font-bold font-mono text-white leading-none">
          {status?.stats.db_playtime ? `${Math.floor(status.stats.db_playtime / 3600)}h` : "—"}
        </span>
      </div>
    </div>
  </div>

  <!-- Footer Info -->
  <div class="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-500">
    <span>Uptime: {formatUptime(status?.stats.uptime || 0)}</span>
    <span>Actualizado: {formatUpdateDate(status?.stats.db_update || 0)}</span>
  </div>
</div>
