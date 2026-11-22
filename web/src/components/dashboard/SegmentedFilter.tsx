import type { ReactNode } from 'react'
import { SECTION_TITLE_TYPE } from './typography'

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
}

const OPTION_LOOK = {
  filter: 'px-3 py-1 text-xs font-medium',
  heading: `px-3 py-1 ${SECTION_TITLE_TYPE}`,
  field: '',
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
  /**
   * - heading: labels in the section title style, for a switch that stands in for section headers.
   * - field: as tall as a form's fields and as wide as its row.
   */
  variant?: 'filter' | 'heading' | 'field'
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`segmented-track ${variant === 'field' ? 'segmented-field' : ''} ${className ?? ''}`}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={`segmented-option flex-1 whitespace-nowrap transition-colors ${OPTION_LOOK[variant]}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
