import type { ReactNode } from 'react'
import { SurfaceCard } from '../common/SurfaceCard'
import { BADGE_CLASSES, type CubeBadge } from './badges'
import { Chip } from './CubeTile'

export interface HeroStat {
  label: string
  value: ReactNode
  detail?: ReactNode
}

interface DetailHeroProps {
  imageUri?: string | null
  badge: { label: string; tone: CubeBadge }
  title: string
  links: ReactNode
  chips?: string[]
  actions: ReactNode
  stats: HeroStat[]
  /** A line under the stats that says what they count. */
  caption?: ReactNode
}

/** The top of a saved preset's page or a cube's page: its art, name, links, settings, actions and record. */
export function DetailHero({ imageUri, badge, title, links, chips, actions, stats, caption }: DetailHeroProps) {
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
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
        <div className="relative flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <span
              className={`inline-block rounded-full border bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${BADGE_CLASSES[badge.tone]}`}
            >
              {badge.label}
            </span>
            <h1 className="mt-2 font-['Cinzel',serif] text-2xl font-bold leading-tight text-amber-50 drop-shadow-md">{title}</h1>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-gray-200">{links}</div>
            {chips && chips.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {chips.map((chip) => (
                  <Chip key={chip}>{chip}</Chip>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 [&>*]:flex-1 md:[&>*]:flex-none">{actions}</div>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-px border-t border-white/10 bg-white/10 md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="modal-chrome px-4 py-2.5">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">{stat.label}</dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums text-amber-50">
              {stat.value}
              {stat.detail && <span className="ml-1.5 text-xs font-normal text-gray-400">{stat.detail}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {caption && <p className="border-t border-white/10 px-4 py-1.5 text-[11px] leading-4 text-gray-400">{caption}</p>}
    </SurfaceCard>
  )
}
