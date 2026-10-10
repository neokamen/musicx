<script lang="ts">
  import { onMount } from "svelte";
  import {
    Play,
    Pause,
    Square,
    SkipForward,
    SkipBack,
    Volume2,
    VolumeX,
    Repeat,
    Shuffle,
    Server,
    RefreshCw,
    ExternalLink,
    Music,
    Radio,
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
  let pollTimer: number | null = null;
  let remoteVolume = $state(50);
  let isMuted = $state(false);
  let prevVolume = 50;

  async function fetchStatus(silent = true) {
    if (!silent) isUpdating = true;
    try {
      config = getSavedMpdConfig();
      const res = await mpdGetStatus(config.host, config.port, config.password);
      status = res;
      if (res.connected && res.volume >= 0) {
        remoteVolume = res.volume;
      }
    } catch (e) {
      // Ignored on poll
    } finally {
      if (!silent) isUpdating = false;
    }
  }

  async function sendCmd(cmd: string, arg?: string) {
    try {
      await mpdSendCommand(config.host, config.port, config.password, cmd, arg);
      await fetchStatus(true);
    } catch (e) {
      console.error(`Error sending MPD command ${cmd}:`, e);
    }
  }

  function handleVolumeChange(e: Event) {
    const val = Number((e.currentTarget as HTMLInputElement).value);
    remoteVolume = val;
    isMuted = false;
    void sendCmd("setvol", String(val));
  }

  function toggleMute() {
    if (isMuted) {
      remoteVolume = prevVolume;
      isMuted = false;
      void sendCmd("setvol", String(prevVolume));
    } else {
      prevVolume = remoteVolume;
      remoteVolume = 0;
      isMuted = true;
      void sendCmd("setvol", "0");
    }
  }

  function formatSecs(sec: number): string {
    if (!sec || isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  onMount(() => {
    void fetchStatus(false);
    pollTimer = window.setInterval(() => {
      void fetchStatus(true);
    }, 2500);

    return () => {
      if (pollTimer) window.clearInterval(pollTimer);
    };
  });
</script>

<div class="flex flex-col h-full w-full bg-audiophile-surface border border-audiophile-border rounded-lg overflow-hidden text-slate-100 font-sans p-3 justify-between">
  <!-- Header -->
  <div class="flex items-center justify-between pb-2 border-b border-audiophile-border select-none">
    <div class="flex items-center gap-2">
      <Server size={14} style="color: {appearance.accentColor || '#06b6d4'};" />
      <span class="text-xs font-bold text-white font-mono">MPD Control Remoto</span>
      {#if status?.connected}
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title={`Conectado (${status.ping_ms}ms)`}></span>
      {:else}
        <span class="w-2 h-2 rounded-full bg-slate-500" title="Desconectado"></span>
      {/if}
    </div>

    <div class="flex items-center gap-1">
      <button
        type="button"
        onclick={() => void fetchStatus(false)}
        class="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer"
        title="Refrescar estado"
      >
        <RefreshCw size={12} class={isUpdating ? "animate-spin text-audiophile-cyan" : ""} />
      </button>

      <button
        type="button"
        onclick={() => useMusicStore.getState().setMpdHubOpen(true)}
        class="p-1 rounded text-slate-400 hover:text-audiophile-cyan transition cursor-pointer"
        title="Abrir Hub MPD"
      >
        <ExternalLink size={12} />
      </button>
    </div>
  </div>

  <!-- Now Playing Details -->
  <div class="flex flex-col items-center justify-center py-2 text-center space-y-1">
    <div class="w-10 h-10 rounded-xl bg-slate-850 border border-slate-700/60 flex items-center justify-center text-audiophile-cyan shadow-inner">
      <Music size={20} />
    </div>

    <div class="w-full px-2">
      <h4 class="text-xs font-bold text-white truncate">
        {status?.current_song?.title || status?.current_song?.file?.split("/").pop() || "Sin reproducción"}
      </h4>
      <p class="text-[11px] text-slate-400 truncate">
        {status?.current_song?.artist || "MPD Server"}
        {#if status?.current_song?.album}
          {" · "}{status?.current_song?.album}
        {/if}
      </p>
    </div>

    <!-- Seek Indicator -->
    <div class="w-full px-2 pt-1 font-mono text-[10px] text-slate-500 flex justify-between">
      <span>{formatSecs(status?.elapsed || 0)}</span>
      <span class="text-audiophile-cyan uppercase font-bold">{status?.state || "stop"}</span>
      <span>{formatSecs(status?.duration || 0)}</span>
    </div>
  </div>

  <!-- Transport Controls -->
  <div class="flex flex-col space-y-2 pt-1 border-t border-slate-800/80">
    <div class="flex items-center justify-center gap-2">
      <button
        type="button"
        onclick={() => sendCmd("repeat", status?.repeat ? "0" : "1")}
        class="p-1.5 rounded text-xs transition cursor-pointer {status?.repeat ? 'text-audiophile-cyan bg-audiophile-cyan/15' : 'text-slate-500 hover:text-slate-300'}"
        title="Repetición"
      >
        <Repeat size={12} />
      </button>

      <button
        type="button"
        onclick={() => sendCmd("previous")}
        class="p-1.5 rounded-lg bg-slate-850 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
        title="Anterior"
      >
        <SkipBack size={13} />
      </button>

      {#if status?.state === "play"}
        <button
          type="button"
          onclick={() => sendCmd("pause")}
          class="p-2 rounded-xl bg-audiophile-cyan text-black font-bold hover:scale-105 transition cursor-pointer shadow-md"
          title="Pausar"
        >
          <Pause size={15} />
        </button>
      {:else}
        <button
          type="button"
          onclick={() => sendCmd("resume")}
          class="p-2 rounded-xl bg-audiophile-cyan text-black font-bold hover:scale-105 transition cursor-pointer shadow-md"
          title="Reproducir"
        >
          <Play size={15} />
        </button>
      {/if}

      <button
        type="button"
        onclick={() => sendCmd("stop")}
        class="p-1.5 rounded-lg bg-slate-850 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
        title="Detener"
      >
        <Square size={13} />
      </button>

      <button
        type="button"
        onclick={() => sendCmd("next")}
        class="p-1.5 rounded-lg bg-slate-850 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
        title="Siguiente"
      >
        <SkipForward size={13} />
      </button>

      <button
        type="button"
        onclick={() => sendCmd("random", status?.random ? "0" : "1")}
        class="p-1.5 rounded text-xs transition cursor-pointer {status?.random ? 'text-audiophile-cyan bg-audiophile-cyan/15' : 'text-slate-500 hover:text-slate-300'}"
        title="Aleatorio"
      >
        <Shuffle size={12} />
      </button>
    </div>

    <!-- Volume Slider -->
    <div class="flex items-center justify-center gap-2 px-1 text-xs">
      <button
        type="button"
        onclick={toggleMute}
        class="text-slate-400 hover:text-white transition cursor-pointer"
        title={isMuted ? "Restaurar volumen" : "Silenciar"}
      >
        {#if isMuted || remoteVolume === 0}
          <VolumeX size={13} class="text-rose-400" />
        {:else}
          <Volume2 size={13} class="text-audiophile-cyan" />
        {/if}
      </button>

      <input
        type="range"
        min="0"
        max="100"
        value={remoteVolume}
        oninput={handleVolumeChange}
        class="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
      />

      <span class="font-mono text-[10px] text-slate-400 w-7 text-right">
        {remoteVolume}%
      </span>
    </div>
  </div>
</div>
