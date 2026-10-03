<script lang="ts">
  import { onMount } from "svelte";
  import {
    useMusicStore,
    AUDIO_ENGINES,
    isPlayingStore,
    activeRadioStationStore,
    volumeStore,
    currentTrackStore,
    currentCoverArtStore,
    shuffleStore,
    repeatStore,
    audioSettingsStore,
    playbackSettingsStore,
    bitPerfectModeStore,
    availableDevicesStore,
    selectedDeviceStore,
    appearanceStore,
    languageStore,
    playbackProgressStore,
  } from "../../store/index.ts";
  import { TRANSPORT_STYLES } from "../../lib/transportStyles.ts";
  import { SOUNDIX_PRESETS } from "../../types/eq.ts";
  import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Volume2,
    VolumeX,
    Shuffle,
    Repeat,
    Repeat1,
    Speaker,
    AudioLines,
    AudioWaveform,
    CircleDot,
    Sliders,
    Flame,
    Layers,
    Sparkles,
    Zap,
  } from "@lucide/svelte";
  import { t } from "../../i18n/translations.ts";

  const FORMAT_COLORS: Record<string, string> = {
    MP3: "#f59e0b",
    FLAC: "#22d3ee",
    WAV: "#a78bfa",
    OGG: "#84cc16",
    OPUS: "#60a5fa",
    AAC: "#fb7185",
    M4A: "#f472b6",
    ALAC: "#e2e8f0",
    APE: "#fb923c",
    AIFF: "#c084fc",
    WMA: "#38bdf8",
    RADIO: "#ec4899",
    STREAM: "#06b6d4",
  };

  const EMPTY_SEEKBAR_SPECTRUM = Array.from({ length: 192 }, () => 0.025);

  function formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  interface Props {
    height: number;
    isEditing: boolean;
    onHeightChange: (height: number, commit?: boolean) => void;
  }

  let { height, isEditing, onHeightChange }: Props = $props();

  let isPlaying = $derived($isPlayingStore);
  let activeRadioStation = $derived($activeRadioStationStore);
  let volume = $derived($volumeStore);
  let currentTrack = $derived($currentTrackStore);
  let currentCoverArt = $derived($currentCoverArtStore);
  let shuffle = $derived($shuffleStore);
  let repeat = $derived($repeatStore);
  let audioSettings = $derived($audioSettingsStore);
  let playbackSettings = $derived($playbackSettingsStore);
  let bitPerfectMode = $derived($bitPerfectModeStore);
  let availableDevices = $derived($availableDevicesStore);
  let selectedDevice = $derived($selectedDeviceStore);
  let appearance = $derived($appearanceStore);
  let lang = $derived($languageStore);
  let progressData = $derived($playbackProgressStore);

  let isDeviceMenuOpen = $state(false);
  let isEqPopupOpen = $state(false);
  let bitPerfectPulse = $state(false);
  let isPlayFlipping = $state(false);
  let playerBarWidthPreview = $state<number | null>(null);
  let playerInfoWidthPreview = $state<number | null>(null);
  let seekbarAreaWidth = $state(Math.max(0, typeof window !== "undefined" ? window.innerWidth - 32 : 800));
  let isDraggingSeek = $state(false);

  let resizeStart: { x: number; width: number } | null = null;
  let heightResizeStart: { y: number; height: number } | null = null;
  let seekbarAreaRef: HTMLDivElement | null = $state(null);
  let scrubberRef: HTMLDivElement | null = $state(null);

  let currentTime = $derived(progressData.current_time);
  let duration = $derived(progressData.duration);

  let title = $derived(currentTrack?.title || "Musicx Hi-Fi Player");
  let artist = $derived(currentTrack?.artist || t("readyToPlay", lang));
  let format = $derived(
    currentTrack?.format ||
      (currentTrack?.filepath ? currentTrack.filepath.split(".").pop()?.toUpperCase() : "PCM")
  );
  let normalizedFormat = $derived((format || "PCM").toUpperCase());
  let isRadio = $derived(Boolean(activeRadioStation || currentTrack?.format === "RADIO"));

  let channels = $derived(useMusicStore.getState().telemetry.channels || 2);
  let isMono = $derived(channels === 1);

  let isEqActive = $derived(audioSettings?.isEqEnabled ?? false);
  let isNormActive = $derived(audioSettings?.isNormalizerEnabled ?? false);
  let isXdssActive = $derived(audioSettings?.isXdssEnabled ?? false);
  let isXtsProActive = $derived(audioSettings?.isXtsProEnabled ?? false);
  let eqGains = $derived(audioSettings?.eqGains || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  let maxVolumeLimit = $derived(audioSettings?.allowExtraVolumeBoost ? 1.35 : 1.0);
  let volumePercentage = $derived(Math.round(volume * 100));
  let isBoosted = $derived(volumePercentage > 100);
  let accentColor = $derived(appearance.accentColor || "#06b6d4");
  let volPct = $derived(Math.min(100, Math.max(0, (volume / maxVolumeLimit) * 100)));
  let volColor = $derived(isBoosted ? "#ef4444" : accentColor);
  let formatColor = $derived(FORMAT_COLORS[normalizedFormat] || accentColor);
  let sampleRate = $derived(currentTrack?.sample_rate || 0);
  let bitrate = $derived(currentTrack?.bitrate_kbps || 0);
  let playerBarWidth = $derived(playerBarWidthPreview ?? playbackSettings?.playerBarWidth ?? 100);
  let maxPlayerInfoWidth = $derived(Math.max(204, Math.min(420, (typeof window !== "undefined" ? window.innerWidth - 32 - 200 : 800) / 2)));
  let storedPlayerInfoWidth = $derived(playbackSettings?.playerInfoWidth ?? 204);
  let playerInfoWidth = $derived(
    playerInfoWidthPreview ?? (
      storedPlayerInfoWidth < 100
        ? 204
        : Math.max(204, Math.min(maxPlayerInfoWidth, storedPlayerInfoWidth))
    )
  );
  let transportStyle = $derived(TRANSPORT_STYLES[playbackSettings?.transportStyle || "studio"]);
  let showSeekbar = $derived(seekbarAreaWidth * playerBarWidth / 100 >= 112);

  onMount(() => {
    const seekbarArea = seekbarAreaRef;
    if (!seekbarArea) return;
    const observer = new ResizeObserver(([entry]) => {
      seekbarAreaWidth = entry.contentRect.width;
    });
    observer.observe(seekbarArea);
    return () => observer.disconnect();
  });

  let detectedBpm = $derived(
    progressData.tempo_bpm && progressData.tempo_confidence >= 0.12
      ? Math.round(progressData.tempo_bpm)
      : null
  );
  let currentBpm = $derived(detectedBpm ?? 120);
  let beatPeriod = $derived(60 / currentBpm);

  let songPeaks = $derived.by(() => {
    const raw = progressData.seekbar_spectrum || [];
    if (!raw.length) return EMPTY_SEEKBAR_SPECTRUM;
    if (raw.length === 192) return raw;
    const targetBins = 192;
    const step = raw.length / targetBins;
    const res: number[] = new Array(targetBins);
    for (let i = 0; i < targetBins; i++) {
      const idx = Math.min(raw.length - 1, Math.floor(i * step));
      res[i] = raw[idx] || 0.025;
    }
    return res;
  });

  let progress = $derived(duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0);
  let activeBarIdx = $derived(Math.floor(progress * songPeaks.length));
  let liveSpectrum = $derived(progressData.spectrum || []);

  let seekbarStyle = $derived(playbackSettings?.playerBarStyle || "spectrum");
  let isTallerWaveform = $derived(
    seekbarStyle === "waveform_bars" ||
    seekbarStyle === "waveform_envelope" ||
    seekbarStyle === "waveform_matrix"
  );
  let isWaveSeekbar = $derived(
    seekbarStyle === "aurora" ||
    (seekbarStyle as string) === "wave" ||
    seekbarStyle === "hybrid" ||
    seekbarStyle === "waveform_envelope"
  );
  let scrubberHoverX = $state<number | null>(null);

  let waveformSamples = $derived.by(() => {
    if (!isWaveSeekbar) return [];
    const hasPeaks = songPeaks.some((p) => p > 0.035);
    const count = 96;
    return Array.from({ length: count }, (_, index) => {
      const norm = index / (count - 1);
      let amp = 0.08;
      if (hasPeaks) {
        const peakIdx = Math.min(songPeaks.length - 1, Math.floor(norm * songPeaks.length));
        amp = Math.max(0.06, Math.min(0.96, songPeaks[peakIdx] || 0.08));
      } else {
        const sourceIndex = liveSpectrum.length
          ? Math.min(liveSpectrum.length - 1, Math.floor(norm * liveSpectrum.length))
          : -1;
        const band = sourceIndex >= 0 ? Math.max(0, Math.min(1, liveSpectrum[sourceIndex] || 0)) : 0.08;
        amp = Math.max(0.06, Math.min(0.85, band * 1.2));
      }
      const waveH = amp * 44;
      return { x: norm * 1000, upper: 50 - waveH, lower: 50 + waveH * 0.7 };
    });
  });

  const smoothPath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return "";
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 1; index < points.length; index++) {
      const previous = points[index - 1];
      const current = points[index];
      const midX = (previous.x + current.x) / 2;
      const midY = (previous.y + current.y) / 2;
      path += ` Q ${previous.x} ${previous.y} ${midX} ${midY}`;
    }
    const last = points[points.length - 1];
    return `${path} T ${last.x} ${last.y}`;
  };

  let upperWave = $derived(isWaveSeekbar && waveformSamples.length > 0 ? smoothPath(waveformSamples.map(({ x, upper }) => ({ x, y: upper }))) : "");
  let lowerWave = $derived(isWaveSeekbar && waveformSamples.length > 0 ? smoothPath(waveformSamples.map(({ x, lower }) => ({ x, y: lower })).reverse()) : "");
  let waveformPath = $derived(isWaveSeekbar && upperWave ? `${upperWave} L 1000 50 ${lowerWave.replace(/^M [^ ]+ [^ ]+/, "L 1000 50")} Z` : "");

  const handlePointerSeek = (clientX: number) => {
    if (isRadio || !scrubberRef || duration <= 0) return;
    const rect = scrubberRef.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    useMusicStore.getState().seek(pct * duration);
  };

  const handleMouseDownSeek = (e: MouseEvent) => {
    isDraggingSeek = true;
    handlePointerSeek(e.clientX);
  };

  $effect(() => {
    if (!isDraggingSeek) return;
    const onMove = (e: MouseEvent) => handlePointerSeek(e.clientX);
    const onUp = () => { isDraggingSeek = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  });

  const handleVolume = (e: Event) => {
    let val = parseFloat((e.target as HTMLInputElement).value);
    if (val > 0.97 && val < 1.03) {
      val = 1.0;
    }
    void useMusicStore.getState().setVolume(val);
  };

  let currentAudioEngine = $derived(
    AUDIO_ENGINES.find((e) => e.id === audioSettings?.resamplingQuality) ||
    (bitPerfectMode ? AUDIO_ENGINES[0] : AUDIO_ENGINES[AUDIO_ENGINES.length - 1])
  );

  let isEngineActive = $derived(currentAudioEngine.id !== "float32");
  let engineColor = $derived(currentAudioEngine.color);

  const handleCycleAudioEngine = () => {
    const currentId = audioSettings?.resamplingQuality || (bitPerfectMode ? "bit_perfect" : "float32");
    const currentIndex = AUDIO_ENGINES.findIndex((e) => e.id === currentId);
    const nextIndex = (currentIndex + 1) % AUDIO_ENGINES.length;
    const nextEngine = AUDIO_ENGINES[nextIndex];
    bitPerfectPulse = true;
    useMusicStore.getState().setAudioSettings({ resamplingQuality: nextEngine.id });
    setTimeout(() => { bitPerfectPulse = false; }, 600);
  };

  const handlePlayClick = () => {
    isPlayFlipping = false;
    requestAnimationFrame(() => { isPlayFlipping = true; });
    window.setTimeout(() => { isPlayFlipping = false; }, 700);
    void useMusicStore.getState().togglePlayPause();
  };

  const freqs = ["31", "62", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];

  let activePreset = $derived(
    SOUNDIX_PRESETS.find((p) =>
      p.gains.every((g, i) => Math.abs(g - (eqGains[i] ?? 0)) < 0.1)
    )?.name || "Personalizado"
  );
</script>

<footer
  style="height: {height}px; --player-side-width: {playerInfoWidth}px;"
  class="grid grid-cols-[var(--player-side-width)_minmax(0,1fr)_var(--player-side-width)] items-center gap-0 border-t border-slate-800/80 bg-slate-950/95 px-4 z-40 select-none shrink-0 relative overflow-hidden isolate"
>
  {#if playbackSettings?.diffusePlayerBar && currentCoverArt}
    <div
      class="pointer-events-none absolute inset-0 z-0 bg-cover bg-center scale-125"
      style="background-image: url({currentCoverArt}); filter: blur(36px) saturate(1.35); opacity: {(playbackSettings.diffusePlayerBarOpacity ?? 25) / 100};"
    ></div>
    <div class="pointer-events-none absolute inset-0 z-0 bg-slate-950/55"></div>
  {/if}

  {#if isEditing}
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Cambiar altura de la barra de reproducción"
      onpointerdown={(event) => {
        event.preventDefault();
        heightResizeStart = { y: event.clientY, height };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onpointermove={(event) => {
        if (heightResizeStart) {
          onHeightChange(heightResizeStart.height + heightResizeStart.y - event.clientY);
        }
      }}
      onpointerup={(event) => {
        if (heightResizeStart) {
          onHeightChange(heightResizeStart.height + heightResizeStart.y - event.clientY, true);
        }
        heightResizeStart = null;
      }}
      onpointercancel={() => { heightResizeStart = null; }}
      class="absolute left-0 right-0 top-[-5px] z-50 h-2 cursor-row-resize touch-none group/player-resize"
      title="Arrastrar para cambiar la altura de la barra de reproducción"
    >
      <span class="absolute left-1/2 top-1/2 h-px w-16 -translate-x-1/2 -translate-y-1/2 bg-slate-600/70 group-hover/player-resize:bg-cyan-400 group-hover/player-resize:shadow-[0_0_8px_var(--app-accent)]"></span>
    </div>
  {/if}

  {#if height > 72}
    <!-- Left block: Cover, Track Info & Format -->
    <div class="relative z-10 flex h-full w-full min-w-0 items-center gap-3 overflow-hidden">
      <div
        class="w-14 h-14 rounded-lg bg-slate-900 border border-slate-800 shadow-md flex items-center justify-center shrink-0 overflow-hidden relative"
        style={appearance.neonGlow ? `border-color: ${accentColor}44;` : undefined}
      >
        {#if currentCoverArt}
          <img src={currentCoverArt} alt="Cover" class="w-full h-full object-cover" />
        {:else}
          <div class="flex flex-col items-center justify-center text-slate-500">
            <span class="font-mono text-[9px] font-bold" style="color: {accentColor};">
              {format}
            </span>
          </div>
        {/if}
      </div>

      <div class="overflow-hidden flex-1">
        <div class="overflow-hidden whitespace-nowrap relative cursor-default">
          <div class="font-bold text-xs text-white truncate">
            {title}
          </div>
        </div>
        <div class="text-[11px] text-slate-400 truncate mt-0.5">
          {artist}
        </div>

        <div class="mt-1 flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap font-mono text-[9px]">
          <span class="shrink-0 font-bold" style="color: {formatColor};" title={normalizedFormat}>{normalizedFormat}</span>
          {#if bitrate > 0}<span class="text-slate-400">{bitrate} kbps</span>{/if}
          {#if sampleRate > 0}<span class="text-slate-400">{sampleRate >= 1000 ? `${(sampleRate / 1000).toFixed(1)} kHz` : `${sampleRate} Hz`}</span>{/if}
        </div>
      </div>

      {#if isEditing}
        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Cambiar ancho de la información de la pista"
          aria-valuemin={204}
          aria-valuemax={maxPlayerInfoWidth}
          aria-valuenow={playerInfoWidth}
          onpointerdown={(event) => {
            event.preventDefault();
            resizeStart = { x: event.clientX, width: playerInfoWidth };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onpointermove={(event) => {
            if (!resizeStart) return;
            const delta = event.clientX - resizeStart.x;
            playerInfoWidthPreview = Math.max(204, Math.min(maxPlayerInfoWidth, resizeStart.width + delta));
          }}
          onpointerup={() => {
            if (playerInfoWidthPreview !== null) useMusicStore.getState().setPlaybackSettings({ playerInfoWidth: playerInfoWidthPreview });
            playerInfoWidthPreview = null;
            resizeStart = null;
          }}
          onpointercancel={() => {
            playerInfoWidthPreview = null;
            resizeStart = null;
          }}
          class="absolute right-0 top-1/2 z-50 h-10 w-2 -translate-y-1/2 cursor-col-resize touch-none rounded hover:bg-cyan-400/20"
          title="Arrastrar para cambiar el ancho de la información"
        >
          <span class="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-cyan-400/50"></span>
        </div>
      {/if}
    </div>

    <!-- Center block: Controls & Symmetrical Adaptive Seekbar -->
    {#if !isTallerWaveform}
      <!-- Classic 6 seekbar styles (unchanged) -->
      <div class="relative z-10 flex h-full w-full min-w-0 -translate-y-[6px] flex-col items-center justify-center gap-[6px]">
        <div class="flex shrink-0 items-center gap-2">
          <button
            onclick={() => useMusicStore.getState().toggleShuffle()}
            class="p-1.5 transition-colors {transportStyle.secondary}"
            style="color: {shuffle ? accentColor : '#94a3b8'};"
            aria-label={lang === "ca" ? `Aleatori: ${shuffle ? "Activat" : "Desactivat"}` : lang === "en" ? `Shuffle: ${shuffle ? "On" : "Off"}` : `Aleatorio: ${shuffle ? "Activado" : "Desactivado"}`}
          >
            <Shuffle size={14} />
          </button>

          <button
            onclick={() => void useMusicStore.getState().previousTrack()}
            class="p-1.5 text-slate-300 transition-colors cursor-pointer {transportStyle.secondary}"
            aria-label={t("previous", lang)}
          >
            <SkipBack size={16} />
          </button>

          <button
            onclick={handlePlayClick}
            class="flex h-10 w-10 items-center justify-center text-slate-950 hover:scale-105 active:scale-95 transition-all font-bold cursor-pointer {transportStyle.primary}"
            style="background-color: {accentColor}; box-shadow: {appearance.neonGlow ? `0 0 15px ${accentColor}66` : '0 4px 12px rgba(0,0,0,0.4)'}; animation: {isPlaying && appearance.playButtonBpmPulseEnabled ? `bpm-play-button ${beatPeriod}s ease-in-out infinite` : 'none'};"
            aria-label={isPlaying ? t("pause", lang) : t("play", lang)}
          >
            {#if isPlaying}
              <Pause size={18} fill="currentColor" class={isPlayFlipping && appearance.playButtonClickEffect !== "none" ? `animate-play-button-${appearance.playButtonClickEffect || "pulse"}` : ""} />
            {:else}
              <Play size={18} fill="currentColor" class="ml-0.5 {isPlayFlipping && appearance.playButtonClickEffect !== 'none' ? `animate-play-button-${appearance.playButtonClickEffect || 'pulse'}` : ''}" />
            {/if}
          </button>

          <button
            onclick={() => void useMusicStore.getState().nextTrack()}
            class="p-1.5 text-slate-300 transition-colors cursor-pointer {transportStyle.secondary}"
            aria-label={t("next", lang)}
          >
            <SkipForward size={16} />
          </button>

          <button
            onclick={() => useMusicStore.getState().cycleRepeat()}
            class="p-1.5 transition-colors {transportStyle.secondary}"
            style="color: {repeat !== 'off' ? accentColor : '#94a3b8'};"
            aria-label={lang === "ca" ? `Repetir: ${repeat}` : lang === "en" ? `Repeat: ${repeat}` : `Repetir: ${repeat}`}
          >
            {#if repeat === "one"}
              <Repeat1 size={14} />
            {:else}
              <Repeat size={14} />
            {/if}
          </button>
        </div>

        <div bind:this={seekbarAreaRef} class="relative flex h-7 w-full min-w-0 items-center justify-center">
          <div
            class="relative flex h-full shrink-0 items-center justify-center"
            style="width: {playerBarWidth}%; flex: 0 0 {playerBarWidth}%;"
          >
            {#if isEditing}
              <!-- svelte-ignore a11y_interactive_supports_focus -->
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Cambiar ancho de la barra de reproducción"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={playerBarWidth}
                onpointerdown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  resizeStart = { x: event.clientX, width: playerBarWidth };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onpointermove={(event) => {
                  if (!resizeStart) return;
                  const delta = ((event.clientX - resizeStart.x) / Math.max(1, seekbarAreaWidth)) * 100;
                  playerBarWidthPreview = Math.max(0, Math.min(100, resizeStart.width + delta));
                }}
                onpointerup={() => {
                  if (playerBarWidthPreview !== null) useMusicStore.getState().setPlaybackSettings({ playerBarWidth: playerBarWidthPreview });
                  playerBarWidthPreview = null;
                  resizeStart = null;
                }}
                onpointercancel={() => {
                  playerBarWidthPreview = null;
                  resizeStart = null;
                }}
                class="absolute right-0 top-1/2 z-50 h-8 w-3 -translate-y-1/2 cursor-col-resize touch-none rounded hover:bg-cyan-400/30"
                title="Arrastrar horizontalmente para cambiar el ancho de la barra"
              >
                <span class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-cyan-400/50"></span>
              </div>
            {/if}

            {#if showSeekbar}
              <div class="flex w-full min-w-0 items-center gap-2 font-mono text-[10px] text-slate-400">
                {#if isRadio}
                  <span class="w-[52px] shrink-0" aria-hidden="true"></span>
                {:else}
                  <span class="w-10 shrink-0 text-right">{formatTime(currentTime)}</span>
                {/if}

                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  bind:this={scrubberRef}
                  onmousedown={handleMouseDownSeek}
                  onmousemove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    scrubberHoverX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
                  }}
                  onmouseleave={() => {
                    scrubberHoverX = null;
                  }}
                  class="flex-1 h-7 bg-slate-900/90 hover:bg-slate-900 border border-slate-800 rounded-lg px-2 flex items-center justify-between gap-[2px] cursor-pointer select-none relative overflow-hidden group shadow-inner transition-colors"
                  aria-label="Barra de reproducción; haz clic o arrastra para desplazarte"
                >
                  {#if scrubberHoverX !== null}
                    <div
                      class="pointer-events-none absolute top-0 bottom-0 w-px bg-white/70 shadow-[0_0_6px_#fff] z-30"
                      style="left: {scrubberHoverX}px;"
                    ></div>
                  {/if}

                  {#if seekbarStyle === "spectrum"}
                    {#each songPeaks as p, i (i)}
                      {@const isPassed = i <= activeBarIdx}
                      {@const heightPct = Math.max(18, Math.floor(p * 90))}
                      <div
                        class="flex-1 rounded-full"
                        style="height: {heightPct}%; background-color: {isPassed ? accentColor : 'rgba(255, 255, 255, 0.14)'}; box-shadow: {isPassed ? `0 0 5px ${accentColor}60` : 'none'};"
                      ></div>
                    {/each}
                  {:else if seekbarStyle === "classic"}
                    <div class="w-full h-full flex items-center relative">
                      <div class="w-full h-2 bg-slate-800 rounded-full relative overflow-hidden">
                        <div
                          class="h-full rounded-full transition-all duration-100"
                          style="width: {progress * 100}%; background-color: {accentColor}; box-shadow: 0 0 8px {accentColor}aa;"
                        ></div>
                      </div>
                    </div>
                  {:else if seekbarStyle === "hybrid"}
                    <div class="w-full h-full relative pointer-events-none">
                      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" class="absolute inset-0 h-full w-full">
                        <defs>
                          <clipPath id="seek-wave-progress">
                            <rect x="0" y="0" width={progress * 1000} height="100" />
                          </clipPath>
                        </defs>
                        <path d={waveformPath} fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
                        <path d={waveformPath} fill="{accentColor}28" stroke={accentColor} stroke-width="1.5" vector-effect="non-scaling-stroke" clip-path="url(#seek-wave-progress)" />
                        <line x1="0" y1="50" x2="1000" y2="50" stroke="rgba(255,255,255,0.18)" stroke-width="1" vector-effect="non-scaling-stroke" />
                      </svg>
                    </div>
                  {:else if seekbarStyle === "aurora"}
                    <div class="pointer-events-none absolute inset-0 overflow-hidden">
                      <div class="absolute inset-0 opacity-35" style="background: linear-gradient(90deg, {accentColor}55, #38bdf855 50%, #f472b655);"></div>
                      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" class="absolute inset-0 h-full w-full">
                        <defs>
                          <clipPath id="seek-aurora-progress"><rect x="0" y="0" width={progress * 1000} height="100" /></clipPath>
                          <linearGradient id="seek-aurora-fill" x1="0" x2="1">
                            <stop offset="0" stop-color={accentColor} />
                            <stop offset="0.55" stop-color="#38bdf8" />
                            <stop offset="1" stop-color="#f472b6" />
                          </linearGradient>
                        </defs>
                        <path d={waveformPath} fill="url(#seek-aurora-fill)" fill-opacity="0.18" stroke="rgba(226,232,240,0.35)" stroke-width="1" vector-effect="non-scaling-stroke" />
                        <path d={waveformPath} fill="url(#seek-aurora-fill)" fill-opacity="0.42" stroke="url(#seek-aurora-fill)" stroke-width="2" vector-effect="non-scaling-stroke" clip-path="url(#seek-aurora-progress)" />
                      </svg>
                      <div class="absolute inset-y-0 w-px shadow-[0_0_8px_2px_rgba(255,255,255,0.7)]" style="left: {progress * 100}%; background-color: white;"></div>
                    </div>
                  {:else if seekbarStyle === "segments"}
                    <div class="flex h-full w-full items-center gap-[2px] px-0.5 pointer-events-none">
                      {#each songPeaks.slice(0, 48) as peak, index}
                        {@const passed = index / 48 <= progress}
                        {@const barHeight = `${Math.max(22, peak * 100)}%`}
                        <span class="min-w-0 flex-1 rounded-[1px]" style="height: {barHeight}; background-color: {passed ? accentColor : 'rgba(148,163,184,0.23)'}; {passed ? `box-shadow: 0 0 5px ${accentColor}66;` : ''}"></span>
                      {/each}
                    </div>
                  {:else if seekbarStyle === "ribbon"}
                    <div class="pointer-events-none absolute inset-0 overflow-hidden">
                      <div class="absolute inset-0 opacity-60" style="background: repeating-linear-gradient(135deg, {accentColor}22 0px, {accentColor}22 3px, transparent 3px, transparent 7px);"></div>
                      <div class="absolute inset-y-0 left-0 overflow-hidden" style="width: {progress * 100}%;">
                        <div class="absolute inset-0" style="width: {progress > 0 ? 100 / progress : 100}%; background: linear-gradient(180deg, {accentColor}cc, {accentColor}55); box-shadow: 0 0 16px {accentColor}88;"></div>
                        <div class="absolute inset-0 opacity-70" style="background: repeating-linear-gradient(135deg, rgba(255,255,255,0.72) 0px, rgba(255,255,255,0.72) 2px, transparent 2px, transparent 7px);"></div>
                      </div>
                      <div class="absolute inset-y-0 w-[2px] bg-white shadow-[0_0_10px_2px_white]" style="left: {progress * 100}%;"></div>
                    </div>
                  {/if}
                </div>

                {#if isRadio}
                  <span class="w-10 shrink-0" aria-hidden="true"></span>
                {:else}
                  <span class="w-10 text-left shrink-0">{formatTime(duration)}</span>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </div>
    {:else}
      <!-- DYNAMIC DOUBLE-HEIGHT WAVEFORM SEEKBAR BEHIND PLAY BUTTON -->
      <div class="relative z-10 flex h-full w-full min-w-0 items-center justify-center">
        <div bind:this={seekbarAreaRef} class="relative flex h-14 w-full min-w-0 items-center justify-center transition-[height] duration-200">
          <div
            class="relative flex h-full shrink-0 items-center justify-center"
            style="width: {playerBarWidth}%; flex: 0 0 {playerBarWidth}%;"
          >
            {#if isEditing}
              <!-- svelte-ignore a11y_interactive_supports_focus -->
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Cambiar ancho de la barra de reproducción"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={playerBarWidth}
                onpointerdown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  resizeStart = { x: event.clientX, width: playerBarWidth };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onpointermove={(event) => {
                  if (!resizeStart) return;
                  const delta = ((event.clientX - resizeStart.x) / Math.max(1, seekbarAreaWidth)) * 100;
                  playerBarWidthPreview = Math.max(0, Math.min(100, resizeStart.width + delta));
                }}
                onpointerup={() => {
                  if (playerBarWidthPreview !== null) useMusicStore.getState().setPlaybackSettings({ playerBarWidth: playerBarWidthPreview });
                  playerBarWidthPreview = null;
                  resizeStart = null;
                }}
                onpointercancel={() => {
                  playerBarWidthPreview = null;
                  resizeStart = null;
                }}
                class="absolute right-0 top-1/2 z-50 h-8 w-3 -translate-y-1/2 cursor-col-resize touch-none rounded hover:bg-cyan-400/30"
                title="Arrastrar horizontalmente para cambiar el ancho de la barra"
              >
                <span class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-cyan-400/50"></span>
              </div>
            {/if}

            {#if showSeekbar}
              <div class="flex w-full h-full min-w-0 items-center gap-2 font-mono text-[10px] text-slate-400 relative">
                {#if isRadio}
                  <span class="w-[52px] shrink-0" aria-hidden="true"></span>
                {:else}
                  <span class="w-10 shrink-0 text-right z-30">{formatTime(currentTime)}</span>
                {/if}

                <!-- Scrubber Container: h-14 with waveform in background and buttons in foreground -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  bind:this={scrubberRef}
                  onmousedown={handleMouseDownSeek}
                  onmousemove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    scrubberHoverX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
                  }}
                  onmouseleave={() => {
                    scrubberHoverX = null;
                  }}
                  class="flex-1 h-14 bg-slate-900/90 hover:bg-slate-900/95 border border-slate-800 rounded-xl px-2 flex items-center justify-between cursor-pointer select-none relative overflow-hidden group shadow-inner transition-colors"
                  aria-label="Barra de reproducción; haz clic o arrastra para desplazarte"
                >
                  <!-- LAYER 1: WAVEFORM IN THE BACKGROUND BEHIND PLAY BUTTON (z-0 / z-10) -->
                  {#if seekbarStyle === "waveform_bars"}
                    <div class="flex h-full w-full items-center gap-[1.5px] px-1 pointer-events-none opacity-85">
                      {#each songPeaks as p, i (i)}
                        {@const isPassed = i <= activeBarIdx}
                        {@const heightPct = Math.max(12, Math.floor(p * 94))}
                        <div
                          class="flex-1 rounded-[1px] transition-[height] duration-75"
                          style="height: {heightPct}%; background-color: {isPassed ? accentColor : 'rgba(255, 255, 255, 0.16)'}; {isPassed ? `box-shadow: 0 0 6px ${accentColor}80;` : ''}"
                        ></div>
                      {/each}
                    </div>
                  {:else if seekbarStyle === "waveform_envelope"}
                    <div class="pointer-events-none absolute inset-0 overflow-hidden opacity-90">
                      <div class="absolute inset-0 opacity-25" style="background: radial-gradient(ellipse at center, {accentColor}55 0%, transparent 80%);"></div>
                      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" class="absolute inset-0 h-full w-full">
                        <defs>
                          <clipPath id="seek-envelope-progress">
                            <rect x="0" y="0" width={progress * 1000} height="100" />
                          </clipPath>
                          <linearGradient id="seek-envelope-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color={accentColor} stop-opacity="0.85" />
                            <stop offset="50%" stop-color={accentColor} stop-opacity="0.2" />
                            <stop offset="100%" stop-color={accentColor} stop-opacity="0.85" />
                          </linearGradient>
                        </defs>
                        <path d={waveformPath} fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.3)" stroke-width="1.2" vector-effect="non-scaling-stroke" />
                        <path d={waveformPath} fill="url(#seek-envelope-fill)" stroke={accentColor} stroke-width="2" vector-effect="non-scaling-stroke" clip-path="url(#seek-envelope-progress)" filter="drop-shadow(0 0 4px {accentColor})" />
                        <line x1="0" y1="50" x2="1000" y2="50" stroke="{accentColor}44" stroke-width="1" vector-effect="non-scaling-stroke" />
                      </svg>
                      <div class="absolute inset-y-0 w-[2px] bg-white shadow-[0_0_10px_2px_white]" style="left: {progress * 100}%;"></div>
                    </div>
                  {:else if seekbarStyle === "waveform_matrix"}
                    <div class="flex h-full w-full items-center justify-between gap-[2px] px-1 pointer-events-none py-1 opacity-85">
                      {#each songPeaks.slice(0, 72) as peak, colIdx}
                        {@const isPassed = (colIdx / 72) <= progress}
                        {@const litCells = Math.max(1, Math.round(peak * 8))}
                        <div class="flex flex-col-reverse justify-between flex-1 h-full gap-[1.5px]">
                          {#each Array.from({ length: 8 }) as _, rowIdx}
                            {@const isLit = rowIdx < litCells}
                            {@const cellColor = rowIdx >= 7 ? '#ef4444' : rowIdx >= 5 ? '#f59e0b' : accentColor}
                            <span
                              class="w-full rounded-[0.5px]"
                              style="height: 10%; background-color: {isLit ? (isPassed ? cellColor : `${cellColor}40`) : 'rgba(255,255,255,0.04)'}; {isLit && isPassed ? `box-shadow: 0 0 3px ${cellColor};` : ''}"
                            ></span>
                          {/each}
                        </div>
                      {/each}
                    </div>
                  {/if}

                  <!-- LAYER 2: PLAY BUTTONS SITTING IN FRONT OF WAVEFORM (z-20) -->
                  <div class="absolute inset-0 flex items-center justify-center gap-2 pointer-events-none z-20">
                    <button
                      onclick={(e) => { e.stopPropagation(); useMusicStore.getState().toggleShuffle(); }}
                      class="pointer-events-auto p-1.5 rounded-full bg-slate-950/75 backdrop-blur-sm border border-slate-700/60 hover:bg-slate-900 transition-colors cursor-pointer"
                      style="color: {shuffle ? accentColor : '#94a3b8'};"
                      aria-label={lang === "ca" ? `Aleatori: ${shuffle ? "Activat" : "Desactivat"}` : lang === "en" ? `Shuffle: ${shuffle ? "On" : "Off"}` : `Aleatorio: ${shuffle ? "Activado" : "Desactivado"}`}
                    >
                      <Shuffle size={13} />
                    </button>

                    <button
                      onclick={(e) => { e.stopPropagation(); void useMusicStore.getState().previousTrack(); }}
                      class="pointer-events-auto p-1.5 rounded-full bg-slate-950/75 backdrop-blur-sm border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-900 transition-colors cursor-pointer"
                      aria-label={t("previous", lang)}
                    >
                      <SkipBack size={15} />
                    </button>

                    <button
                      onclick={(e) => { e.stopPropagation(); handlePlayClick(); }}
                      class="pointer-events-auto flex h-10 w-10 items-center justify-center text-slate-950 hover:scale-105 active:scale-95 transition-all font-bold cursor-pointer rounded-full shadow-xl"
                      style="background-color: {accentColor}; box-shadow: {appearance.neonGlow ? `0 0 16px ${accentColor}88` : '0 4px 14px rgba(0,0,0,0.6)'}; animation: {isPlaying && appearance.playButtonBpmPulseEnabled ? `bpm-play-button ${beatPeriod}s ease-in-out infinite` : 'none'};"
                      aria-label={isPlaying ? t("pause", lang) : t("play", lang)}
                    >
                      {#if isPlaying}
                        <Pause size={18} fill="currentColor" class={isPlayFlipping && appearance.playButtonClickEffect !== "none" ? `animate-play-button-${appearance.playButtonClickEffect || "pulse"}` : ""} />
                      {:else}
                        <Play size={18} fill="currentColor" class="ml-0.5 {isPlayFlipping && appearance.playButtonClickEffect !== 'none' ? `animate-play-button-${appearance.playButtonClickEffect || 'pulse'}` : ''}" />
                      {/if}
                    </button>

                    <button
                      onclick={(e) => { e.stopPropagation(); void useMusicStore.getState().nextTrack(); }}
                      class="pointer-events-auto p-1.5 rounded-full bg-slate-950/75 backdrop-blur-sm border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-900 transition-colors cursor-pointer"
                      aria-label={t("next", lang)}
                    >
                      <SkipForward size={15} />
                    </button>

                    <button
                      onclick={(e) => { e.stopPropagation(); useMusicStore.getState().cycleRepeat(); }}
                      class="pointer-events-auto p-1.5 rounded-full bg-slate-950/75 backdrop-blur-sm border border-slate-700/60 hover:bg-slate-900 transition-colors cursor-pointer"
                      style="color: {repeat !== 'off' ? accentColor : '#94a3b8'};"
                      aria-label={lang === "ca" ? `Repetir: ${repeat}` : lang === "en" ? `Repeat: ${repeat}` : `Repetir: ${repeat}`}
                    >
                      {#if repeat === "one"}
                        <Repeat1 size={13} />
                      {:else}
                        <Repeat size={13} />
                      {/if}
                    </button>
                  </div>

                  <!-- LAYER 3: Hover Needle (perceptible por debajo como la clasica) -->
                  {#if scrubberHoverX !== null}
                    <div
                      class="pointer-events-none absolute bottom-0 h-6 w-px bg-white/90 shadow-[0_0_8px_#fff] z-30"
                      style="left: {scrubberHoverX}px;"
                    ></div>
                  {/if}
                </div>

                {#if isRadio}
                  <span class="w-10 shrink-0" aria-hidden="true"></span>
                {:else}
                  <span class="w-10 text-left shrink-0 z-30">{formatTime(duration)}</span>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <!-- Right block: Upper Row (EQ +, NORM, STEREO/MONO, Speaker Device) | Lower Row (Volume Slider) -->
    <div class="relative z-10 flex h-full w-full min-w-0 flex-col items-stretch justify-center gap-1.5">
      <div class="ml-auto flex w-[204px] max-w-full items-center justify-end gap-2">
        <div class="flex items-center gap-2">
          <!-- EQ + Button -->
          <div class="relative">
            <div class="flex h-8 w-14 items-center rounded-lg bg-slate-900 border overflow-hidden transition {isEqActive ? 'border-cyan-400 shadow-[0_0_9px_var(--app-accent)]' : 'border-slate-800'}">
              <button
                onclick={() => useMusicStore.getState().setAudioSettings({ isEqEnabled: !isEqActive })}
                class="h-full w-8 shrink-0 font-mono text-[10px] font-bold transition cursor-pointer"
                style="color: {isEqActive ? accentColor : '#94a3b8'}; {isEqActive && appearance.neonGlow ? `box-shadow: 0 0 10px ${accentColor}33;` : ''}"
                title="Activar / Desactivar EQ"
              >
                EQ
              </button>
              <button
                onclick={() => {
                  isEqPopupOpen = !isEqPopupOpen;
                  isDeviceMenuOpen = false;
                }}
                class="h-full w-6 shrink-0 text-slate-400 hover:text-white hover:bg-slate-800 border-l border-slate-800 text-xs font-bold cursor-pointer"
                title="Abrir ecualizador emergente"
              >
                +
              </button>
            </div>

            {#if isEqPopupOpen}
              <div class="absolute bottom-12 right-0 w-96 p-3.5 rounded-xl bg-slate-950 border border-slate-700 shadow-2xl z-50 animate-fadeIn font-mono text-xs">
                <div class="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
                  <div class="flex items-center gap-2">
                    <Sliders size={13} style="color: {accentColor};" />
                    <span class="font-bold text-slate-100 uppercase tracking-wide">Audio EQ</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <select
                      value={activePreset}
                      onchange={(e) => {
                        const val = (e.target as HTMLSelectElement).value;
                        const preset = SOUNDIX_PRESETS.find((p) => p.name === val);
                        if (preset) {
                          useMusicStore.getState().setAudioSettings({ eqGains: [...preset.gains], isEqEnabled: true });
                          if (preset.sub !== undefined || preset.bass !== undefined) {
                            useMusicStore.getState().setAudioSettings({
                              eqSubBoost: preset.sub ?? audioSettings.eqSubBoost,
                              eqBassBoost: preset.bass ?? audioSettings.eqBassBoost,
                            });
                          }
                        }
                      }}
                      class="bg-slate-900 border border-slate-700 text-slate-200 rounded px-1.5 py-0.5 text-[10px] focus:outline-none cursor-pointer"
                    >
                      {#if activePreset === "Personalizado"}
                        <option value="Personalizado">Personalizado</option>
                      {/if}
                      {#each SOUNDIX_PRESETS as preset}
                        <option value={preset.name}>{preset.name}</option>
                      {/each}
                    </select>

                    <button
                      onclick={() => { isEqPopupOpen = false; }}
                      class="text-slate-400 hover:text-white text-xs px-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div class="flex justify-between items-center gap-1 h-28 py-1">
                  {#each freqs as freq, idx}
                    {@const gain = eqGains[idx] || 0}
                    {@const pct = Math.max(0, Math.min(100, ((gain + 12) / 24) * 100))}
                    {@const alphaIntensity = Math.max(0.25, pct / 100)}

                    <div class="flex-1 flex flex-col items-center justify-between h-full">
                      <span class="text-[8px] text-slate-400 font-mono">
                        {gain > 0 ? `+${gain.toFixed(0)}` : gain.toFixed(0)}
                      </span>
                      <div class="relative h-16 w-4 flex items-center justify-center py-0.5">
                        <input
                          type="range"
                          min="-12"
                          max="12"
                          step="0.5"
                          value={gain}
                          oninput={(e) => {
                            const next = [...eqGains];
                            next[idx] = parseFloat((e.target as HTMLInputElement).value);
                            useMusicStore.getState().setAudioSettings({ eqGains: next, isEqEnabled: true });
                          }}
                          class="eq-pocket-vertical-fill z-10 h-16 cursor-pointer"
                          style="background: {pct > 0 ? `linear-gradient(to top, ${accentColor}25 0%, ${accentColor}85 ${pct * 0.7}%, ${accentColor} ${pct}%, rgba(15, 23, 42, 0.95) ${pct}%, rgba(15, 23, 42, 0.95) 100%)` : `linear-gradient(to top, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)`}; box-shadow: {pct > 0 ? `inset 0 1px 3px rgba(0,0,0,0.85), 0 0 ${Math.round(4 + alphaIntensity * 8)}px ${accentColor}45` : `inset 0 1px 3px rgba(0,0,0,0.85)`};"
                          title="{freq}: {gain > 0 ? '+' : ''}{gain} dB"
                        />
                      </div>
                      <span class="text-[8px] text-slate-400 font-bold font-mono">{freq}</span>
                    </div>
                  {/each}
                </div>

                <div class="pt-2 mt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                  <div class="flex items-center gap-1.5">
                    <button
                      onclick={() => useMusicStore.getState().setAudioSettings({ isXdssEnabled: !isXdssActive })}
                      class="px-2 py-0.5 rounded font-bold border transition cursor-pointer flex items-center gap-1 {isXdssActive ? 'border-amber-500 bg-amber-950/60 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.3)]' : 'border-slate-800 text-slate-400 hover:text-slate-200'}"
                      title="LG XDSS Plus: Realce dinámico extremo de graves y pegada punch"
                    >
                      <Flame size={10} />
                      XDSS Plus
                    </button>
                    <button
                      onclick={() => useMusicStore.getState().setAudioSettings({ isXtsProEnabled: !isXtsProActive })}
                      class="px-2 py-0.5 rounded font-bold border transition cursor-pointer flex items-center gap-1"
                      style="border-color: {isXtsProActive ? accentColor : '#334155'}; color: {isXtsProActive ? accentColor : '#94a3b8'}; background-color: {isXtsProActive ? `${accentColor}15` : 'transparent'};"
                      title="LG XTS Pro: Excelente balance de frecuencias altas y expansión acústica"
                    >
                      <Layers size={10} />
                      XTS Pro
                    </button>
                    <button
                      onclick={() => useMusicStore.getState().setAudioSettings({ isEqEnabled: !isEqActive })}
                      class="px-2 py-0.5 rounded font-bold border transition cursor-pointer flex items-center gap-1"
                      style={isEqActive ? `border-color: ${accentColor}80; color: ${accentColor}; background-color: ${accentColor}25; box-shadow: 0 0 8px ${accentColor}35;` : "border-color: #334155; color: #94a3b8; background-color: transparent;"}
                      title="Activar/Desactivar Ecualizador"
                    >
                      <Zap size={10} />
                      {isEqActive ? "EQ ON" : "EQ OFF"}
                    </button>
                  </div>

                  <button
                    onclick={() => useMusicStore.getState().setAudioSettings({ eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] })}
                    class="text-slate-400 hover:text-white underline text-[9px] cursor-pointer"
                  >
                    Reset 0dB
                  </button>
                </div>
              </div>
            {/if}
          </div>

          <!-- Normalization Button -->
          <button
            onclick={() => useMusicStore.getState().setAudioSettings({ isNormalizerEnabled: !isNormActive })}
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition cursor-pointer {isNormActive ? 'border-emerald-500 bg-emerald-950/60 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'}"
            title="Normalizador & Limitador de Loudness"
            aria-label={`Normalización ${isNormActive ? "activa" : "inactiva"}`}
          >
            <AudioWaveform size={15} />
          </button>

          <button
            onclick={handleCycleAudioEngine}
            class="h-8 w-8 rounded-lg border flex items-center justify-center shrink-0 transition-all cursor-pointer {isEngineActive ? '' : 'border-slate-800 bg-slate-900/80 text-slate-500 hover:text-slate-300'} {bitPerfectPulse ? 'scale-105 ring-2' : ''}"
            style={isEngineActive ? `border-color: ${engineColor}88; background-color: ${engineColor}1c; color: ${engineColor}; box-shadow: 0 0 12px ${engineColor}40;` : undefined}
            title={`Motor de audio: ${currentAudioEngine.name} [${currentAudioEngine.badge}] · ${currentAudioEngine.description} (clic para alternar)`}
            aria-label={`Motor de audio: ${currentAudioEngine.name}`}
          >
            <Sparkles size={15} />
          </button>

          <span
            class="flex h-7 w-7 items-center justify-center rounded bg-slate-900"
            style="color: {accentColor}; {appearance.neonGlow ? `box-shadow: 0 0 10px ${accentColor}22;` : ''}"
            title={isMono ? "Mono · 1 canal" : "Estéreo · 2 canales"}
            aria-label={isMono ? "Mono, un canal" : "Estéreo, dos canales"}
          >
            {#if isMono}
              <CircleDot size={15} />
            {:else}
              <AudioLines size={15} />
            {/if}
          </span>

          <!-- Speaker Device Icon -->
          <div class="relative shrink-0">
            <button
              onclick={() => {
                isDeviceMenuOpen = !isDeviceMenuOpen;
                isEqPopupOpen = false;
              }}
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition cursor-pointer"
              title={`Dispositivo de salida: ${selectedDevice}`}
            >
              <Speaker size={15} style="color: {accentColor};" />
            </button>

            {#if isDeviceMenuOpen}
              <div class="absolute bottom-10 right-0 w-64 p-2 rounded-xl bg-slate-950 border border-slate-700 shadow-2xl z-50 font-mono text-xs animate-fadeIn">
                <div class="p-2 text-[10px] uppercase text-slate-400 border-b border-slate-800 font-bold">
                  Dispositivos de Salida
                </div>
                <div class="max-h-48 overflow-y-auto py-1 space-y-1">
                  {#each availableDevices as dev}
                    <button
                      onclick={() => {
                        void useMusicStore.getState().setOutputDevice(dev);
                        isDeviceMenuOpen = false;
                      }}
                      class="w-full text-left px-2.5 py-1.5 rounded text-[11px] truncate transition cursor-pointer"
                      style="background-color: {selectedDevice === dev ? `${accentColor}20` : 'transparent'}; color: {selectedDevice === dev ? accentColor : '#cbd5e1'}; border-color: {selectedDevice === dev ? accentColor : 'transparent'};"
                    >
                      {dev}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Lower Row: Volume Slider with Percentage -->
      <div class="ml-auto grid w-[204px] max-w-full grid-cols-[1.5rem_minmax(0,1fr)_2rem] items-center gap-1">
        <button
          onclick={() => void useMusicStore.getState().setVolume(volume > 0 ? 0 : 1)}
          class="flex h-8 w-6 -translate-x-[3px] items-center justify-start text-slate-400 hover:text-white transition-colors cursor-pointer"
          title={volume === 0 ? t("unmuteAudio", lang) : t("muteAudio", lang)}
          aria-label={volume === 0 ? t("unmuteAudio", lang) : t("muteAudio", lang)}
        >
          {#if volume === 0}
            <VolumeX size={15} />
          {:else}
            <Volume2 size={15} />
          {/if}
        </button>

        <input
          type="range"
          min={0}
          max={maxVolumeLimit}
          step={0.01}
          value={volume}
          oninput={handleVolume}
          class="volume-slider h-1.5 w-full appearance-none rounded-full cursor-pointer"
          style="--volume-color: {isBoosted ? '#ef4444' : accentColor}; background: {volPct > 0 ? `linear-gradient(to right, ${volColor}35 0%, ${volColor}90 ${volPct * 0.7}%, ${volColor} ${volPct}%, rgba(71, 85, 105, 0.65) ${volPct}%, rgba(71, 85, 105, 0.65) 100%)` : `linear-gradient(to right, rgba(71, 85, 105, 0.65) 0%, rgba(71, 85, 105, 0.65) 100%)`};"
          aria-label={`${t("volume", lang)} ${volumePercentage}%`}
        />

        <span
          class="w-8 text-right text-[10px] font-mono font-bold transition-colors {isBoosted ? 'text-rose-500 font-extrabold animate-pulse' : ''}"
          style="color: {isBoosted ? '#ef4444' : accentColor};"
        >
          {volumePercentage}%
        </span>
      </div>
    </div>
  {/if}
</footer>
