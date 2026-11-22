import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { InfoIcon } from '../icons/InfoIcon'
import { usePanelHoldsEnter } from '../../utils/enterKey'
import { BoardBackdrop } from './BoardBackdrop'
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

/** An ⓘ that explains the setting beside it on hover or focus, and until the next press when clicked or tapped. */
export function InfoTip({ label, text }: { label: string; text: string }) {
  const id = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ placement: CSSProperties; pinned: boolean } | null>(null)
  const isOpen = tip !== null
  usePanelHoldsEnter(!!tip?.pinned)

  const show = (pinned: boolean) => {
    const button = buttonRef.current
    if (!button) return
    const placement = placeBeside(button.getBoundingClientRect())
    setTip((open) => ({ placement, pinned: pinned || !!open?.pinned }))
  }
  const hide = () => setTip(null)

  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || backdropRef.current?.contains(target)) return
      hide()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide()
    }
    const follow = () => show(false)
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
        onClick={() => (tip?.pinned ? hide() : show(true))}
        onFocus={() => show(false)}
        // Pressing the backdrop blurs the button to nothing. The backdrop closes the tip on the click that follows.
        onBlur={(event) => {
          if (!tip?.pinned || event.relatedTarget) hide()
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') show(false)
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse' && !tip?.pinned && document.activeElement !== buttonRef.current) hide()
        }}
        className="icon-target"
      >
        <InfoIcon size="md" className="h-3.5 w-3.5" />
      </button>
      {/* Only a pinned tip covers the felt: over a hovered one, the cover would end the hover */}
      {tip?.pinned && <BoardBackdrop ref={backdropRef} onTap={hide} />}
      {/* Out of the setup screens' scroll and zoom, which would clip and misplace it */}
      {tip &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            style={tip.placement}
            className={`pointer-events-none fixed z-[60] p-2 text-left text-[11px] leading-4 text-[var(--ivory)] min-[1920px]:text-sm ${POPOVER_CHROME}`}
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  )
}
