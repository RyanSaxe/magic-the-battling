import type { ReactNode } from 'react'
import type { PlayerView } from '../../types'
import { PlayerList } from '../PlayerList'

interface SidebarProps {
  players: PlayerView[]
  currentPlayerName: string
  actionButtons?: ReactNode
}

export function Sidebar({ players, currentPlayerName, actionButtons }: SidebarProps) {
  return (
    <aside className="w-64 bg-black/30 flex flex-col overflow-hidden">
      <div className="p-4 overflow-auto flex-shrink-0">
        <PlayerList players={players} currentPlayerName={currentPlayerName} />
      </div>
      {actionButtons && (
        <div className="p-4 pt-0 border-t border-gray-700/50">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">Actions</div>
          {actionButtons}
        </div>
      )}
    </aside>
  )
}
