import type { Card as CardType, ZoneName } from '../../types'
import { DraggableCard, DroppableZone } from '../../dnd'

interface HandZoneProps {
  cards: CardType[]
  selectedCardId?: string
  onCardClick?: (card: CardType) => void
  validFromZones?: ZoneName[]
  draggable?: boolean
  zone?: ZoneName
}

export function HandZone({
  cards,
  selectedCardId,
  onCardClick,
  validFromZones = ['battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone'],
  draggable = true,
  zone = 'hand',
}: HandZoneProps) {
  return (
    <DroppableZone
      zone={zone}
      validFromZones={validFromZones}
      className="hand-zone min-h-[140px] w-full"
    >
      {cards.length === 0 ? (
        <div className="text-gray-500 text-sm">No cards in hand</div>
      ) : (
        cards.map((card) => (
          <DraggableCard
            key={card.id}
            card={card}
            zone={zone}
            size="md"
            selected={card.id === selectedCardId}
            onClick={() => onCardClick?.(card)}
            disabled={!draggable}
          />
        ))
      )}
    </DroppableZone>
  )
}
