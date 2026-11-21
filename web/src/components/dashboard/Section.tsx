import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { winsLabel } from '../../utils/accountFormat'
import { SurfaceCard } from '../common/SurfaceCard'
import { SECTION_TITLE_TYPE } from './typography'

const SECTION_META_TYPE = 'text-[12.5px] leading-5'

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className={`${SECTION_TITLE_TYPE} text-amber-200/80`}>{children}</h2>
}

export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={`${SECTION_META_TYPE} font-medium text-amber-400 hover:text-amber-300 transition-colors whitespace-nowrap`}>
      {children}
    </Link>
  )
}

/** Counts beside a section title, such as how many games the player has finished and won. */
export function SectionCounts({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`${SECTION_META_TYPE} tabular-nums text-amber-100/70 ${className ?? ''}`}>{children}</div>
}

/** A number, picked out, and what it counts. */
export function Count({
  value,
  children,
  className,
}: {
  value: number | string
  /** What the number counts, starting with the space after it. */
  children: ReactNode
  className?: string
}) {
  return (
    <span className={className}>
      <strong className="text-amber-50">{value}</strong>
      {children}
    </span>
  )
}

export function WinsCount({ wins, games }: { wins: number; games: number }) {
  return <span className="text-amber-300">{winsLabel(wins, games)}</span>
}

/** A card in a grid that stands in for content still loading, missing or failed. */
export function NoticeTile({
  children,
  action,
  className,
  style,
}: {
  children: ReactNode
  action?: { label: string; onClick: () => void }
  className?: string
  style?: CSSProperties
}) {
  return (
    <SurfaceCard
      layout="tile"
      style={style}
      className={`flex flex-col items-center justify-center gap-3 px-5 py-6 text-center text-sm text-amber-100/70 ${className ?? ''}`}
    >
      <p>{children}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="btn btn-primary px-5 py-1.5 text-sm font-semibold">
          {action.label}
        </button>
      )}
    </SurfaceCard>
  )
}
