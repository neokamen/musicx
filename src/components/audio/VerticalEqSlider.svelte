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

  let clampedValue = $derived(Math.max(min, Math.min(max, value)));
  let pct = $derived(max > min ? Math.max(0, Math.min(1, (clampedValue - min) / (max - min))) : 0.5);

  // Position from top: 0% is at max (+12 dB), 100% is at min (-12 dB)
  let topPercent = $derived((1 - pct) * 100);

  function updateFromPointer(clientY: number) {
    if (!trackRef || disabled) return;
    const rect = trackRef.getBoundingClientRect();
    if (rect.height <= 0) return;
    const relY = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const normalized = 1 - relY / rect.height; // 0 at bottom, 1 at top
    let raw = min + normalized * (max - min);
    if (step > 0) {
      raw = Math.round(raw / step) * step;
    }
    raw = Math.max(min, Math.min(max, Math.round(raw * 10) / 10));
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
    onchange?.(0);
  }

  function handleWheel(e: WheelEvent) {
    if (disabled) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? step : -step;
    let next = Math.max(min, Math.min(max, Math.round((clampedValue + delta) * 10) / 10));
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
      onchange?.(max);
      return;
    } else if (e.key === "End") {
      e.preventDefault();
      onchange?.(min);
      return;
    }
    if (delta !== 0) {
      e.preventDefault();
      let next = Math.max(min, Math.min(max, Math.round((clampedValue + delta) * 10) / 10));
      onchange?.(next);
    }
  }

  let heightStyle = $derived(typeof height === "number" ? `${height}px` : height);
  let isBoost = $derived(clampedValue > 0.05);
  let isCut = $derived(clampedValue < -0.05);
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
  class="relative flex items-center justify-center cursor-pointer select-none touch-none group w-6 {disabled ? 'opacity-40 pointer-events-none' : ''}"
  style:height={heightStyle}
>
  <!-- Hardware recessed slot -->
  <div
    class="relative w-2 h-full rounded-full bg-slate-950 border border-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.95)] overflow-hidden transition-colors {isDragging ? 'border-slate-700' : 'group-hover:border-slate-700'}"
  >
    <!-- Center 0 dB guide line -->
    <div
      class="absolute top-1/2 left-0 right-0 h-[1.5px] bg-slate-600/80 -translate-y-1/2 z-0 pointer-events-none"
    ></div>

    <!-- Reactive LED boost fill (from center 50% upwards) -->
    {#if isBoost}
      {@const boostHeight = (clampedValue / (max || 12)) * 50}
      <div
        class="absolute bottom-1/2 left-0 right-0 pointer-events-none transition-[height] duration-75"
        style:height="{boostHeight}%"
        style:background="linear-gradient(to top, {accentColor}35 0%, {accentColor} 100%)"
        style:box-shadow="0 0 6px {accentColor}80"
      ></div>
    {/if}

    <!-- Reactive LED cut fill (from center 50% downwards) -->
    {#if isCut}
      {@const cutHeight = (Math.abs(clampedValue) / (Math.abs(min) || 12)) * 50}
      <div
        class="absolute top-1/2 left-0 right-0 pointer-events-none transition-[height] duration-75"
        style:height="{cutHeight}%"
        style:background="linear-gradient(to bottom, rgba(244,63,94,0.3) 0%, rgba(244,63,94,0.85) 100%)"
        style:box-shadow="0 0 6px rgba(244,63,94,0.6)"
      ></div>
    {/if}
  </div>

  <!-- Perfectly centered white fader thumb handle -->
  <div
    class="absolute pointer-events-none transition-[top,transform,box-shadow] duration-75 ease-out"
    style:top="{topPercent}%"
    style:left="50%"
    style:transform="translate(-50%, -50%) {isDragging ? 'scale(1.18)' : 'scale(1)'}"
  >
    <div
      class="w-4 h-1.5 rounded-[2px] bg-white border border-white/90 shadow-[0_1px_4px_rgba(0,0,0,0.9)] transition-shadow"
      style:box-shadow={isDragging
        ? `0 0 10px ${accentColor}, 0 0 18px ${accentColor}, 0 1px 4px rgba(0,0,0,0.9)`
        : `0 0 6px ${accentColor}aa, 0 1px 3px rgba(0,0,0,0.9)`}
    ></div>
  </div>
</div>
