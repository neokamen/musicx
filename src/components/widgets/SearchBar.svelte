<script lang="ts">
  import { Search } from "@lucide/svelte";

  interface Props {
    onSearch: (query: string) => void;
  }

  let { onSearch }: Props = $props();
  let query = $state("");

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    onSearch(query);
  }
</script>

<form
  onsubmit={handleSubmit}
  class="flex items-center gap-2 p-2 rounded-lg bg-slate-800 border border-slate-700"
>
  <Search class="w-4 h-4 text-slate-400" />
  <input
    type="text"
    bind:value={query}
    placeholder="Buscar música en Steam Music"
    class="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none"
  />
  <button
    type="submit"
    class="px-3 py-1 text-sm font-medium rounded-lg text-white bg-cyan-600 hover:bg-cyan-500 transition-colors"
  >
    Buscar
  </button>
</form>
