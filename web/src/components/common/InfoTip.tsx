import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { InfoIcon } from '../icons/InfoIcon'
import { POPOVER_CHROME } from './styles'

const TIP_WIDTH = 256
const SCREEN_EDGE = 8
const ROOM_NEEDED_ABOVE = 104

function placeBeside(anchor: DOMRect): CSSProperties {
  const width = Math.min(TIP_WIDTH, window.innerWidth - 2 * SCREEN_EDGE)
  const left = Math.min(Math.max(anchor.right - width, SCREEN_EDGE), window.innerWidth - SCREEN_EDGE - width)
  return anchor.top >= ROOM_NEEDED_ABOVE
    ? { left, width, bottom: window.innerHeight - anchor.top }
    : { left, width, top: anchor.bottom }
}

/** An ⓘ that explains the setting beside it on hover, focus or tap. */
export function InfoTip({ label, text }: { label: string; text: string }) {
  const id = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [placement, setPlacement] = useState<CSSProperties | null>(null)
  const isOpen = placement !== null

  const show = () => {
    if (buttonRef.current) setPlacement(placeBeside(buttonRef.current.getBoundingClientRect()))
  }
  const hide = () => setPlacement(null)

  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!buttonRef.current?.contains(event.target as Node)) hide()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide()
    }
    const follow = () => show()
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', follow)
    window.addEventListener('scroll', follow, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', follow)
      window.removeEventListener('scroll', follow, true)
    }
  }, [isOpen])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={isOpen}
        aria-describedby={isOpen ? id : undefined}
        onClick={show}
        onFocus={show}
        onBlur={hide}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') show()
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse' && document.activeElement !== buttonRef.current) hide()
        }}
        className="icon-target"
      >
        <InfoIcon size="md" />
      </button>
      {/* Out of the setup screens' scroll and zoom, which would clip and misplace it */}
      {placement &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            style={placement}
            className={`pointer-events-none fixed z-[60] p-2 text-left text-[11px] leading-4 text-[var(--ivory)] min-[1920px]:text-sm ${POPOVER_CHROME}`}
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  )
}
