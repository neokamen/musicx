<script lang="ts">
  interface Props {
    value: number;
    label: string;
    min?: number;
    max?: number;
    step?: number;
    onChange?: (value: number) => void;
  }

  let {
    value = $bindable(0),
    label,
    min = 0,
    max = 100,
    step = 1,
    onChange
  }: Props = $props();

  let percent = $derived(max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0);

  function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
    const val = Number(e.currentTarget.value);
    value = val;
    onChange?.(val);
  }
</script>

<div class="flex flex-col gap-2">
  <span class="text-xs text-slate-400">{label}</span>
  <div class="relative w-full h-1 rounded bg-slate-700">
    <div
      class="absolute h-1 rounded bg-cyan-400"
      style:width="{percent}%"
    ></div>
    <input
      type="range"
      {min}
      {max}
      {step}
      {value}
      oninput={handleInput}
      class="absolute inset-0 w-full opacity-0 cursor-pointer"
    />
  </div>
</div>
