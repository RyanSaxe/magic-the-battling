import { useState } from 'react'
import type { Card as CardType, ZoneName } from '../../types'
import { DraggableCard, DroppableZone } from '../../dnd'
import { Card } from '../card'
import { DndPanel } from '../common/DndPanel'

interface PileZoneProps {
  zone: 'graveyard' | 'exile'
  cards: CardType[]
  selectedCardId?: string
  onCardClick?: (card: CardType) => void
  validFromZones?: ZoneName[]
  draggable?: boolean
  isOpponent?: boolean
  canManipulateOpponent?: boolean
}

export function PileZone({
  zone,
  cards,
  selectedCardId,
  onCardClick,
  validFromZones,
  draggable = true,
  isOpponent = false,
  canManipulateOpponent = false,
}: PileZoneProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const allowInteraction = !isOpponent || canManipulateOpponent
  const zoneOwner = isOpponent ? 'opponent' : 'player' as const

  const defaultValidZones = ['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone']

  const label = zone === 'graveyard' ? 'GY' : 'Exile'
  const bgVar = zone === 'graveyard'
    ? 'var(--zone-graveyard)'
    : 'var(--zone-exile)'

  if (cards.length === 0) {
    return (
      <DroppableZone
        zone={zone}
        zoneOwner={zoneOwner}
        validFromZones={validFromZones || defaultValidZones as ZoneName[]}
        disabled={!allowInteraction}
        className="zone-pile w-16 h-24 flex items-center justify-center"
        style={{ background: bgVar }}
      >
        <span className="text-gray-500 text-xs">{label}</span>
      </DroppableZone>
    )
  }

  if (isExpanded) {
    const zoneName = zone === 'graveyard' ? 'Graveyard' : 'Exile'

    if (draggable && allowInteraction) {
      return (
        <DndPanel
          title={zoneName}
          count={cards.length}
          onClose={() => setIsExpanded(false)}
        >
          {(dims) =>
            cards.map((card) => (
              <DraggableCard
                key={card.id}
                card={card}
                zone={zone}
                zoneOwner={zoneOwner}
                dimensions={dims}
                selected={card.id === selectedCardId}
                onClick={() => onCardClick?.(card)}
              />
            ))
          }
        </DndPanel>
      )
    }

    return (
      <div
        className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-8"
        onClick={() => setIsExpanded(false)}
      >
        <div
          className="rounded-lg p-4 max-w-4xl max-h-[80vh] overflow-auto"
          style={{ background: bgVar }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-medium">
              {zoneName} ({cards.length})
            </h3>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-gray-400 hover:text-white"
            >
              Close
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {cards.map((card) => (
              <Card
                key={card.id}
                card={card}
                size="sm"
                selected={card.id === selectedCardId}
                onClick={() => onCardClick?.(card)}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <DroppableZone
      zone={zone}
      zoneOwner={zoneOwner}
      validFromZones={validFromZones || defaultValidZones as ZoneName[]}
      disabled={!allowInteraction}
      className="zone-pile"
      style={{ background: bgVar }}
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
