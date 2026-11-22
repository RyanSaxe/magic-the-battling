import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useHotkeys } from '../../hooks/useHotkeys'
import { BoardBackdrop } from '../common/BoardBackdrop'
import { POPOVER_CHROME } from '../common/styles'
import { SECTION_TITLE_TYPE } from './typography'

/** One button that says what a list is showing, and opens the choices that narrow it. */
export function FilterMenu({ shown, children }: { shown: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  // The felt can't scroll under the backdrop, so a panel that opens past its edge has to be brought into view.
  useLayoutEffect(() => {
    if (open) panelRef.current?.scrollIntoView({ block: 'nearest' })
  }, [open])

  useEffect(() => {
    if (!open) return
    const closeOnPressOutside = (e: PointerEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || backdropRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnPressOutside)
    return () => document.removeEventListener('pointerdown', closeOnPressOutside)
  }, [open])

  useHotkeys(
    {
      escape: () => {
        setOpen(false)
        buttonRef.current?.focus()
      },
    },
    open,
  )

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={`Filter: ${shown}`}
        aria-expanded={open}
        className="btn btn-secondary flex h-8 items-center gap-2 !px-3 !py-0 text-xs font-medium whitespace-nowrap"
      >
        {shown}
        <svg viewBox="0 0 10 6" className="h-1.5 w-2.5 shrink-0" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && <BoardBackdrop ref={backdropRef} onTap={() => setOpen(false)} />}
      {open && (
        <div
          ref={panelRef}
          className={`absolute right-0 top-full z-50 mt-1.5 flex w-[266px] scroll-mb-2 flex-col gap-3 p-3 ${POPOVER_CHROME}`}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** A named choice inside a FilterMenu. */
export function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className={`${SECTION_TITLE_TYPE} mb-1.5 text-[var(--ivory-muted)]`}>{title}</div>
      {children}
    </div>
  )
}
