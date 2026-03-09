import type { ReactNode, RefCallback } from 'react'
import type { DividerCallbacks } from '../../hooks/useZoneDividers'
import { ZoneDivider } from './ZoneDivider'

export const badgeCls =
  'absolute left-1/2 -translate-x-1/2 -top-[9px] z-40 ' +
  'bg-[#2a2320] text-gray-400 text-[10px] uppercase tracking-widest ' +
  'px-2.5 py-0.5 rounded-full border zone-label-pill whitespace-nowrap'

interface ZoneLayoutProps {
  handContent: ReactNode
  handLabel: ReactNode
  battlefieldContent: ReactNode
  battlefieldLabel: ReactNode
  sideboardContent: ReactNode
  sideboardLabel: ReactNode
  upgradesContent: ReactNode | null
  upgradesLabel: ReactNode | null
  hasHand: boolean
  hasBattlefield: boolean
  hasSideboard: boolean
  hasUpgrades: boolean
  containerRef: RefCallback<HTMLElement>
  className?: string
  onClick?: React.MouseEventHandler<HTMLDivElement>
  dividerCallbacks?: DividerCallbacks | null
}

export function ZoneLayout({
  handContent,
  handLabel,
  battlefieldContent,
  battlefieldLabel,
  sideboardContent,
  sideboardLabel,
  upgradesContent,
  upgradesLabel,
  hasHand,
  hasBattlefield,
  hasSideboard,
  hasUpgrades,
  containerRef,
  className,
  onClick,
  dividerCallbacks,
}: ZoneLayoutProps) {
  const hasLower = hasBattlefield || hasSideboard || hasUpgrades
  const hasRight = hasBattlefield || hasSideboard
  const hasDividers = !!dividerCallbacks
  const gap = hasDividers ? 0 : 2

  return (
    <div ref={containerRef} className={className ?? 'zone-divider-bg p-[2px] flex-1 min-h-0 flex flex-col'} onClick={onClick}>
      <div className="flex flex-col flex-1 min-h-0" style={{ gap }}>
        {hasHand && (
          <div className="zone-hand px-3 pt-5 pb-3 relative">
            <span className={badgeCls}>{handLabel}</span>
            {handContent}
          </div>
        )}
        {hasHand && hasLower && dividerCallbacks?.topDivider && (
          <ZoneDivider orientation="horizontal" {...dividerCallbacks.topDivider} />
        )}
        {hasLower && (
          <div className="flex flex-1 min-h-0" style={{ gap }}>
            {hasRight && (
              <div className="flex-1 min-w-0 flex flex-col" style={{ gap }}>
                {hasBattlefield && (
                  <div className="zone-battlefield px-3 pt-5 pb-3 relative">
                    <span className={badgeCls}>{battlefieldLabel}</span>
                    {battlefieldContent}
                  </div>
                )}
                {hasBattlefield && hasSideboard && dividerCallbacks?.bottomLeftSplitDivider && (
                  <ZoneDivider orientation="horizontal" {...dividerCallbacks.bottomLeftSplitDivider} />
                )}
                {hasSideboard && (
                  <div className="zone-sideboard px-3 pt-5 pb-3 relative flex-1 min-h-0">
                    <span className={badgeCls}>{sideboardLabel}</span>
                    {sideboardContent}
                  </div>
                )}
              </div>
            )}
            {hasRight && hasUpgrades && dividerCallbacks?.leftDivider && (
              <ZoneDivider orientation="vertical" {...dividerCallbacks.leftDivider} />
            )}
            {hasUpgrades && (
              <div className="zone-upgrades px-3 pt-5 pb-3 relative flex items-center justify-center" style={{ minWidth: '7rem' }}>
                <span className={badgeCls}>{upgradesLabel}</span>
                <div className="overflow-hidden">
                  {upgradesContent}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
