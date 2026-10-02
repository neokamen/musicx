<script lang="ts">
  import { X } from "@lucide/svelte";
  import type { RadioStation } from "../../types/radio.ts";

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSave: (station: RadioStation) => void;
  }

  let { isOpen, onClose, onSave }: Props = $props();

  let name = $state("");
  let url = $state("");
  let error = $state("");

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    try {
      const parsedUrl = new URL(url.trim());
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") throw new Error();
      if (!name.trim()) {
        error = "Escribe el nombre de la emisora.";
        return;
      }
      onSave({
        stationuuid: `custom-${Date.now()}`,
        name: name.trim(),
        url: parsedUrl.toString(),
        url_resolved: parsedUrl.toString(),
        codec: parsedUrl.pathname.split(".").pop()?.toUpperCase(),
        isCustom: true,
      });
      name = "";
      url = "";
      error = "";
      onClose();
    } catch {
      error = "Introduce una URL de streaming http:// o https:// válida.";
    }
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4"
    role="presentation"
    onmousedown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}
  >
    <form
      onsubmit={handleSubmit}
      class="w-full max-w-md space-y-4 rounded-lg border border-audiophile-border bg-audiophile-surface p-4 shadow-2xl"
    >
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-bold text-audiophile-text">Añadir emisora</h3>
        <button
          type="button"
          onclick={onClose}
          class="rounded p-1 text-audiophile-muted hover:text-white"
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>
      </div>
      <label class="block space-y-1 text-xs text-audiophile-muted">
        <span>Nombre</span>
        <input
          bind:value={name}
          class="w-full rounded border border-audiophile-border bg-audiophile-base px-3 py-2 text-audiophile-text outline-none focus:border-audiophile-cyan"
          placeholder="Mi emisora"
        />
      </label>
      <label class="block space-y-1 text-xs text-audiophile-muted">
        <span>URL de streaming</span>
        <input
          bind:value={url}
          class="w-full rounded border border-audiophile-border bg-audiophile-base px-3 py-2 font-mono text-audiophile-text outline-none focus:border-audiophile-cyan"
          placeholder="https://servidor/emisora.mp3"
        />
      </label>
      {#if error}
        <p role="alert" class="text-xs text-rose-400">{error}</p>
      {/if}
      <div class="flex justify-end gap-2">
        <button
          type="button"
          onclick={onClose}
          class="rounded border border-audiophile-border px-3 py-2 text-xs text-audiophile-muted hover:text-white"
        >
          Cancelar
        </button>
        <button
          type="submit"
          class="rounded bg-audiophile-cyan px-3 py-2 text-xs font-bold text-audiophile-base"
        >
          Guardar
        </button>
      </div>
    </form>
  </div>
{/if}
