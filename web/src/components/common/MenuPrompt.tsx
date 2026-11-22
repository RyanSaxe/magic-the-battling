import { useState } from 'react'
import { TEXT_INPUT } from './styles'

/** A menu's own field for a custom value. */
export function MenuPrompt({
  label,
  action,
  numeric = false,
  onSubmit,
  onCancel,
}: {
  label: string
  action: string
  numeric?: boolean
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  const trimmed = value.trim()
  const valid = numeric ? parseInt(trimmed, 10) > 0 : trimmed !== ''

  return (
    <form
      className="flex items-center gap-2 py-1 pl-[26px] pr-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSubmit(trimmed)
      }}
    >
      <input
        type="text"
        inputMode={numeric ? 'numeric' : undefined}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.preventDefault()
          e.stopPropagation()
          onCancel()
        }}
        aria-label={label}
        placeholder={label}
        className={`${TEXT_INPUT} min-w-0`}
        autoFocus
      />
      <button type="submit" disabled={!valid} className="btn btn-secondary h-[42px] shrink-0 disabled:opacity-50">
        {action}
      </button>
    </form>
  )
}
