import { SECTION_TITLE_TYPE } from './typography'

export interface SegmentOption<T extends string> {
  value: T
  label: string
}

/** Buttons for one choice among a few, each always visible, such as All, Saved and Following. The chosen one is raised. */
export function SegmentedFilter<T extends string>({
  label,
  options,
  value,
  onChange,
  variant = 'filter',
  className,
}: {
  label: string
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  /** heading: labels in the section title style, for a switch that stands in for section headers. */
  variant?: 'filter' | 'heading'
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`segmented-track ${className ?? ''}`}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={`segmented-option flex-1 px-3 py-1 whitespace-nowrap transition-colors ${
            variant === 'heading' ? SECTION_TITLE_TYPE : 'text-xs font-medium'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
