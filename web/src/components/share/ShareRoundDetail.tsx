import type { SharePlayerSnapshot } from '../../types'
import { DeckDisplay } from '../common'

interface ShareRoundDetailProps {
  snapshot: SharePlayerSnapshot
  useUpgrades: boolean
}

export function ShareRoundDetail({ snapshot, useUpgrades }: ShareRoundDetailProps) {
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
        className="bg-gray-600/40 p-[1px] flex-1 min-h-0 flex flex-col"
      />
    </div>
  )
}
