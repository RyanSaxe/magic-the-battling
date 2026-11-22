import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SurfaceCard } from '../common/SurfaceCard'
import { CubeBadge, type CubeBadgeTone } from './CubeBadge'
import { HeroDetails, type Detail } from './Details'
import { PlayIcon } from './Section'
import { LINK } from '../common/styles'

export interface HeroStat {
  label: string
  value: ReactNode
  detail?: ReactNode
}

export interface HeroAction {
  label: string
  onClick: () => void
  disabled?: boolean
  /** Whether a toggle is on. An on toggle is drawn in green. */
  pressed?: boolean
}

interface DetailHeroProps {
  imageUri?: string | null
  badge: { label: string; tone: CubeBadgeTone }
  title: string
  /** A line of text and HeroLinks, such as where the cube comes from. */
  links: ReactNode
  details?: Detail[]
  /** The buttons before Play, such as Edit or Follow. */
  actions: HeroAction[]
  play: { label: string; onClick: () => void }
  stats: HeroStat[]
  /** A line under the stats that says what they count. */
  caption?: ReactNode
}

/** The top of a saved preset's page or a cube's page: its art, name, links, settings, actions and record. */
export function DetailHero({ imageUri, badge, title, links, details, actions, play, stats, caption }: DetailHeroProps) {
  return (
    <SurfaceCard as="section" layout="tile" aria-label={title} className="overflow-hidden">
      <div className="relative">
        {imageUri && (
          <img
            src={imageUri}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[center_30%] brightness-[0.45]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-[color:var(--art-fade)] via-transparent to-transparent" />
        <div className="relative flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <CubeBadge tone={badge.tone}>
              {badge.label}
            </CubeBadge>
            <h1 className="mt-2 font-['Cinzel',serif] text-2xl font-bold leading-tight text-amber-50 drop-shadow-md">{title}</h1>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-amber-100/85">{links}</div>
            {details && details.length > 0 && <HeroDetails details={details} className="mt-3" />}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 [&>*]:flex-auto md:[&>*]:flex-none">
            {actions.map((action, index) => (
              // Keyed by place, since a toggle's label changes and it should stay the same button.
              <button
                key={index}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                aria-pressed={action.pressed}
                className={`btn btn-secondary px-4 py-2 text-sm font-medium disabled:opacity-50 ${action.pressed ? 'text-emerald-300' : ''}`}
              >
                {action.label}
              </button>
            ))}
            <button
              type="button"
              onClick={play.onClick}
              className="btn btn-primary flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold"
            >
              <PlayIcon />
              {play.label}
            </button>
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-px border-t gold-divider bg-[var(--stone)] md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="modal-chrome px-4 py-2.5">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100/60">{stat.label}</dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums text-amber-50">
              {stat.value}
              {stat.detail && <span className="ml-1.5 text-xs font-normal text-amber-100/60">{stat.detail}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {caption && <p className="border-t gold-divider px-4 py-1.5 text-[11px] leading-4 text-amber-100/60">{caption}</p>}
    </SurfaceCard>
  )
}

const HERO_LINK = `${LINK} transition-colors`

/** A link in a hero's line of links: to another page here, or out to another site. */
export function HeroLink({ children, ...target }: { children: ReactNode } & ({ to: string } | { href: string })) {
  if ('to' in target) {
    return (
      <Link to={target.to} className={HERO_LINK}>
        {children}
      </Link>
    )
  }
  return (
    <a href={target.href} target="_blank" rel="noopener noreferrer" className={HERO_LINK}>
      {children}
    </a>
  )
}
