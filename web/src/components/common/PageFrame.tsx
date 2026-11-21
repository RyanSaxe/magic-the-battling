import type { ReactNode } from 'react'
import { FaDiscord } from 'react-icons/fa6'
import { CubeCobraPrimerLink } from './CubeCobraPrimerLink'
import { BottomBar } from './FrameBar'
import { HintsBanner } from './HintsBanner'

interface PageFrameProps {
  header: ReactNode
  children: ReactNode
  /** Alignment of the scrolling content column, which has 1rem of padding on every side. */
  contentClassName?: string
  /** Center content that fits in the column. Content taller than the column starts at the top and scrolls. */
  center?: boolean
  hints?: boolean
  /** False for content that sizes itself to the column and may overhang its edges. */
  scroll?: boolean
  /** The page's sidebar, docked inside the felt's gold edge. */
  aside?: ReactNode
  footer?: ReactNode
}

/** A sidebar docked between the board and the right rail, inside the felt's gold edge. */
export function FrameSidebar({ children }: { children: ReactNode }) {
  return <div className="frame-sidebar zone-divider-bg shrink-0 flex min-h-0">{children}</div>
}

/** The felt between the rails: a banner, when there is one, across its full width, over the board and its sidebar. */
export function FrameFelt({ banner, children }: { banner?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex-1 flex min-h-0 game-surface">
      <div className="sm:hidden w-[4px] shrink-0 frame-chrome" />
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {banner}
        <div className="flex-1 flex min-h-0">{children}</div>
      </div>
      <div className="w-[4px] sm:w-10 shrink-0 frame-chrome" />
    </div>
  )
}

export function PageFrame({
  header,
  children,
  contentClassName = '',
  center = false,
  hints = false,
  scroll = true,
  aside,
  footer,
}: PageFrameProps) {
  const centerClass = center ? 'page-center' : ''
  const scrollClass = scroll ? 'overflow-y-auto overflow-x-hidden overscroll-contain p-4' : ''
  return (
    <div className="game-table h-dvh flex flex-col overflow-hidden">
      {header}

      <FrameFelt>
        <main className="flex-1 min-w-0 min-h-0 p-[2px] zone-divider-bg flex flex-col">
          <div className={`zone-pack flex-1 min-w-0 min-h-0 flex flex-col ${scrollClass} ${centerClass} ${contentClassName}`}>
            {children}
          </div>
          {hints && <HintsBanner variant="rail" />}
        </main>

        {aside && <FrameSidebar>{aside}</FrameSidebar>}
      </FrameFelt>

      {footer ?? (
        <BottomBar
          secondary={
            <a
              href="https://discord.gg/2NAjcWXNKn"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-[#6974F4] hover:text-[#7983F5] transition-colors"
            >
              <FaDiscord className="w-4 h-4" />
              Join Discord
            </a>
          }
          main={<CubeCobraPrimerLink />}
        />
      )}
    </div>
  )
}
