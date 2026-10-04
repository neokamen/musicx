<script lang="ts">
  interface Props {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    accentColor?: string;
    height?: number | string;
    disabled?: boolean;
    title?: string;
    ariaLabel?: string;
    onchange?: (val: number) => void;
  }

  let {
    value = 0,
    min = -12,
    max = 12,
    step = 0.5,
    accentColor = "#06b6d4",
    height = 130,
    disabled = false,
    title = "",
    ariaLabel = "Control de ganancia",
    onchange,
  }: Props = $props();

  let trackRef: HTMLDivElement | null = $state(null);
  let isDragging = $state(false);
  let localValue = $state(0);

  // Keep local value in sync when not actively dragging
  $effect(() => {
    if (!isDragging) {
      localValue = value;
    }
  });

  let activeValue = $derived(isDragging ? localValue : value);
  let clampedValue = $derived(Math.max(min, Math.min(max, activeValue)));
  let pct = $derived(max > min ? Math.max(0, Math.min(1, (clampedValue - min) / (max - min))) : 0.5);

  // Half-height of the fader thumb in pixels (travel limit so knob never clips or overflows)
  const PADDING_PX = 7;

  function updateFromPointer(clientY: number) {
    if (!trackRef || disabled) return;
    const rect = trackRef.getBoundingClientRect();
    if (rect.height <= 0) return;

    const usableHeight = Math.max(1, rect.height - PADDING_PX * 2);
    const clampedY = Math.max(PADDING_PX, Math.min(rect.height - PADDING_PX, clientY - rect.top));
    const normalized = 1 - (clampedY - PADDING_PX) / usableHeight; // 0 at bottom, 1 at top

    let raw = min + normalized * (max - min);
    if (step > 0) {
      raw = Math.round(raw / step) * step;
    }
    raw = Math.max(min, Math.min(max, Math.round(raw * 10) / 10));

    localValue = raw;
    onchange?.(raw);
  }

  function handlePointerDown(e: PointerEvent) {
    if (disabled || e.button !== 0) return;
    isDragging = true;
    trackRef?.setPointerCapture(e.pointerId);
    updateFromPointer(e.clientY);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDragging) return;
    updateFromPointer(e.clientY);
  }

  function handlePointerUp(e: PointerEvent) {
    if (!isDragging) return;
    isDragging = false;
    try {
      trackRef?.releasePointerCapture(e.pointerId);
    } catch (_) {}
  }

  function handleDoubleClick(e: MouseEvent) {
    if (disabled) return;
    e.stopPropagation();
    localValue = 0;
    onchange?.(0);
  }

  function handleWheel(e: WheelEvent) {
    if (disabled) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? step : -step;
    let next = Math.max(min, Math.min(max, Math.round((clampedValue + delta) * 10) / 10));
    localValue = next;
    onchange?.(next);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (disabled) return;
    let delta = 0;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") delta = step;
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") delta = -step;
    else if (e.key === "PageUp") delta = step * 4;
    else if (e.key === "PageDown") delta = -step * 4;
    else if (e.key === "Home") {
      e.preventDefault();
      localValue = max;
      onchange?.(max);
      return;
    } else if (e.key === "End") {
      e.preventDefault();
      localValue = min;
      onchange?.(min);
      return;
    }
    if (delta !== 0) {
      e.preventDefault();
      let next = Math.max(min, Math.min(max, Math.round((clampedValue + delta) * 10) / 10));
      localValue = next;
      onchange?.(next);
    }
  }

  let heightStyle = $derived(typeof height === "number" ? `${height}px` : height);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  bind:this={trackRef}
  role="slider"
  tabindex={disabled ? -1 : 0}
  aria-valuenow={clampedValue}
  aria-valuemin={min}
  aria-valuemax={max}
  aria-label={ariaLabel}
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerUp}
  ondblclick={handleDoubleClick}
  onwheel={handleWheel}
  onkeydown={handleKeyDown}
  {title}
  class="relative flex items-center justify-center cursor-pointer select-none touch-none group w-7 min-h-[50px] {disabled ? 'opacity-40 pointer-events-none' : ''}"
  style:height={heightStyle}
>
  <!-- Center 0 dB reference guide line extending slightly beyond the slot -->
  <div
    class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-[1.5px] bg-slate-500/80 pointer-events-none z-0"
  ></div>

  <!-- Hardware recessed slot -->
  <div
    class="relative w-2.5 h-full rounded-full bg-slate-950 border border-slate-700/80 shadow-[inset_0_2px_4px_rgba(0,0,0,0.95)] overflow-hidden transition-colors {isDragging ? 'border-cyan-400/80' : 'group-hover:border-slate-500'}"
  >
    <!-- Center 0 dB slot mark -->
    <div
      class="absolute top-1/2 left-0 right-0 h-[1.5px] bg-slate-600/90 -translate-y-1/2 z-0 pointer-events-none"
    ></div>

    <!-- Accent LED fill coming from the bottom up to the fader knob -->
    <div
      class="absolute bottom-0 left-0 right-0 pointer-events-none transition-[height] duration-75"
      style:height="calc({PADDING_PX}px + {pct} * (100% - {PADDING_PX * 2}px))"
      style:background="linear-gradient(to top, {accentColor}30 0%, {accentColor}85 65%, {accentColor} 100%)"
      style:box-shadow="0 0 8px {accentColor}80"
    ></div>
  </div>

  <!-- Audiophile Studio Fader Knob Handle -->
  <div
    class="absolute pointer-events-none transition-[top,transform,box-shadow] duration-75 ease-out z-10"
    style:top="calc({PADDING_PX}px + {(1 - pct)} * (100% - {PADDING_PX * 2}px))"
    style:left="50%"
    style:transform="translate(-50%, -50%) {isDragging ? 'scale(1.12)' : 'scale(1)'}"
  >
    <div
      class="w-6 h-3 rounded-[3px] bg-gradient-to-b from-slate-100 via-white to-slate-200 border border-slate-300 shadow-[0_2px_5px_rgba(0,0,0,0.85)] flex items-center justify-center relative overflow-hidden transition-all"
      style:box-shadow={isDragging
        ? `0 0 12px ${accentColor}, 0 0 20px ${accentColor}99, 0 3px 8px rgba(0,0,0,0.9)`
        : `0 0 6px ${accentColor}66, 0 2px 5px rgba(0,0,0,0.85)`}
    >
      <!-- Side tactile grip lines -->
      <div class="absolute left-1 top-0 bottom-0 w-[1px] bg-slate-300/80"></div>
      <div class="absolute right-1 top-0 bottom-0 w-[1px] bg-slate-300/80"></div>

      <!-- High-contrast Center Indicator Pip -->
      <div
        class="w-full h-[2px] transition-colors"
        style:background-color={clampedValue !== 0 ? accentColor : "#0f172a"}
        style:box-shadow={clampedValue !== 0 ? `0 0 5px ${accentColor}` : undefined}
      ></div>
    </div>
  </div>
</div>
