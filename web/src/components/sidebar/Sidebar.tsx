import type { ReactNode } from 'react'
import type { PlayerView } from '../../types'
import { PlayerList } from '../PlayerList'

interface SidebarProps {
  players: PlayerView[]
  currentPlayerName: string
  children?: ReactNode
}

export function Sidebar({ players, currentPlayerName, children }: SidebarProps) {
  return (
    <aside className="w-64 bg-black/30 flex flex-col overflow-hidden">
      <div className="p-4 overflow-auto flex-shrink-0">
        <PlayerList players={players} currentPlayerName={currentPlayerName} />
      </div>
      {children && (
        <div className="flex-1 p-4 pt-0 overflow-auto border-t border-gray-700/50">
          {children}
        </div>
      )}
    </aside>
  )
}
