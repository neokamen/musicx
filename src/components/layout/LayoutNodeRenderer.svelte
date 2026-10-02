<script lang="ts">
  import type { LayoutNode, WidgetType } from "../../types/layout.ts";
  import { AVAILABLE_WIDGETS } from "../../types/layout.ts";
  import WidgetRenderer from "../widgets/WidgetRenderer.svelte";
  import LayoutNodeRenderer from "./LayoutNodeRenderer.svelte";
  import {
    Columns,
    Rows,
    Trash2,
    GripVertical,
    GripHorizontal,
  } from "@lucide/svelte";

  interface Props {
    node: LayoutNode;
    isEditing: boolean;
    onSplit: (targetId: string, direction: "horizontal" | "vertical") => void;
    onRemove: (targetId: string) => void;
    onChangeWidget: (targetId: string, widget: WidgetType) => void;
    onResize: (targetId: string, sizes: number[]) => void;
  }

  let {
    node,
    isEditing,
    onSplit,
    onRemove,
    onChangeWidget,
    onResize,
  }: Props = $props();

  let containerRef: HTMLDivElement | null = $state(null);
  let resizeState: {
    index: number;
    startPos: number;
    initialSizes: number[];
    totalPx: number;
  } | null = null;

  const handlePointerDown = (index: number, event: PointerEvent) => {
    if (!isEditing || !containerRef || node.type !== "split") return;
    event.preventDefault();
    event.stopPropagation();
    const isHoriz = node.direction === "horizontal";
    const rect = containerRef.getBoundingClientRect();
    const totalPx = isHoriz ? rect.width : rect.height;
    if (totalPx <= 0) return;

    const childCount = node.children.length;
    const initialSizes = node.children.map((_, i) => node.sizes[i] ?? (100 / childCount));

    resizeState = {
      index,
      startPos: isHoriz ? event.clientX : event.clientY,
      initialSizes: [...initialSizes],
      totalPx,
    };

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!resizeState || node.type !== "split") return;
    const isHoriz = node.direction === "horizontal";
    const currentPos = isHoriz ? event.clientX : event.clientY;
    const deltaPx = currentPos - resizeState.startPos;
    const deltaPct = (deltaPx / resizeState.totalPx) * 100;

    const { index, initialSizes } = resizeState;
    const minSize = 10;
    const maxDelta = initialSizes[index + 1] - minSize;
    const minDelta = minSize - initialSizes[index];
    const clampedDelta = Math.max(minDelta, Math.min(maxDelta, deltaPct));

    const nextSizes = [...initialSizes];
    nextSizes[index] = initialSizes[index] + clampedDelta;
    nextSizes[index + 1] = initialSizes[index + 1] - clampedDelta;

    onResize(node.id, nextSizes);
  };

  const handlePointerUp = (event: PointerEvent) => {
    if (!resizeState) return;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      // Ignore
    }
    resizeState = null;
  };
</script>

{#if node.type === "leaf"}
  <div class="relative w-full h-full flex flex-col bg-audiophile-surface border border-audiophile-border overflow-hidden">
    <!-- Barra de herramientas superior en Modo Edición -->
    {#if isEditing}
      <div class="relative z-30 shrink-0 bg-audiophile-base/95 border-b border-audiophile-cyan/40 px-2 py-1.5 flex items-center justify-between gap-2 shadow-lg backdrop-blur">
        <div class="flex items-center gap-1.5 overflow-hidden">
          <span class="w-2 h-2 rounded-full bg-audiophile-cyan animate-pulse"></span>
          <select
            value={node.widget}
            onchange={(e) => onChangeWidget(node.id, (e.target as HTMLSelectElement).value as WidgetType)}
            class="bg-audiophile-surface2 border border-audiophile-border rounded px-2 py-0.5 text-[11px] font-mono text-audiophile-text focus:outline-none focus:border-audiophile-cyan"
          >
            {#each AVAILABLE_WIDGETS as w (w.type)}
              <option value={w.type}>{w.label}</option>
            {/each}
          </select>
        </div>

        <div class="flex items-center gap-1">
          <button
            onclick={() => onSplit(node.id, "horizontal")}
            class="p-1 rounded bg-audiophile-surface2 hover:bg-audiophile-border text-audiophile-text transition-colors"
            title="Dividir en columnas (Horizontal)"
          >
            <Columns size={12} />
          </button>
          <button
            onclick={() => onSplit(node.id, "vertical")}
            class="p-1 rounded bg-audiophile-surface2 hover:bg-audiophile-border text-audiophile-text transition-colors"
            title="Dividir en filas (Vertical)"
          >
            <Rows size={12} />
          </button>
          <button
            onclick={() => onRemove(node.id)}
            class="p-1 rounded bg-red-950/40 hover:bg-red-900/60 text-red-400 transition-colors"
            title="Eliminar este panel"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    {/if}

    <!-- Contenido del widget -->
    <div class="min-h-0 w-full flex-1 {isEditing ? 'pt-8' : ''}">
      <WidgetRenderer widget={node.widget} nodeKey={node.id} {isEditing} />
    </div>
  </div>
{:else}
  <!-- Split Container -->
  <div
    bind:this={containerRef}
    class="w-full h-full flex {node.direction === 'horizontal' ? 'flex-row' : 'flex-col'} overflow-hidden"
  >
    {#each node.children as child, index (child.id)}
      {@const childSize = node.sizes[index] ?? (100 / node.children.length)}

      <div
        class="min-h-0 min-w-0 overflow-hidden"
        style="flex: {childSize} 1 0px;"
      >
        <LayoutNodeRenderer
          node={child}
          {isEditing}
          {onSplit}
          {onRemove}
          {onChangeWidget}
          {onResize}
        />
      </div>

      {#if index < node.children.length - 1}
        <!-- Separator -->
        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <div
          role="separator"
          onpointerdown={(e) => handlePointerDown(index, e)}
          onpointermove={handlePointerMove}
          onpointerup={handlePointerUp}
          onpointercancel={handlePointerUp}
          class="relative transition-colors flex items-center justify-center shrink-0 touch-none {node.direction === 'horizontal' ? 'w-1' : 'h-1'} {isEditing ? `bg-audiophile-cyan/55 ${node.direction === 'horizontal' ? 'cursor-col-resize' : 'cursor-row-resize'}` : 'bg-audiophile-border cursor-default'}"
          title={isEditing ? "Arrastrar para cambiar el tamaño del panel" : undefined}
        >
          {#if isEditing}
            <span class="pointer-events-none absolute flex h-4 w-2 items-center justify-center rounded-sm bg-audiophile-surface2/90 text-audiophile-muted/70 shadow-sm">
              {#if node.direction === "horizontal"}
                <GripVertical size={8} />
              {:else}
                <GripHorizontal size={8} />
              {/if}
            </span>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
{/if}
