
interface AudioSliderProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
}

export default function AudioSlider({
  value,
  onChange,
  label,
  min = 0,
  max = 100,
  step = 1
}: AudioSliderProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-slate-400">{label}</label>
      <div className="relative w-full h-1 rounded bg-slate-700">
        <div
          className="absolute h-1 rounded bg-cyan-400"
          style={{ width: `${((value - min) / (max - min)) * 100}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}