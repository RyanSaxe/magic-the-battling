import type { Card as CardType } from '../../types'
import { Card } from './Card'

interface AttachedCardStackProps {
  parentCard: CardType
  attachedCards: CardType[]
  size?: 'xs' | 'sm' | 'md' | 'lg'
  dimensions?: { width: number; height: number }
  parentTapped?: boolean
  parentCounters?: Record<string, number>
  attachedTappedIds?: Set<string>
  attachedCounters?: Record<string, Record<string, number>>
  selectedCardId?: string
  onCardClick?: (card: CardType) => void
  onCardDoubleClick?: (card: CardType) => void
  onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void
  upgradedCardIds?: Set<string>
  upgradesByCardId?: Map<string, CardType[]>
}

const ATTACHMENT_OFFSET = 20

export function AttachedCardStack({
  parentCard,
  attachedCards,
  size = 'md',
  dimensions,
  parentTapped = false,
  parentCounters,
  attachedTappedIds = new Set(),
  attachedCounters = {},
  selectedCardId,
  onCardClick,
  onCardDoubleClick,
  onCardContextMenu,
  upgradedCardIds = new Set(),
  upgradesByCardId,
}: AttachedCardStackProps) {
  const totalOffset = attachedCards.length * ATTACHMENT_OFFSET

  return (
    <div
      className="relative"
      style={{ marginTop: totalOffset }}
    >
      {attachedCards.map((card, index) => {
        const offset = (attachedCards.length - index) * ATTACHMENT_OFFSET
        return (
          <div
            key={card.id}
            className="absolute"
            style={{
              top: -offset,
              left: 0,
              zIndex: index,
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onCardContextMenu?.(e, card)
            }}
          >
            <Card
              card={card}
              size={size}
              dimensions={dimensions}
              tapped={attachedTappedIds.has(card.id)}
              counters={attachedCounters[card.id]}
              selected={card.id === selectedCardId}
              onClick={() => onCardClick?.(card)}
              onDoubleClick={() => onCardDoubleClick?.(card)}
              upgraded={upgradedCardIds.has(card.id)}
              appliedUpgrades={upgradesByCardId?.get(card.id)}
            />
          </div>
        )
      })}
      <div
        className="relative"
        style={{ zIndex: attachedCards.length }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onCardContextMenu?.(e, parentCard)
        }}
      >
        <Card
          card={parentCard}
          size={size}
          dimensions={dimensions}
          tapped={parentTapped}
          counters={parentCounters}
          selected={parentCard.id === selectedCardId}
          onClick={() => onCardClick?.(parentCard)}
          onDoubleClick={() => onCardDoubleClick?.(parentCard)}
          upgraded={upgradedCardIds.has(parentCard.id)}
          appliedUpgrades={upgradesByCardId?.get(parentCard.id)}
        />
      </div>
    </div>
  )
}
