import { COMPACT_BANNER_HEIGHT, GAME_BANNER_HEIGHT } from './bannerSizes'

type BannerTone = 'gold' | 'sudden-death'

const TITLE_TONE: Record<BannerTone, string> = {
  gold: 'text-[var(--color-gold)]',
  'sudden-death': 'text-red-300 [text-shadow:0_0_10px_rgba(239,68,68,0.45)]',
}

interface BannerProps {
  title: string
  tone?: BannerTone
  /**
   * game: spans the frame over the board and the sidebar, under the frame's gold edge, whose seam below is the
   * board's and the sidebar's own top edge. compact: the share page's band, inside the felt under a round's deck.
   */
  size?: 'game' | 'compact'
  /** A few words after the title, such as what Sudden Death means for the fight. */
  note?: string
  /** Longer help, shown on hovering an ⓘ after the note. */
  info?: string
}

/** The one banner: walnut with a gold edge and a short label in the board's type. */
export function Banner({ title, tone = 'gold', size = 'game', note, info }: BannerProps) {
  const compact = size === 'compact'
  return (
    <div
      data-banner
      className={compact ? 'shrink-0' : 'shrink-0 zone-divider-bg px-[2px] pt-[2px]'}
      style={{ height: compact ? COMPACT_BANNER_HEIGHT : GAME_BANNER_HEIGHT }}
    >
      <div className="frame-chrome h-full flex items-center justify-center gap-2.5 whitespace-nowrap leading-none px-3">
        <span
          className={`font-['Cinzel',serif] font-bold uppercase ${
            compact ? 'text-[13px] tracking-[0.22em]' : 'text-[15px] tracking-[0.14em]'
          } ${TITLE_TONE[tone]}`}
        >
          {title}
        </span>
        {note && (
          <>
            <span className="hero-sep text-[15px]">·</span>
            <span className="text-[13px] text-[var(--color-gold-dark)]">{note}</span>
          </>
        )}
        {info && (
          <span className="relative group cursor-help">
            <span className="text-xs text-[var(--color-gold-dark)]">ⓘ</span>
            <span className="absolute right-0 top-full mt-2 w-64 p-2 modal-chrome border gold-border rounded-lg felt-raised-panel text-xs text-left whitespace-normal leading-normal opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              {info}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
