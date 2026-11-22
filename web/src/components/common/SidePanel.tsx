import { useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BoardBackdrop } from './BoardBackdrop'
import { SidePanelHostContext } from './sidePanelHost'

/** Placed over the board and its sidebar, it marks the box between their gold edges where side panels open. */
export function SidePanelFrame({ ref }: { ref: (element: HTMLDivElement | null) => void }) {
  return <div ref={ref} className="side-panel-frame" />
}

export const SIDE_PANEL_HEADER_HEIGHT = 40

interface SidePanelProps {
  open: boolean
  title: string
  /** A quiet word before the title, such as "Scouting" before a player's name, which then shows in gold. */
  prefix?: string
  count?: number
  onClose: () => void
  headerActions?: ReactNode
  /** Slides out of view while it stays open, so a card dragged out of it can be dropped on the board it covers. */
  steppedAside?: boolean
  /** A tap on the board outside the panel closes it, and does nothing else. */
  closeOnBoardTap?: boolean
  /**
   * `column` covers the sidebar's column, or the whole board on phones. `beside` opens over the board next to the
   * sidebar's column, so the player list there stays in view, and slides out from under it.
   */
  placement?: 'column' | 'beside'
  guideTarget?: string
  children: ReactNode
}

/**
 * The one panel that opens over the board: inside its gold edge, under any banner and between the bars, so the
 * bars and their buttons always show. From 1120px wide it covers the docked sidebar's column, from 640px the same
 * column over the board, and on phones the whole board. It slides in from the right, and × or Escape closes it.
 *
 * It stays mounted while it slides out, and drops its content once it has gone.
 */
export function SidePanel({
  open,
  title,
  prefix,
  count,
  onClose,
  headerActions,
  steppedAside = false,
  closeOnBoardTap = false,
  placement = 'column',
  guideTarget,
  children,
}: SidePanelProps) {
  const host = useContext(SidePanelHostContext)
  const panelRef = useRef<HTMLElement>(null)
  const [present, setPresent] = useState(open)
  if (open && !present) setPresent(true)

  // A panel closed before it was ever drawn has no slide to end, so it drops its content at once.
  useEffect(() => {
    if (open || !present) return
    const frame = requestAnimationFrame(() => {
      if (!panelRef.current?.getAnimations().length) setPresent(false)
    })
    return () => cancelAnimationFrame(frame)
  }, [open, present])

  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      // Escape first cancels typing in a field, and closes a dialog or card preview open over the panel.
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (document.querySelector("[aria-modal='true'], [data-card-preview-modal='true']")) return
      onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!present || !host) return null
  const label = prefix ? `${prefix} ${title}` : title
  const panel = (
    <section
      ref={panelRef}
      className={`side-panel frame-chrome${open ? ' side-panel--open' : ''}${steppedAside ? ' side-panel--aside' : ''}`}
      aria-label={label}
      inert={!open}
      data-guide-target={guideTarget}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && !open) setPresent(false)
      }}
    >
      <div className="side-panel-header" style={{ height: SIDE_PANEL_HEADER_HEIGHT }}>
        <h2 className="side-panel-title">
          {prefix && <span className="side-panel-prefix">{prefix}</span>}
          <span className={prefix ? 'side-panel-name' : undefined}>{title}</span>
          {count !== undefined && <span className="side-panel-count">{count}</span>}
        </h2>
        <div className="flex items-center gap-2">
          {headerActions}
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary side-panel-close"
            aria-label={`Close ${label}`}
          >
            <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <div className="side-panel-body">{children}</div>
    </section>
  )
  return (
    <>
      {open && closeOnBoardTap && <BoardBackdrop onTap={onClose} />}
      {createPortal(placement === 'beside' ? <div className="side-panel-beside">{panel}</div> : panel, host)}
    </>
  )
}
