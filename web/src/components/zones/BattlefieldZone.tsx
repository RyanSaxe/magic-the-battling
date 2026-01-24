import type { Card as CardType, ZoneName } from '../../types'
import { DraggableCard, DroppableZone } from '../../dnd'

const isLand = (card: CardType) => card.type_line.toLowerCase().includes('land')

interface BattlefieldZoneProps {
  cards: CardType[]
  selectedCardId?: string
  onCardClick?: (card: CardType) => void
  onCardDoubleClick?: (card: CardType) => void
  tappedCardIds?: Set<string>
  validFromZones?: ZoneName[]
  draggable?: boolean
  isOpponent?: boolean
  label?: string
  separateLands?: boolean
}

export function BattlefieldZone({
  cards,
  selectedCardId,
  onCardClick,
  onCardDoubleClick,
  tappedCardIds = new Set(),
  validFromZones = ['hand', 'graveyard', 'exile'],
  draggable = true,
  isOpponent = false,
  label,
  separateLands = false,
}: BattlefieldZoneProps) {
  const lands = separateLands ? cards.filter(isLand) : []
  const permanents = separateLands ? cards.filter((c) => !isLand(c)) : cards

  const renderCard = (card: CardType) => (
    <DraggableCard
      key={card.id}
      card={card}
      zone="battlefield"
      size="md"
      selected={card.id === selectedCardId}
      tapped={tappedCardIds.has(card.id)}
      onClick={() => onCardClick?.(card)}
      onDoubleClick={() => onCardDoubleClick?.(card)}
      disabled={!draggable || isOpponent}
    />
  )

  return (
    <DroppableZone
      zone="battlefield"
      validFromZones={validFromZones}
      disabled={isOpponent}
      className="battlefield flex-1 p-4"
    >
      {label && (
        <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide">
          {label}
        </div>
      )}
      <div className="flex flex-col gap-2 min-h-[120px]">
        {/* Permanents (non-lands) */}
        <div className="flex flex-wrap gap-3">
          {permanents.length === 0 && lands.length === 0 ? (
            <div className="text-gray-500 text-sm opacity-50">
              {isOpponent ? "Opponent's battlefield" : 'Drag cards here'}
            </div>
          ) : (
            permanents.map(renderCard)
          )}
        </div>
        {/* Lands (separate row if enabled) */}
        {separateLands && lands.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-700/50">
            {lands.map(renderCard)}
          </div>
        )}
      </div>
    </DroppableZone>
  )
}
