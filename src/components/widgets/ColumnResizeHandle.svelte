<script lang="ts">
  interface Props {
    onResize: (deltaPixels: number) => void;
  }

  let { onResize }: Props = $props();
  let lastX = $state<number | null>(null);

  function handlePointerDown(event: PointerEvent & { currentTarget: HTMLElement }) {
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

<button
  type="button"
  tabindex="-1"
  aria-label="Ajustar ancho de columna"
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerUp}
  onclick={(event) => event.stopPropagation()}
  class="column-resize-handle absolute right-0 top-1 bottom-1 z-10 w-1 cursor-col-resize touch-none border-0 bg-transparent p-0"
  title="Arrastrar para cambiar el ancho de las columnas"
></button>
