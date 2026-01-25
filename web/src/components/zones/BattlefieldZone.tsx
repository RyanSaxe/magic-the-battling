import type { Card as CardType, ZoneName } from '../../types'
import { DraggableCard, DroppableZone } from '../../dnd'
import { AttachedCardStack } from '../card'

const isLandOrTreasure = (card: CardType) =>
  card.type_line.toLowerCase().includes('land') ||
  card.type_line.toLowerCase().includes('treasure')

interface BattlefieldZoneProps {
  cards: CardType[]
  selectedCardId?: string
  onCardClick?: (card: CardType) => void
  onCardDoubleClick?: (card: CardType) => void
  onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void
  tappedCardIds?: Set<string>
  faceDownCardIds?: Set<string>
  counters?: Record<string, Record<string, number>>
  attachments?: Record<string, string[]>
  validFromZones?: ZoneName[]
  draggable?: boolean
  isOpponent?: boolean
  label?: string
  separateLands?: boolean
  cardSize?: 'xs' | 'sm' | 'md' | 'lg'
}

export function BattlefieldZone({
  cards,
  selectedCardId,
  onCardClick,
  onCardDoubleClick,
  onCardContextMenu,
  tappedCardIds = new Set(),
  faceDownCardIds = new Set(),
  counters = {},
  attachments = {},
  validFromZones = ['hand', 'graveyard', 'exile'],
  draggable = true,
  isOpponent = false,
  label,
  separateLands = false,
  cardSize = 'sm',
}: BattlefieldZoneProps) {
  const attachedCardIds = new Set(Object.values(attachments).flat())
  const topLevelCards = cards.filter(c => !attachedCardIds.has(c.id))

  const lands = separateLands ? topLevelCards.filter(isLandOrTreasure) : []
  const permanents = separateLands ? topLevelCards.filter((c) => !isLandOrTreasure(c)) : topLevelCards

  const getAttachedCards = (parentId: string): CardType[] => {
    const childIds = attachments[parentId] || []
    return childIds.map(id => cards.find(c => c.id === id)).filter((c): c is CardType => !!c)
  }

  const renderCard = (card: CardType) => {
    const attachedCards = getAttachedCards(card.id)

    if (attachedCards.length > 0) {
      return (
        <AttachedCardStack
          key={card.id}
          parentCard={card}
          attachedCards={attachedCards}
          size={cardSize}
          parentTapped={tappedCardIds.has(card.id)}
          parentFaceDown={faceDownCardIds.has(card.id)}
          parentCounters={counters[card.id]}
          attachedTappedIds={tappedCardIds}
          attachedFaceDownIds={faceDownCardIds}
          attachedCounters={counters}
          selectedCardId={selectedCardId}
          onCardClick={onCardClick}
          onCardDoubleClick={onCardDoubleClick}
          onCardContextMenu={onCardContextMenu}
        />
      )
    }

    return (
      <div
        key={card.id}
        onContextMenu={(e) => {
          if (!isOpponent) {
            e.preventDefault()
            onCardContextMenu?.(e, card)
          }
        }}
      >
        <DraggableCard
          card={card}
          zone="battlefield"
          size={cardSize}
          selected={card.id === selectedCardId}
          tapped={tappedCardIds.has(card.id)}
          faceDown={faceDownCardIds.has(card.id)}
          counters={counters[card.id]}
          onClick={() => onCardClick?.(card)}
          onDoubleClick={() => onCardDoubleClick?.(card)}
          disabled={!draggable || isOpponent}
        />
      </div>
    )
  }

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
        <div className="flex justify-center flex-wrap gap-3">
          {permanents.length === 0 && lands.length === 0 ? (
            <div className="text-gray-500 text-sm opacity-50">
              {isOpponent ? "Opponent's battlefield" : 'Drag cards here'}
            </div>
          ) : (
            permanents.map(renderCard)
          )}
        </div>
        {/* Lands (separate row if enabled, always visible) */}
        {separateLands && (
          <div className="flex justify-center flex-wrap gap-2 pt-2 border-t border-gray-700/50 min-h-[50px]">
            {lands.length > 0 ? (
              lands.map(renderCard)
            ) : (
              <div className="text-gray-600 text-xs border border-dashed border-gray-700 rounded px-3 py-2">
                Lands
              </div>
            )}
          </div>
        )}
      </div>
    </DroppableZone>
  )
}
