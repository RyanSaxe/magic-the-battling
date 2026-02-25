import type { ReactNode, RefCallback } from 'react'

export const badgeCls =
  'absolute left-1/2 -translate-x-1/2 -top-[9px] z-40 ' +
  'bg-gray-800 text-gray-400 text-[10px] uppercase tracking-widest ' +
  'px-2.5 py-0.5 rounded-full border border-gray-600 whitespace-nowrap'

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
}: ZoneLayoutProps) {
  const hasLower = hasBattlefield || hasSideboard || hasUpgrades
  const hasRight = hasBattlefield || hasSideboard

  return (
    <div ref={containerRef} className={className ?? 'rounded-lg bg-gray-600/40 p-[1px] flex-1 min-h-0 flex flex-col'} onClick={onClick}>
      <div className="flex flex-col flex-1 min-h-0" style={{ gap: 1 }}>
        {hasHand && (
          <div className="bg-black/30 px-3 pt-5 pb-3 relative">
            <span className={badgeCls}>{handLabel}</span>
            {handContent}
          </div>
        )}
        {hasLower && (
          <div className="flex flex-1" style={{ gap: 1 }}>
            {hasRight && (
              <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 1 }}>
                {hasBattlefield && (
                  <div className="bg-black/30 px-3 pt-5 pb-3 relative">
                    <span className={badgeCls}>{battlefieldLabel}</span>
                    {battlefieldContent}
                  </div>
                )}
                {hasSideboard && (
                  <div className="bg-black/30 px-3 pt-5 pb-3 relative flex-1">
                    <span className={badgeCls}>{sideboardLabel}</span>
                    {sideboardContent}
                  </div>
                )}
              </div>
            )}
            {hasUpgrades && (
              <div className="bg-black/30 px-3 pt-5 pb-3 relative flex items-center justify-center overflow-hidden" style={{ minWidth: '7rem' }}>
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
