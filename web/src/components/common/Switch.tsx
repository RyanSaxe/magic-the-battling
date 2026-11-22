import type { ReactNode } from 'react'

/** An on/off setting with its label, green when on. The whole label is the 44px target. */
export function Switch({
  checked,
  onChange,
  disabled = false,
  spread = false,
  children,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  /** The label at the row's left edge and the switch at its right, for a list of settings. */
  spread?: boolean
  children: ReactNode
}) {
  return (
    <label className={`switch ${spread ? 'switch-spread' : ''}`}>
      <span>{children}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      <span aria-hidden="true" className="switch-track" />
    </label>
  )
}
