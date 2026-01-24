import { Card } from './card'
import type { Card as CardType } from '../types'

interface CardZoneProps {
  title: string
  cards: CardType[]
  onCardClick?: (card: CardType) => void
  selectedCardId?: string | null
  emptyMessage?: string
  maxHeight?: string
}

export function CardZone({
  title,
  cards,
  onCardClick,
  selectedCardId,
  emptyMessage = 'No cards',
  maxHeight = 'max-h-64',
}: CardZoneProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-3">
      <h3 className="text-white font-medium mb-2">
        {title} ({cards.length})
      </h3>
      <div className={`flex flex-wrap gap-2 overflow-y-auto ${maxHeight}`}>
        {cards.length === 0 ? (
          <p className="text-gray-500 text-sm">{emptyMessage}</p>
        ) : (
          cards.map((card) => (
            <Card
              key={card.id}
              card={card}
              onClick={() => onCardClick?.(card)}
              selected={selectedCardId === card.id}
              size="sm"
            />
          ))
        )}
      </div>
    </div>
  )
}
