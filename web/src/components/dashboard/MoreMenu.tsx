import { useEffect, useRef, useState } from 'react'

export interface MoreMenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
}

/** A ⋯ button that opens a short list of a card's less common actions. */
export function MoreMenu({ label, items }: { label: string; items: MoreMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn btn-secondary h-8 w-8 !p-0 flex items-center justify-center text-amber-100/70"
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-50 modal-chrome border gold-border rounded-lg shadow-2xl py-1 min-w-[140px]"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className={`menu-item w-full text-left px-4 py-2 text-sm transition-colors ${
                item.danger ? 'menu-item-destructive' : 'text-amber-100/85'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
