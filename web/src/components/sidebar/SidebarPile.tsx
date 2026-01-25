import { useState } from 'react'
import type { Card as CardType } from '../../types'
import { Card } from '../card'

interface SidebarPileProps {
  label: string
  cards: CardType[]
  bgColor: string
}

export function SidebarPile({ label, cards, bgColor }: SidebarPileProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (isExpanded) {
    return (
      <div
        className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8"
        onClick={() => setIsExpanded(false)}
      >
        <div
          className={`${bgColor} rounded-lg p-4 max-w-4xl max-h-[80vh] overflow-auto`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-medium">
              {label} ({cards.length})
            </h3>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-gray-400 hover:text-white"
            >
              Close
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {cards.map((card) => (
              <Card key={card.id} card={card} size="sm" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setIsExpanded(true)}
      disabled={cards.length === 0}
      className={`${bgColor} rounded px-2 py-1 text-xs flex items-center gap-1 hover:brightness-125 disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <span className="text-gray-300">{label}</span>
      <span className="text-white font-medium">{cards.length}</span>
    </button>
  )
}
