import type { SharePlayerSnapshot } from '../../types'
import { DeckDisplay } from '../common'
import { collapseDuplicateBasics } from '../../utils/format'

interface ShareRoundDetailProps {
  snapshot: SharePlayerSnapshot
  useUpgrades: boolean
}

export function ShareRoundDetail({ snapshot, useUpgrades }: ShareRoundDetailProps) {
  const appliedUpgrades = useUpgrades ? snapshot.applied_upgrades.filter((u) => u.upgrade_target !== null) : []
  const companionIds = new Set(snapshot.command_zone.map((c) => c.id))
  const collapsedBasics = collapseDuplicateBasics(snapshot.basic_lands)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <DeckDisplay
        hand={snapshot.hand}
        sideboard={snapshot.sideboard}
        collapsedBasics={collapsedBasics}
        treasures={snapshot.treasures}
        poison={snapshot.poison}
        appliedUpgrades={appliedUpgrades}
        companionIds={companionIds}
      />
    </div>
  )
}
