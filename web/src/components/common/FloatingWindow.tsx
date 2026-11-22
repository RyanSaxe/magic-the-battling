import { useEffect, useEffectEvent, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react'
import { Tag } from './Tag'

type ControlIcon = 'minimize' | 'restore' | 'reset' | 'close'

const ICON_PATHS: Record<ControlIcon, string> = {
  minimize: 'M3.5 7h7',
  restore: 'M3.5 3.5h7v7h-7z',
  reset: 'M3.6 5.2A3.8 3.8 0 1 1 3.2 7.6M3.4 2.6v2.8h2.8',
  close: 'M3.5 3.5l7 7M10.5 3.5l-7 7',
}

// The length of .floating-window's fade in index.css. Close waits for it on a timer rather than a transitionend,
// which never fires when the fade doesn't run.
const CLOSE_FADE_MS = 160

// Each area spans the title bar's height and half of each 6px gap, so neighbouring controls' areas meet without overlapping.
const CONTROL_TOUCH_AREA = 'touch-area [--touch-area-w:30px] [--touch-area-h:38px]'

function WindowControl({ icon, label, title, onClick }: { icon: ControlIcon; label: string; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
      // The title bar drags the window, so a press on a control mustn't start a drag.
      onPointerDown={(event) => event.stopPropagation()}
      className={`btn btn-secondary floating-window-control ${CONTROL_TOUCH_AREA}`}
    >
      <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
        <path d={ICON_PATHS[icon]} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </button>
  )
}

function DragGrip() {
  return (
    <svg viewBox="0 0 6 10" width="6" height="10" aria-hidden="true" className="floating-window-grip">
      {[1, 5, 9].flatMap((y) => [1, 5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1" />))}
    </svg>
  )
}

interface FloatingWindowProps {
  /** The window's name in its controls' labels, such as "guide" in "Close guide". */
  name: string
  title: string
  /** A short tag after the title, such as Update. */
  badge?: string
  collapsed: boolean
  /** What a minimized window shows under its title bar: a caption, such as "Current section", over a line of text. */
  collapsedCaption: string
  collapsedText: string
  /** Whether the title bar drags the window, and whether a drag is under way. */
  draggable: boolean
  dragging: boolean
  onDragStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  onMinimize: () => void
  onRestore: () => void
  /** Puts the window back at its default place and size. */
  onReset?: () => void
  onClose: () => void
  /** Labels a second Close under the content, such as Dismiss. */
  closeLabel?: string
  /** While the window is dragged or resized it follows the pointer at once instead of easing. */
  instant: boolean
  style: CSSProperties
  ref?: Ref<HTMLDivElement>
  children: ReactNode
}

/**
 * The shell of a window that floats over the game, such as the Quick Guide and the server notice: a walnut window with
 * a title bar that drags it, and Minimize, Reset and Close controls. It fades and scales in as it opens, and out
 * before Close calls `onClose`.
 */
export function FloatingWindow({
  name,
  title,
  badge,
  collapsed,
  collapsedCaption,
  collapsedText,
  draggable,
  dragging,
  onDragStart,
  onMinimize,
  onRestore,
  onReset,
  onClose,
  closeLabel,
  instant,
  style,
  ref,
  children,
}: FloatingWindowProps) {
  const [closing, setClosing] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [openSize, setOpenSize] = useState<{ width: number; height: number }>()

  const minimize = () => {
    const content = contentRef.current
    if (content) setOpenSize({ width: content.offsetWidth, height: content.offsetHeight })
    onMinimize()
  }

  const closeOnceFaded = useEffectEvent(() => onClose())

  useEffect(() => {
    if (!closing) return
    const timer = window.setTimeout(() => closeOnceFaded(), CLOSE_FADE_MS)
    return () => window.clearTimeout(timer)
  }, [closing])

  return (
    <div
      ref={ref}
      className={`floating-window modal-chrome${instant ? ' floating-window--instant' : ''}${closing ? ' floating-window--closing' : ''}`}
      style={style}
    >
      <div
        className={`floating-window-bar ${draggable ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
        onPointerDown={onDragStart}
        style={{ touchAction: draggable ? 'none' : undefined }}
      >
        {draggable && <DragGrip />}
        <span className="floating-window-title">{title}</span>
        {badge && <Tag tone="gold" small>{badge}</Tag>}
        <div className="ml-auto flex items-center gap-1.5">
          {collapsed ? (
            <WindowControl icon="restore" label={`Open ${name}`} title="Open" onClick={onRestore} />
          ) : (
            <WindowControl icon="minimize" label={`Minimize ${name}`} title="Minimize" onClick={minimize} />
          )}
          {onReset && !collapsed && (
            <WindowControl icon="reset" label={`Reset ${name} window`} title="Reset" onClick={onReset} />
          )}
          <WindowControl icon="close" label={`Close ${name}`} title="Close" onClick={() => setClosing(true)} />
        </div>
      </div>
      {collapsed && (
        <div className="flex flex-1 min-h-0 flex-col justify-center px-4 pb-3 pt-2">
          <span className="text-[0.58rem] uppercase tracking-[0.18em] text-[var(--ivory-muted)]">{collapsedCaption}</span>
          <span className="mt-1 text-sm font-medium leading-snug text-[var(--ivory)] break-words">{collapsedText}</span>
        </div>
      )}
      {/* Minimized, the content stays laid out at its open size, so it opens again at the same section and scroll. */}
      <div
        ref={contentRef}
        inert={collapsed}
        className={`flex min-h-0 flex-col ${collapsed ? 'absolute top-0 left-0 w-full opacity-0 pointer-events-none' : 'flex-1'}`}
        style={collapsed ? openSize : undefined}
      >
        {children}
        {closeLabel && (
          <div className="floating-window-footer">
            <button type="button" className="btn btn-secondary text-xs" onClick={() => setClosing(true)}>
              {closeLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
