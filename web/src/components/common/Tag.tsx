import type { ReactNode } from 'react'
import { getOrdinal } from '../../utils/format'

export type TagTone = 'gold' | 'stone' | 'bronze' | 'crimson' | 'emerald'

/**
 * A small rimmed label: what a cube is, a placement, a feature's status or a player's state.
 * - small: 18px instead of 20px, for statuses beside other text.
 * - quiet: a near-black fill and softer rim, for statuses that shouldn't compete with labels.
 * - dot: leads with a dot in the tone's colour.
 */
export function Tag({
  tone,
  small = false,
  quiet = false,
  dot = false,
  title,
  className,
  children,
}: {
  tone: TagTone
  small?: boolean
  quiet?: boolean
  dot?: boolean
  title?: string
  className?: string
  children: ReactNode
}) {
  const classes = ['tag', `tag-${tone}`, small && 'tag-small', quiet && 'tag-quiet', dot && 'tag-dot', className]
    .filter(Boolean)
    .join(' ')
  return (
    <span className={classes} title={title}>
      {children}
    </span>
  )
}

/** First is gold and last is crimson. Between them third is bronze and the rest stone, so second of two is crimson. */
function placementTone(rank: number, total: number): TagTone {
  if (rank === 1) return 'gold'
  if (rank === total) return 'crimson'
  if (rank === 3) return 'bronze'
  return 'stone'
}

/** A finishing place, such as 1ST or 4TH, in the dashboard's games and the game's player list. */
export function PlacementTag({ rank, total, className }: { rank: number; total: number; className?: string }) {
  return (
    <Tag tone={placementTone(rank, total)} className={`tabular-nums ${className ?? ''}`}>
      {getOrdinal(rank)}
    </Tag>
  )
}
