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

const VARIANT_HEADER_BG: Record<string, string> = {
  cube: 'bg-amber-950/40',
  community: 'bg-[#2a2320]',
  history: 'bg-[#2d2220]',
}

export interface CardAction {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'danger'
}

export interface InfoCardProps {
  title: string
  subtitle?: string
  badge?: BadgeProps
  variant?: 'cube' | 'community' | 'history'
  metadata?: { label: string; value: string }[]
  actions?: CardAction[]
  onClick?: () => void
  className?: string
  children?: ReactNode
}

export function InfoCard({
  title,
  subtitle,
  badge,
  variant = 'community',
  metadata,
  actions,
  onClick,
  className,
  children,
}: InfoCardProps) {

  return (
    <div
      onClick={onClick}
      className={`group relative modal-chrome felt-raised-panel overflow-hidden rounded-lg flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_1px_rgba(255,236,181,0.58)] ${onClick ? 'cursor-pointer' : ''} ${className ?? ''}`}
    >
      <div className={`${VARIANT_HEADER_BG[variant]} px-4 py-2.5 border-b border-[color:rgba(212,175,55,0.22)] flex items-center gap-2 min-w-0`}>
        <div className="flex-1 min-w-0">
          <h3 className="text-amber-50 font-semibold text-sm truncate font-['Cinzel',serif]">{title}</h3>
          {subtitle && <p className="text-gray-400 text-xs mt-0.5 truncate">{subtitle}</p>}
        </div>
        {badge && (
          <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 ${BADGE_COLORS[badge.color ?? 'gray']}`}>
            {badge.text}
          </span>
        )}
      </div>

      <div className="flex-1 px-4 py-3 flex flex-col">
        {metadata && metadata.length > 0 && (
          <dl className="overflow-hidden rounded-lg border border-[color:rgba(212,175,55,0.22)] bg-black/10">
            {metadata.map((m, i) => (
              <div
                key={m.label}
                className={`grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3 px-3 py-1.5 ${
                  i > 0 ? 'border-t border-[color:rgba(212,175,55,0.12)]' : ''
                }`}
              >
                <dt className="text-[11px] font-medium text-gray-400">{m.label}</dt>
                <dd className="min-w-0 text-right text-sm text-amber-50">
                  <span className="block truncate">{m.value}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}

        {children}
      </div>

      {actions && actions.length > 0 && (
        <div className="px-4 pb-3 pt-1 mt-auto flex gap-2">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={(e) => { e.stopPropagation(); action.onClick() }}
              className={`py-1.5 px-3 text-xs flex-1 min-h-[36px] sm:min-h-0 ${
                action.variant === 'danger'
                  ? 'btn btn-secondary text-red-400 hover:text-red-300'
                  : action.variant === 'primary'
                    ? 'btn btn-primary'
                    : 'btn btn-secondary'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
