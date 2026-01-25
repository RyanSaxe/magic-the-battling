import type { ReactNode } from 'react'
import type { PlayerView } from '../../types'
import { PlayerList } from '../PlayerList'

interface SidebarProps {
  players: PlayerView[]
  currentPlayerName: string
  phaseContent?: ReactNode
}

export function Sidebar({ players, currentPlayerName, phaseContent }: SidebarProps) {
  return (
    <aside className="w-64 bg-black/30 flex flex-col overflow-hidden">
      {phaseContent ? (
        <div className="overflow-auto flex-shrink-0">
          {phaseContent}
        </div>
      ) : (
        <div className="p-4 overflow-auto flex-shrink-0">
          <PlayerList players={players} currentPlayerName={currentPlayerName} />
        </div>
      )}
    </aside>
  )
}
