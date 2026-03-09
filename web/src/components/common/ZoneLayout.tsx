import type { ReactNode, RefCallback } from 'react'
import type { DividerCallbacks } from '../../hooks/useZoneDividers'
import { ZoneDivider } from './ZoneDivider'
import { ZoneLabel } from './ZoneLabel'

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
  isMobile?: boolean
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
  isMobile = false,
}: ZoneLayoutProps) {
  const hasLower = hasBattlefield || hasSideboard || hasUpgrades
  const hasRight = hasBattlefield || hasSideboard
  const hasDividers = !!dividerCallbacks
  const gap = hasDividers ? 0 : 2
  const mobileTopHandle = isMobile ? dividerCallbacks?.topDivider ?? null : null
  const mobileBottomSplitHandle = isMobile
    ? dividerCallbacks?.bottomLeftSplitDivider ?? null
    : null
  const battlefieldLabelHandle = hasBattlefield ? mobileTopHandle : null
  const sideboardLabelHandle = hasBattlefield
    ? mobileBottomSplitHandle
    : mobileTopHandle
  const upgradesLabelHandle = hasUpgrades ? mobileTopHandle : null

  return (
    <div ref={containerRef} className={className ?? 'zone-divider-bg p-[2px] flex-1 min-h-0 flex flex-col'} onClick={onClick}>
      <div className="flex flex-col flex-1 min-h-0" style={{ gap }}>
        {hasHand && (
          <div className="zone-hand px-3 pt-5 pb-3 relative">
            <ZoneLabel>{handLabel}</ZoneLabel>
            {handContent}
          </div>
        )}
        {hasHand && hasLower && dividerCallbacks?.topDivider && (
          <ZoneDivider
            orientation="horizontal"
            interactive={!isMobile}
            {...dividerCallbacks.topDivider}
          />
        )}
        {hasLower && (
          <div className="flex flex-1 min-h-0" style={{ gap }}>
            {hasRight && (
              <div className="flex-1 min-w-0 flex flex-col" style={{ gap }}>
                {hasBattlefield && (
                  <div className="zone-battlefield px-3 pt-5 pb-3 relative">
                    <ZoneLabel mobileDragCallbacks={battlefieldLabelHandle}>
                      {battlefieldLabel}
                    </ZoneLabel>
                    {battlefieldContent}
                  </div>
                )}
                {hasBattlefield && hasSideboard && dividerCallbacks?.bottomLeftSplitDivider && (
                  <ZoneDivider
                    orientation="horizontal"
                    interactive={!isMobile}
                    {...dividerCallbacks.bottomLeftSplitDivider}
                  />
                )}
                {hasSideboard && (
                  <div className="zone-sideboard px-3 pt-5 pb-3 relative flex-1 min-h-0">
                    <ZoneLabel mobileDragCallbacks={sideboardLabelHandle}>
                      {sideboardLabel}
                    </ZoneLabel>
                    {sideboardContent}
                  </div>
                )}
              </div>
            )}
            {hasRight && hasUpgrades && dividerCallbacks?.leftDivider && (
              <ZoneDivider
                orientation="vertical"
                interactive={!isMobile}
                {...dividerCallbacks.leftDivider}
              />
            )}
            {hasUpgrades && (
              <div className="zone-upgrades px-3 pt-5 pb-3 relative flex items-center justify-center" style={{ minWidth: '7rem' }}>
                <ZoneLabel mobileDragCallbacks={upgradesLabelHandle}>
                  {upgradesLabel}
                </ZoneLabel>
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
