<script lang="ts">
  interface Props {
    onResize: (deltaPixels: number) => void;
  }

  let { onResize }: Props = $props();
  let lastX = $state<number | null>(null);

  function handlePointerDown(event: PointerEvent & { currentTarget: HTMLSpanElement }) {
    event.preventDefault();
    event.stopPropagation();
    lastX = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (lastX === null) return;
    const delta = event.clientX - lastX;
    lastX = event.clientX;
    onResize(delta);
  }

  function handlePointerUp() {
    lastX = null;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<span
  role="separator"
  aria-orientation="vertical"
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerUp}
  onclick={(event) => event.stopPropagation()}
  class="column-resize-handle absolute right-0 top-1 bottom-1 z-10 w-1 cursor-col-resize touch-none"
  title="Arrastrar para cambiar el ancho de las columnas"
></span>
