import { createElement, type ComponentPropsWithoutRef } from 'react'

type SurfaceCardElement = 'div' | 'form' | 'section'

type SurfaceCardProps<E extends SurfaceCardElement> = {
  as?: E
} & ComponentPropsWithoutRef<E>

/**
 * The walnut card with a gold border that holds a page's content, a form or a
 * dialog on the felt. It is centered in its container, up to 28rem wide, and
 * scales up as a whole on screens 1600px and wider.
 */
export function SurfaceCard<E extends SurfaceCardElement = 'div'>({
  as,
  className,
  ...props
}: SurfaceCardProps<E>) {
  const classes = [
    'surface-card modal-chrome border gold-border rounded-lg w-full max-w-md mx-auto flex-none p-5 lg:p-6',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return createElement(as ?? 'div', { ...props, className: classes })
}
