import type { Card as CardType, ZoneName } from '../../types'
import { DraggableCard, DroppableZone } from '../../dnd'
import { Card } from '../card'

interface SideboardZoneProps {
  cards: CardType[]
  selectedCardId?: string
  onCardClick?: (card: CardType) => void
  validFromZones?: ZoneName[]
  draggable?: boolean
}

export function SideboardZone({
  cards,
  selectedCardId,
  onCardClick,
  validFromZones = ['hand'],
  draggable = true,
}: SideboardZoneProps) {
  return (
    <DroppableZone
      zone="sideboard"
      validFromZones={validFromZones}
      className="p-4 bg-black/20 rounded-lg min-h-[200px]"
    >
      <div className="text-xs text-[var(--ivory-felt)] mb-2 uppercase tracking-wide">
        Sideboard ({cards.length})
      </div>
      <div className="flex flex-wrap gap-1.5">
        {cards.length === 0 ? (
          <div className="text-[var(--ivory-felt)] text-sm">No cards in sideboard</div>
        ) : (
          cards.map((card) => (
            draggable ? (
              <DraggableCard
                key={card.id}
                card={card}
                zone="sideboard"
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
          ))
        )}
      </div>
    </DroppableZone>
  )
}
