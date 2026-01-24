import { useState } from 'react'
import type { Card as CardType, ZoneName } from '../../types'
import { DraggableCard, DroppableZone } from '../../dnd'
import { Card } from '../card'

interface PileZoneProps {
  zone: 'graveyard' | 'exile'
  cards: CardType[]
  selectedCardId?: string
  onCardClick?: (card: CardType) => void
  validFromZones?: ZoneName[]
  draggable?: boolean
  isOpponent?: boolean
}

export function PileZone({
  zone,
  cards,
  selectedCardId,
  onCardClick,
  validFromZones,
  draggable = true,
  isOpponent = false,
}: PileZoneProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const defaultValidZones = zone === 'graveyard'
    ? ['hand', 'battlefield', 'exile']
    : ['hand', 'battlefield', 'graveyard']

  const label = zone === 'graveyard' ? 'GY' : 'Exile'
  const bgColor = zone === 'graveyard'
    ? 'bg-red-950/40'
    : 'bg-purple-950/40'

  if (cards.length === 0) {
    return (
      <DroppableZone
        zone={zone}
        validFromZones={validFromZones || defaultValidZones as ZoneName[]}
        disabled={isOpponent}
        className={`zone-pile ${bgColor} w-16 h-24 flex items-center justify-center`}
      >
        <span className="text-gray-500 text-xs">{label}</span>
      </DroppableZone>
    )
  }

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
              {zone === 'graveyard' ? 'Graveyard' : 'Exile'} ({cards.length})
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
              draggable && !isOpponent ? (
                <DraggableCard
                  key={card.id}
                  card={card}
                  zone={zone}
                  size="sm"
                  selected={card.id === selectedCardId}
                  onClick={() => onCardClick?.(card)}
                />
              ) : (
                <Card
                  key={card.id}
                  card={card}
                  size="sm"
                  selected={card.id === selectedCardId}
                  onClick={() => onCardClick?.(card)}
                />
              )
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <DroppableZone
      zone={zone}
      validFromZones={validFromZones || defaultValidZones as ZoneName[]}
      disabled={isOpponent}
      className={`zone-pile ${bgColor}`}
    >
      <div
        className="relative w-16 h-24 cursor-pointer"
        onClick={() => setIsExpanded(true)}
      >
        <Card
          card={cards[cards.length - 1]}
          size="sm"
          className="w-full h-full"
        />
        <div className="absolute -top-1 -right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded-full border border-gray-600">
          {cards.length}
        </div>
      </div>
    </DroppableZone>
  )
}
