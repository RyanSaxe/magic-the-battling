import type { ReactNode } from 'react'

interface BadgeProps {
  text: string
  color?: 'gold' | 'green' | 'blue' | 'red' | 'gray'
}

const BADGE_COLORS: Record<string, string> = {
  gold: 'bg-amber-500/80 text-black',
  green: 'bg-emerald-600/80 text-white',
  blue: 'bg-blue-600/80 text-white',
  red: 'bg-red-600/80 text-white',
  gray: 'bg-gray-600/80 text-gray-200',
}

export interface InfoCardProps {
  title: string
  subtitle?: string
  badge?: BadgeProps
  metadata?: { label: string; value: string }[]
  primaryAction?: { label: string; onClick: () => void }
  secondaryAction?: { label: string; onClick: () => void }
  onClick?: () => void
  className?: string
  children?: ReactNode
}

export function InfoCard({
  title,
  subtitle,
  badge,
  metadata,
  primaryAction,
  secondaryAction,
  onClick,
  className,
  children,
}: InfoCardProps) {
  const hasActions = primaryAction || secondaryAction

  return (
    <div
      onClick={onClick}
      className={`group relative modal-chrome border border-black/40 rounded-lg p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-700/50 ${onClick ? 'cursor-pointer' : ''} ${className ?? ''}`}
    >
      {badge && (
        <span className={`absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 ${BADGE_COLORS[badge.color ?? 'gray']}`}>
          {badge.text}
        </span>
      )}

      <h3 className="text-white font-semibold text-sm truncate pr-16">{title}</h3>
      {subtitle && <p className="text-gray-400 text-xs mt-0.5 truncate">{subtitle}</p>}

      {metadata && metadata.length > 0 && (
        <div className="mt-3 space-y-1">
          {metadata.map((m) => (
            <div key={m.label} className="flex justify-between text-xs">
              <span className="text-gray-500">{m.label}</span>
              <span className="text-gray-300">{m.value}</span>
            </div>
          ))}
        </div>
      )}

      {children}

      {hasActions && (
        <div className="mt-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {primaryAction && (
            <button
              onClick={(e) => { e.stopPropagation(); primaryAction.onClick() }}
              className="btn btn-primary py-1 px-3 text-xs flex-1"
            >
              {primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={(e) => { e.stopPropagation(); secondaryAction.onClick() }}
              className="btn btn-secondary py-1 px-3 text-xs flex-1"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
