import { useId, type FormEventHandler, type ReactNode } from 'react'
import { SurfaceCard } from './SurfaceCard'
import { DIALOG_BACKDROP, DIALOG_CLOSE_BUTTON } from './styles'

/**
 * A dialog over a dimmed page: a walnut card with a title and a ✕ that closes it. Clicking the
 * dimmed page closes it too. When the dialog is taller than the screen, as on a landscape phone,
 * its body scrolls under the title so ✕ stays in reach. Pass onSubmit to make the card a form.
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
        <button type="button" onClick={onClose} className={DIALOG_CLOSE_BUTTON} aria-label={`Close ${title}`}>
          ✕
        </button>
      </div>
      {/* The padding, undone by the margin, keeps focus rings inside the scrolling area. */}
      <div className="min-h-0 overflow-y-auto -m-1 p-1">{children}</div>
    </>
  )
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
