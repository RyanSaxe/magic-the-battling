import { useEffect, useId, useRef, useState, type FormEventHandler, type ReactNode } from 'react'
import { SurfaceCard } from './SurfaceCard'
import { DIALOG_BACKDROP, DIALOG_CLOSE_BUTTON } from './styles'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A dialog over a dimmed page: a walnut card with a title and a ✕ that closes it. Clicking the
 * dimmed page or pressing Escape closes it too. When the dialog is taller than the screen, as on a landscape phone,
 * its body scrolls under the title so ✕ stays in reach. Pass onSubmit to make the card a form.
 *
 * Opening it moves keyboard focus to its first control, and closing it returns focus to whatever
 * had it before, usually the button that opened it.
 */
export function Dialog({
  title,
  onClose,
  onSubmit,
  children,
}: {
  title: string
  onClose: () => void
  onSubmit?: FormEventHandler<HTMLFormElement>
  children: ReactNode
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  // Read during the first render, before an autoFocus field inside takes focus.
  const [opener] = useState(() => document.activeElement)

  useEffect(() => {
    if (!dialogRef.current?.contains(document.activeElement)) {
      const firstControl = bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? closeRef.current
      firstControl?.focus()
    }
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [opener])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
      // Handled, so a panel open under the dialog doesn't close with it.
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const cardProps = {
    role: 'dialog',
    'aria-modal': true,
    'aria-labelledby': titleId,
    className: 'relative flex flex-col max-h-full',
  }
  const content = (
    <>
      <div className="flex shrink-0 items-center justify-between mb-4 pb-3 border-b border-black/40">
        <h2 id={titleId} className="text-white font-semibold">{title}</h2>
        <button ref={closeRef} type="button" onClick={onClose} className={DIALOG_CLOSE_BUTTON} aria-label={`Close ${title}`}>
          ✕
        </button>
      </div>
      {/* The padding, undone by the margin, keeps focus rings inside the scrolling area. */}
      <div ref={bodyRef} className="min-h-0 overflow-y-auto -m-1 p-1">{children}</div>
    </>
  )
  return (
    <div ref={dialogRef} className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className={`absolute inset-0 ${DIALOG_BACKDROP}`} onClick={onClose} />
      {onSubmit ? (
        <SurfaceCard as="form" onSubmit={onSubmit} {...cardProps}>
          {content}
        </SurfaceCard>
      ) : (
        <SurfaceCard {...cardProps}>{content}</SurfaceCard>
      )}
    </div>
  )
}
