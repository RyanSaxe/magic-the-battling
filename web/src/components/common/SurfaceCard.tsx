import { createElement, type ComponentPropsWithoutRef } from 'react'

/**
 * - sm: full width up to 24rem.
 * - md: full width up to 28rem.
 * - md-viewport: 28rem, or 92% of the screen width when that is narrower.
 * - fit-sm: as wide as its content, up to 24rem.
 */
export type SurfaceCardWidth = 'sm' | 'md' | 'md-viewport' | 'fit-sm'

export type SurfaceCardPadding = 4 | 5 | 6 | 8

const WIDTH_CLASS: Record<SurfaceCardWidth, string> = {
  sm: 'w-full max-w-sm',
  md: 'w-full max-w-md',
  'md-viewport': 'max-w-md w-[min(92vw,28rem)]',
  'fit-sm': 'max-w-sm',
}

const PADDING_CLASS: Record<SurfaceCardPadding, string> = {
  4: 'p-4',
  5: 'p-5',
  6: 'p-6',
  8: 'p-8',
}

type SurfaceCardElement = 'div' | 'form' | 'section'

type SurfaceCardProps<E extends SurfaceCardElement> = {
  as?: E
  width: SurfaceCardWidth
  padding?: SurfaceCardPadding
  /** False drops the gold border. */
  bordered?: boolean
  /** False drops the raised shadow. */
  raised?: boolean
} & ComponentPropsWithoutRef<E>

/** The walnut card with a gold border that holds a page's content, a form or a dialog on the felt. */
export function SurfaceCard<E extends SurfaceCardElement = 'div'>({
  as,
  width,
  padding,
  bordered = true,
  raised = true,
  className,
  ...props
}: SurfaceCardProps<E>) {
  const classes = [
    'modal-chrome rounded-lg',
    bordered && 'border gold-border',
    raised && 'felt-raised-panel',
    WIDTH_CLASS[width],
    padding !== undefined && PADDING_CLASS[padding],
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return createElement(as ?? 'div', { ...props, className: classes })
}
