import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SurfaceCard } from '../common/SurfaceCard'

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[11.5px] leading-4 font-bold uppercase tracking-[0.12em] text-amber-200/80">{children}</h2>
}

export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-[12.5px] leading-5 font-medium text-amber-400 hover:text-amber-300 transition-colors whitespace-nowrap">
      {children}
    </Link>
  )
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
      className={`flex flex-col items-center justify-center gap-3 px-5 py-6 text-center text-sm text-gray-300 ${className ?? ''}`}
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
