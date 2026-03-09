import type { ReactNode, RefCallback } from 'react'
import type { DividerCallbacks } from '../../hooks/useZoneDividers'
import { ZoneDivider } from './ZoneDivider'
import { ZoneLabel } from './ZoneLabel'

interface ZoneSectionHeights {
  hand?: number
  battlefield?: number
  sideboard?: number
  upgrades?: number
}

interface ZoneRefs {
  hand?: RefCallback<HTMLDivElement>
  battlefield?: RefCallback<HTMLDivElement>
  sideboard?: RefCallback<HTMLDivElement>
  upgrades?: RefCallback<HTMLDivElement>
}

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
  zoneHeights?: ZoneSectionHeights | null
  zoneRefs?: ZoneRefs
  overlay?: ReactNode
}

const PASSIVE_DIVIDER_CALLBACKS = {
  onDragStart: () => {},
  onDrag: () => {},
  onDragEnd: () => {},
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
  zoneHeights = null,
  zoneRefs,
  overlay,
}: ZoneLayoutProps) {
  const hasLower = hasBattlefield || hasSideboard || hasUpgrades
  const hasRight = hasBattlefield || hasSideboard
  const isControlled = !!zoneHeights
  const gap = 0
  const mobileTopHandle = isMobile ? dividerCallbacks?.topDivider ?? null : null
  const mobileBottomSplitHandle = isMobile
    ? dividerCallbacks?.bottomLeftSplitDivider ?? null
    : null
  const battlefieldLabelHandle = hasBattlefield ? mobileTopHandle : null
  const sideboardLabelHandle = hasBattlefield
    ? mobileBottomSplitHandle
    : mobileTopHandle
  const upgradesLabelHandle = hasUpgrades ? mobileTopHandle : null
  const showTopDivider = hasHand && hasLower
  const showBottomSplitDivider = hasBattlefield && hasSideboard
  const showLeftDivider = hasRight && hasUpgrades
  const controlledStyle = (height?: number) =>
    isControlled && height != null
      ? { height, flex: '0 0 auto' as const }
      : undefined
  const rootClassName = [
    'relative zone-divider-bg p-[2px] flex-1 min-h-0 flex flex-col',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div ref={containerRef} className={rootClassName} onClick={onClick}>
      <div className="flex flex-col flex-1 min-h-0" style={{ gap }}>
        {hasHand && (
          <div ref={zoneRefs?.hand} className="zone-hand w-full px-3 pt-5 pb-3 relative" style={controlledStyle(zoneHeights?.hand)}>
            <ZoneLabel>{handLabel}</ZoneLabel>
            {handContent}
          </div>
        )}
        {showTopDivider && (
          <ZoneDivider
            orientation="horizontal"
            interactive={!!dividerCallbacks?.topDivider && !isMobile}
            {...(dividerCallbacks?.topDivider ?? PASSIVE_DIVIDER_CALLBACKS)}
          />
        )}
        {hasLower && (
          <div className={`flex min-h-0 w-full ${isControlled ? '' : 'flex-1'}`} style={{ gap, ...(isControlled ? { flex: '0 0 auto' } : {}) }}>
            {hasRight && (
              <div className="min-w-0 flex flex-1 flex-col" style={{ gap }}>
                {hasBattlefield && (
                  <div ref={zoneRefs?.battlefield} className="zone-battlefield w-full px-3 pt-5 pb-3 relative" style={controlledStyle(zoneHeights?.battlefield)}>
                    <ZoneLabel mobileDragCallbacks={battlefieldLabelHandle}>
                      {battlefieldLabel}
                    </ZoneLabel>
                    {battlefieldContent}
                  </div>
                )}
                {showBottomSplitDivider && (
                  <ZoneDivider
                    orientation="horizontal"
                    interactive={!!dividerCallbacks?.bottomLeftSplitDivider && !isMobile}
                    {...(dividerCallbacks?.bottomLeftSplitDivider ?? PASSIVE_DIVIDER_CALLBACKS)}
                  />
                )}
                {hasSideboard && (
                  <div ref={zoneRefs?.sideboard} className={`zone-sideboard w-full px-3 pt-5 pb-3 relative min-h-0 ${isControlled ? '' : 'flex-1'}`} style={controlledStyle(zoneHeights?.sideboard)}>
                    <ZoneLabel mobileDragCallbacks={sideboardLabelHandle}>
                      {sideboardLabel}
                    </ZoneLabel>
                    {sideboardContent}
                  </div>
                )}
              </div>
            )}
            {showLeftDivider && (
              <ZoneDivider
                orientation="vertical"
                interactive={!!dividerCallbacks?.leftDivider && !isMobile}
                {...(dividerCallbacks?.leftDivider ?? PASSIVE_DIVIDER_CALLBACKS)}
              />
            )}
            {hasUpgrades && (
              <div ref={zoneRefs?.upgrades} className="zone-upgrades px-3 pt-5 pb-3 relative flex items-center justify-center" style={{ minWidth: '7rem', ...(controlledStyle(zoneHeights?.upgrades) ?? {}) }}>
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
      {overlay}
    </div>
  )
}
