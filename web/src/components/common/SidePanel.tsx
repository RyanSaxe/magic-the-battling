import { useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { SidePanelHostContext } from './sidePanelHost'

/** Placed inside the felt, it marks the box between the gold edges where side panels open. */
export function SidePanelFrame({ ref }: { ref: (element: HTMLDivElement | null) => void }) {
  return <div ref={ref} className="side-panel-frame" />
}

export const SIDE_PANEL_HEADER_HEIGHT = 40

interface SidePanelProps {
  open: boolean
  title: string
  count?: number
  onClose: () => void
  headerActions?: ReactNode
  children: ReactNode
}

/**
 * The one panel that opens over the board: inside the felt's gold edge and between the top and bottom bars, so the
 * bars and their buttons always show. From 1120px wide it covers the docked sidebar's column, from 640px the same
 * column over the board, and on phones the whole board. It slides in from the right, and × or Escape closes it.
 *
 * It stays mounted while it slides out, and drops its content once it has gone.
 */
export function SidePanel({ open, title, count, onClose, headerActions, children }: SidePanelProps) {
  const host = useContext(SidePanelHostContext)
  const [present, setPresent] = useState(open)
  if (open && !present) setPresent(true)

  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Escape closes a card preview opened from the panel before the panel itself.
      if (document.querySelector("[data-card-preview-modal='true']")) return
      onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!present || !host) return null
  return createPortal(
    <section
      className={`side-panel frame-chrome${open ? ' side-panel--open' : ''}`}
      aria-label={title}
      inert={!open}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && !open) setPresent(false)
      }}
    >
      <div className="side-panel-header" style={{ height: SIDE_PANEL_HEADER_HEIGHT }}>
        <h2 className="side-panel-title">
          {title}
          {count !== undefined && <span className="side-panel-count">{count}</span>}
        </h2>
        <div className="flex items-center gap-2">
          {headerActions}
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary side-panel-close"
            aria-label={`Close ${title}`}
          >
            <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <div className="side-panel-body">{children}</div>
    </section>,
    host,
  )
}
