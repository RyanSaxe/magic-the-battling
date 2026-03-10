import type { SharePlayerSnapshot } from '../../types'
import { DeckDisplay } from '../common'
import type { DeckDisplayResizeState } from '../common/DeckDisplay'

interface ShareRoundDetailProps {
  snapshot: SharePlayerSnapshot
  useUpgrades: boolean
  enableResize?: boolean
  isMobile?: boolean
  layoutStateKey?: string
  resizeState?: DeckDisplayResizeState
}

export function ShareRoundDetail({
  snapshot,
  useUpgrades,
  enableResize = false,
  isMobile = false,
  layoutStateKey,
  resizeState,
}: ShareRoundDetailProps) {
  const upgrades = useUpgrades ? (snapshot.upgrades ?? snapshot.applied_upgrades) : []
  const companionIds = new Set(snapshot.command_zone.map((c) => c.id))
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <DeckDisplay
        hand={snapshot.hand}
        sideboard={snapshot.sideboard}
        basics={snapshot.basic_lands}
        treasures={snapshot.treasures}
        poison={snapshot.poison}
        upgrades={upgrades}
        companionIds={companionIds}
        className="zone-divider-bg p-[2px] flex-1 min-h-0 flex flex-col"
        enableResize={enableResize}
        isMobile={isMobile}
        layoutStateKey={layoutStateKey}
        resizeState={resizeState}
      />
    </div>
  )
}
