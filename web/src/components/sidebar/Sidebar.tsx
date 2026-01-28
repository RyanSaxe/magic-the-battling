import type { ReactNode } from 'react'
import type { PlayerView } from '../../types'
import { PlayerList } from '../PlayerList'
import { ZoneDisplay } from './ZoneDisplay'
import { useContextStrip } from '../../contexts'

interface SidebarProps {
  players: PlayerView[]
  currentPlayer: PlayerView
  phaseContent?: ReactNode
  useUpgrades?: boolean
  inSuddenDeath?: boolean
}

export function Sidebar({ players, currentPlayer, phaseContent, useUpgrades = true, inSuddenDeath }: SidebarProps) {
  const { state } = useContextStrip()
  const revealedPlayer = state.revealedPlayerName
    ? players.find(p => p.name === state.revealedPlayerName)
    : null
  const displayPlayer = revealedPlayer ?? currentPlayer

  const appliedUpgrades = displayPlayer.upgrades.filter(u => u.upgrade_target !== null)
  const pendingUpgrades = currentPlayer.upgrades.filter(u => u.upgrade_target === null)
  const isViewingSelf = displayPlayer.name === currentPlayer.name

  const allUpgrades = isViewingSelf
    ? [...appliedUpgrades, ...pendingUpgrades]
    : appliedUpgrades

  return (
    <aside className="w-64 bg-black/30 flex flex-col overflow-hidden">
      {phaseContent ? (
        <div className="overflow-auto flex-shrink-0">
          {phaseContent}
        </div>
      ) : (
        <div className="p-4 overflow-auto flex-1 flex flex-col gap-4">
          <PlayerList players={players} currentPlayerName={currentPlayer.name} inSuddenDeath={inSuddenDeath} />
          <div className="border-t border-gray-700 pt-4">
            <h3 className="text-white font-medium mb-3">
              {displayPlayer.name === currentPlayer.name ? 'Your Cards' : `${displayPlayer.name}'s Cards`}
            </h3>
            <div className="flex flex-wrap gap-2">
              {useUpgrades && <ZoneDisplay title="Upgrades" cards={allUpgrades} maxThumbnails={6} showUpgradeTargets />}
              <ZoneDisplay title="Revealed" cards={displayPlayer.most_recently_revealed_cards} maxThumbnails={6} />
            </div>
            {(!useUpgrades || allUpgrades.length === 0) && displayPlayer.most_recently_revealed_cards.length === 0 && (
              <div className="text-gray-500 text-sm">No cards to display</div>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
