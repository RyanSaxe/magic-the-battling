import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { POPOVER_CHROME } from '../common/styles'

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
        className="btn btn-secondary h-8 w-8 !p-0 flex items-center justify-center text-[var(--ivory-muted)]"
      >
        ⋯
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className={`absolute right-0 top-full mt-1 z-50 ${POPOVER_CHROME} py-1 min-w-[140px]`}
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
              className={`menu-item w-full text-left px-4 py-2 text-sm transition-colors disabled:opacity-50 ${
                item.danger ? 'menu-item-destructive' : 'text-[var(--ivory-soft)]'
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
