export interface SegmentOption<T extends string> {
  value: T
  label: string
}

/** Buttons for one choice among a few, each always visible, such as All, Saved and Following. */
export function SegmentedFilter<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex rounded-full border border-[color:rgba(212,175,55,0.25)] bg-black/15 p-1 ${className ?? ''}`}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
            option.value === value
              ? 'border border-[var(--gold-border)] bg-amber-950/35 text-amber-100 shadow-[inset_0_1px_0_rgba(255,236,181,0.16)]'
              : 'border border-transparent bg-black/10 text-gray-400 hover:text-gray-200'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
