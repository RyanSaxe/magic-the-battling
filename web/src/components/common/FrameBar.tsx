import type { ReactNode, Ref } from 'react'

/** The crossed-cards mark. Decorative: the wordmark or the page beside it names the app. */
export function BrandMark({ className = '' }: { className?: string }) {
  return <img src="/favicon.svg" alt="" className={`w-6 h-6 shrink-0 ${className}`} />
}

/** The mark, PITFIGHT and "— an MtG format" over the tagline. Below 360px wide the tagline drops. */
export function BrandLockup() {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
      <BrandMark />
      <div className="min-w-0 leading-none">
        <div className="flex items-baseline whitespace-nowrap">
          <h1 className="hero-title text-[14px] sm:text-[18px] font-bold tracking-wide leading-tight shrink-0">
            Pitfight
          </h1>
          <span className="hero-sep ml-1 sm:ml-1.5 text-[9.5px] sm:text-[11.5px] shrink-0">—</span>
          {/* The gap after the dash is padding, not margin, so truncating keeps the first letter's overhang. */}
          <span className="hero-subtitle pl-1 sm:pl-1.5 text-[9.5px] sm:text-[11.5px] font-normal tracking-wider min-w-0 truncate">
            an MtG format
          </span>
        </div>
        <p className="hero-tagline !text-[8px] sm:!text-[9px] !tracking-[0.12em] truncate max-[359px]:hidden">
          Inspired by Roguelikes and Autobattlers
        </p>
      </div>
    </div>
  )
}

/** A bar button's label, shortened on phones. */
export function BarLabel({ desktop, phone }: { desktop: string; phone: string }) {
  return (
    <>
      <span className="hidden sm:inline">{desktop}</span>
      <span className="sm:hidden">{phone}</span>
    </>
  )
}

interface TopBarProps {
  /** What the bar starts with: the brand lockup outside a game, the phase timeline in one. */
  lead: ReactNode
  /** Context and utility buttons, such as Log in, Join Game, Guide or CubeCobra. */
  helpers?: ReactNode
  home?: ReactNode
  /** At most one gold button. */
  primary?: ReactNode
  /** The account menu or the ☰ drawer. */
  account?: ReactNode
  ref?: Ref<HTMLElement>
}

/**
 * The 42px walnut bar above the felt. It places its buttons in one order on every
 * page: helpers, then Home, then the gold button, then the account menu or ☰ at the right edge.
 */
export function TopBar({ lead, helpers, home, primary, account, ref }: TopBarProps) {
  return (
    <header ref={ref} className="frame-bar shrink-0 frame-chrome frame-bar-pad">
      <div className="h-[var(--frame-bar-height)] flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0 flex items-center">{lead}</div>
        <div className="shrink-0 flex items-center gap-1.5">
          <div className="contents" data-bar-role="helpers">{helpers}</div>
          <div className="contents" data-bar-role="home">{home}</div>
          <div className="contents" data-bar-role="primary">{primary}</div>
          <div className="contents" data-bar-role="account">{account}</div>
        </div>
      </div>
    </header>
  )
}

interface BottomBarProps {
  /** Secondary actions, at the left edge. */
  secondary?: ReactNode
  /** The main action, at the right edge. */
  main?: ReactNode
  /** Replaces the bar's side padding, for a bar that must stop short of a sidebar. */
  padClassName?: string
  className?: string
  guideTarget?: string
  ref?: Ref<HTMLElement>
}

/** The 42px walnut bar below the felt: secondary actions at the left edge and the main action at the right edge. */
export function BottomBar({
  secondary,
  main,
  padClassName = 'frame-bar-pad',
  className = '',
  guideTarget,
  ref,
}: BottomBarProps) {
  return (
    <footer ref={ref} className={`frame-bar shrink-0 frame-chrome ${padClassName} ${className}`}>
      <div
        className="h-[var(--frame-bar-height)] flex items-center justify-between gap-1.5 sm:gap-2"
        data-guide-target={guideTarget}
      >
        <div className="min-w-0 flex items-center gap-1.5 sm:gap-2" data-bar-role="secondary">{secondary}</div>
        <div className="shrink-0 flex items-center gap-1.5 sm:gap-2" data-bar-role="main">{main}</div>
      </div>
    </footer>
  )
}
