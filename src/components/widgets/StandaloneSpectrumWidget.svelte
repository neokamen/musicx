<script lang="ts">
  import SpectrumVisualizer from "./SpectrumVisualizer.svelte";

  interface Props {
    nodeKey?: string;
    isEditing?: boolean;
  }

  let { nodeKey = undefined, isEditing = false }: Props = $props();
</script>

<div class="flex flex-col h-full w-full bg-audiophile-surface select-none font-sans overflow-hidden text-xs">
  <div class="flex-1 min-h-0 w-full relative overflow-hidden">
    <SpectrumVisualizer {nodeKey} {isEditing} />
  </div>
</div>
