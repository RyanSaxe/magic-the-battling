import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface MoreMenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

/** The part of the screen a scrolling ancestor shows, or the window when nothing scrolls. */
function visibleArea(element: HTMLElement): { top: number; bottom: number } {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (['auto', 'scroll', 'hidden'].includes(getComputedStyle(node).overflowY)) return node.getBoundingClientRect()
  }
  return { top: 0, bottom: window.innerHeight }
}

/** A ⋯ button that opens a short list of a card's less common actions. */
export function MoreMenu({ label, items }: { label: string; items: MoreMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // A card near the bottom of the felt would open its menu past the felt's edge, behind the bottom bar.
  useLayoutEffect(() => {
    const menu = menuRef.current
    const button = ref.current
    if (!open || !menu || !button) return
    const visible = visibleArea(button)
    const below = menu.getBoundingClientRect()
    const roomAbove = button.getBoundingClientRect().top - visible.top
    if (below.bottom > visible.bottom && below.height <= roomAbove) {
      menu.style.top = 'auto'
      menu.style.bottom = '100%'
      menu.style.marginTop = '0'
      menu.style.marginBottom = '0.25rem'
    }
  }, [open])

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
          ref={menuRef}
          role="menu"
          className="absolute right-0 top-full mt-1 z-50 modal-chrome border gold-border rounded-lg shadow-2xl py-1 min-w-[140px]"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors disabled:opacity-50 ${
                item.danger ? 'text-red-400 hover:text-red-300' : 'text-amber-100/85'
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
