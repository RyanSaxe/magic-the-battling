import type { SharePlayerSnapshot } from '../../types'
import { DeckDisplay } from '../common'

interface ShareRoundDetailProps {
  snapshot: SharePlayerSnapshot
  useUpgrades: boolean
}

export function ShareRoundDetail({ snapshot, useUpgrades }: ShareRoundDetailProps) {
  const appliedUpgrades = useUpgrades ? snapshot.applied_upgrades.filter((u) => u.upgrade_target !== null) : []
  const companionIds = new Set(snapshot.command_zone.map((c) => c.id))
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <DeckDisplay
        hand={snapshot.hand}
        sideboard={snapshot.sideboard}
        basics={snapshot.basic_lands}
        treasures={snapshot.treasures}
        poison={snapshot.poison}
        appliedUpgrades={appliedUpgrades}
        companionIds={companionIds}
      />
    </div>
  )
}
