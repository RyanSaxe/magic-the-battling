import type { ReactNode } from 'react'
import { FaDiscord } from 'react-icons/fa6'
import { CubeCobraPrimerLink } from './CubeCobraPrimerLink'
import { HintsBanner } from './HintsBanner'

/**
 * Which screens center content that fits in the column. Elsewhere it starts at
 * the top, and content taller than the column always starts at the top and scrolls.
 * - always: every screen.
 * - except-short-wide: all but screens 640px or wider and 820px or shorter.
 * - tall-wide: only screens 640px or wider and taller than 820px.
 */
export type PageFrameCenter = 'always' | 'except-short-wide' | 'tall-wide'

const CENTER_CLASS: Record<PageFrameCenter, string> = {
  always: 'page-center',
  'except-short-wide': 'page-center-except-short-wide',
  'tall-wide': 'page-center-tall-wide',
}

interface PageFrameProps {
  header: ReactNode
  children: ReactNode
  /** Horizontal padding and alignment of the scrolling content column, which has 1rem of vertical padding. */
  contentClassName?: string
  center?: PageFrameCenter
  hints?: boolean
  /** False for content that sizes itself to the column and may overhang its edges. */
  scroll?: boolean
  /** Takes the place of the right rail, for a page with its own sidebar. */
  aside?: ReactNode
  footer?: ReactNode
}

export function PageFrame({
  header,
  children,
  contentClassName = '',
  center,
  hints = false,
  scroll = true,
  aside,
  footer,
}: PageFrameProps) {
  const centerClass = center ? CENTER_CLASS[center] : ''
  const scrollClass = scroll ? 'overflow-y-auto overflow-x-hidden overscroll-contain py-4' : ''
  return (
    <div className="game-table h-dvh flex flex-col overflow-hidden">
      {header}

      <div className="flex-1 flex min-h-0 game-surface">
        <div className="sm:hidden w-[4px] shrink-0 frame-chrome" />

        <main className="flex-1 min-w-0 min-h-0 p-[2px] zone-divider-bg flex flex-col">
          <div className={`zone-pack flex-1 min-w-0 min-h-0 flex flex-col ${scrollClass} ${centerClass} ${contentClassName}`}>
            {children}
          </div>
          {hints && <HintsBanner variant="rail" />}
        </main>

        {aside ?? <div className="w-[4px] sm:w-10 shrink-0 frame-chrome" />}
      </div>

      {footer ?? (
        <footer className="shrink-0 frame-chrome bar-pad-both py-2">
          <div className="flex items-center justify-between">
            <a
              href="https://discord.gg/2NAjcWXNKn"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-[#6974F4] hover:text-[#7983F5] transition-colors"
            >
              <FaDiscord className="w-4 h-4" />
              Join Discord
            </a>
            <CubeCobraPrimerLink />
          </div>
        </footer>
      )}
    </div>
  )
}
