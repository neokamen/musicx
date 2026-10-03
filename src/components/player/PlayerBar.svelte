<script lang="ts">
  import {
    useMusicStore,
    isPlayingStore,
    volumeStore,
    currentTrackStore,
    shuffleStore,
    repeatStore,
    bitPerfectModeStore,
    playbackProgressStore,
  } from "../../store/index.ts";
  import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Volume2,
    VolumeX,
    Shuffle,
    Repeat,
    ShieldCheck,
  } from "@lucide/svelte";

  function formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  let isPlaying = $derived($isPlayingStore);
  let volume = $derived($volumeStore);
  let currentTrack = $derived($currentTrackStore);
  let shuffle = $derived($shuffleStore);
  let repeat = $derived($repeatStore);
  let bitPerfectMode = $derived($bitPerfectModeStore);
  let progressData = $derived($playbackProgressStore);

  let currentTime = $derived(progressData.current_time || 0);
  let duration = $derived(progressData.duration || currentTrack?.duration_seconds || 0);

  const handleSeek = (e: Event) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    useMusicStore.getState().seek(val);
  };

  const handleVolume = (e: Event) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    void useMusicStore.getState().setVolume(val);
  };

  let title = $derived(telemetry.track_title || currentTrack?.title || "Musicx Hi-Fi Player");
  let artist = $derived(telemetry.track_artist || currentTrack?.artist || "Listo para reproducir");
</script>

<footer class="h-16 border-t border-audiophile-border bg-audiophile-surface px-4 flex items-center justify-between gap-4 font-sans select-none z-40">
  <!-- Información de la pista actual -->
  <div class="flex items-center gap-3 w-1/4 min-w-[200px] overflow-hidden">
    <div class="w-10 h-10 rounded bg-audiophile-surface2 border border-audiophile-border flex items-center justify-center shrink-0">
      <span class="font-mono text-[10px] font-bold text-audiophile-cyan">
        {currentTrack?.format || "PCM"}
      </span>
    </div>
    <div class="truncate">
      <div class="font-semibold text-xs text-white truncate">
        {title}
      </div>
      <div class="text-[11px] text-audiophile-muted truncate">
        {artist}
      </div>
    </div>
  </div>

  <!-- Controles centrales de Transporte y Barra de Progreso -->
  <div class="flex-1 max-w-2xl flex flex-col items-center gap-1">
    <div class="flex items-center gap-3">
      <button
        onclick={() => useMusicStore.getState().toggleShuffle()}
        class="p-1.5 rounded transition-colors {shuffle ? 'text-audiophile-cyan' : 'text-audiophile-muted hover:text-white'}"
        title={`Aleatorio: ${shuffle ? "Activado" : "Desactivado"}`}
      >
        <Shuffle size={14} />
      </button>

      <button
        onclick={() => void useMusicStore.getState().previousTrack()}
        class="p-1.5 rounded hover:bg-audiophile-surface2 text-audiophile-text transition-colors"
        title="Anterior"
      >
        <SkipBack size={16} />
      </button>

      <button
        onclick={() => void useMusicStore.getState().togglePlayPause()}
        class="w-8 h-8 rounded-full bg-audiophile-cyan text-audiophile-base flex items-center justify-center shadow hover:scale-105 active:scale-95 transition-all"
        title={isPlaying ? "Pausar" : "Reproducir"}
      >
        {#if isPlaying}
          <Pause size={16} fill="currentColor" />
        {:else}
          <Play size={16} fill="currentColor" class="ml-0.5" />
        {/if}
      </button>

      <button
        onclick={() => void useMusicStore.getState().nextTrack()}
        class="p-1.5 rounded hover:bg-audiophile-surface2 text-audiophile-text transition-colors"
        title="Siguiente"
      >
        <SkipForward size={16} />
      </button>

      <button
        onclick={() => useMusicStore.getState().cycleRepeat()}
        class="p-1.5 rounded transition-colors {repeat !== 'off' ? 'text-audiophile-cyan' : 'text-audiophile-muted hover:text-white'}"
        title={`Repetir: ${repeat}`}
      >
        <Repeat size={14} />
      </button>
    </div>

    <!-- Barra de progreso / Seekbar -->
    <div class="w-full flex items-center gap-2 font-mono text-[10px] text-audiophile-muted">
      <span>{formatTime(currentTime)}</span>
      <input
        type="range"
        min={0}
        max={duration || 100}
        value={currentTime}
        oninput={handleSeek}
        class="flex-1 h-1 bg-audiophile-border rounded-lg appearance-none cursor-pointer accent-audiophile-cyan hover:h-1.5 transition-all"
      />
      <span>{formatTime(duration)}</span>
    </div>
  </div>

  <!-- Telemetría y Controles de Salida / Volumen -->
  <div class="flex items-center justify-end gap-3 w-1/4 min-w-[200px]">
    {#if bitPerfectMode}
      <div
        class="flex items-center gap-1 text-[10px] font-mono text-audiophile-cyan bg-audiophile-cyan/10 px-2 py-0.5 rounded border border-audiophile-cyan/20"
        title="Modo Bit-Perfect Activo: Reproducción sin remuestreo por hardware"
      >
        <ShieldCheck size={12} />
        <span>BIT-PERFECT</span>
      </div>
    {/if}

    <div class="flex items-center gap-2">
      <button
        onclick={() => void useMusicStore.getState().setVolume(volume > 0 ? 0 : 0.8)}
        class="text-audiophile-muted hover:text-white transition-colors"
      >
        {#if volume === 0}
          <VolumeX size={16} />
        {:else}
          <Volume2 size={16} />
        {/if}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        oninput={handleVolume}
        class="w-20 h-1 bg-audiophile-border rounded-lg appearance-none cursor-pointer accent-audiophile-cyan hover:h-1.5 transition-all"
        title={`Volumen: ${Math.round(volume * 100)}%`}
      />
    </div>
  </div>
</footer>
