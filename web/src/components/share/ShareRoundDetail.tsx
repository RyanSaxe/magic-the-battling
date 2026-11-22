import type { SharePlayerData, SharePlayerSnapshot } from '../../types'
import { getShareHiddenZones, getShareRoundBand, getShareUpgrades } from '../../utils/share'
import { DeckDisplay } from '../common'
import { Banner } from '../common/Banner'
import type { DeckDisplayResizeState } from '../common/DeckDisplay'

interface ShareRoundDetailProps {
  player: SharePlayerData
  snapshot: SharePlayerSnapshot
  useUpgrades: boolean
  enableResize?: boolean
  isMobile?: boolean
  layoutStateKey?: string
  resizeState?: DeckDisplayResizeState
  showLayoutReset?: boolean
}

export function ShareRoundDetail({
  player,
  snapshot,
  useUpgrades,
  enableResize = false,
  isMobile = false,
  layoutStateKey,
  resizeState,
  showLayoutReset = false,
}: ShareRoundDetailProps) {
  const upgrades = useUpgrades ? getShareUpgrades(snapshot) : []
  const companionIds = new Set(snapshot.command_zone.map((c) => c.id))
  const hiddenZones = getShareHiddenZones(snapshot).filter((zone) => zone !== 'upgrades' || useUpgrades)
  const band = getShareRoundBand(player, snapshot)
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
        hiddenZones={hiddenZones}
        enableResize={enableResize}
        isMobile={isMobile}
        layoutStateKey={layoutStateKey}
        resizeState={resizeState}
        resetControl={showLayoutReset ? {
          phaseLabel: 'Deck Layout',
          currentStage: snapshot.stage,
          currentRound: snapshot.round,
          message: 'This resets the current deck layout for this view on this device.',
        } : undefined}
      />
      {band && (
        <>
          <div className="zone-divider-line zone-divider-line--horizontal h-[2px] shrink-0" />
          <Banner size="compact" title={band} tone={band === 'Sudden Death' ? 'sudden-death' : 'gold'} />
        </>
      )}
    </div>
  )
}
