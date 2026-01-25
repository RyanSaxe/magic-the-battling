import type { ReactNode } from 'react'
import type { PlayerView } from '../../types'
import { PlayerList } from '../PlayerList'

interface SidebarProps {
  players: PlayerView[]
  currentPlayerName: string
  phaseContent?: ReactNode
  previewContent?: ReactNode
}

export function Sidebar({ players, currentPlayerName, phaseContent, previewContent }: SidebarProps) {
  return (
    <aside className="w-64 bg-black/30 flex flex-col overflow-hidden">
      <div className="p-4 overflow-auto flex-shrink-0">
        <PlayerList players={players} currentPlayerName={currentPlayerName} />
      </div>
      {phaseContent && (
        <div className="border-t border-gray-700/50 overflow-auto">
          {phaseContent}
        </div>
      )}
      {previewContent && (
        <div className="border-t border-gray-700/50 overflow-auto flex-1">
          {previewContent}
        </div>
      )}
    </aside>
  )
}
