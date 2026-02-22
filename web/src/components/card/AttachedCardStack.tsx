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

const PEEK_FRACTION = 0.15
const ASPECT_RATIO = 7 / 5

const SIZE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  xs: { width: 50, height: 70 },
  sm: { width: 80, height: 112 },
  md: { width: 130, height: 182 },
  lg: { width: 200, height: 280 },
}

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
  const baseDims = dimensions ?? SIZE_DIMENSIONS[size]
  const n = attachedCards.length

  const scaledHeight = Math.round(baseDims.height / (1 + n * PEEK_FRACTION))
  const scaledWidth = Math.round(scaledHeight / ASPECT_RATIO)
  const offset = Math.round(scaledHeight * PEEK_FRACTION)
  const leftOffset = Math.round((baseDims.width - scaledWidth) / 2)
  const scaledDims = { width: scaledWidth, height: scaledHeight }

  return (
    <div
      className="relative"
      style={{ width: baseDims.width, height: baseDims.height }}
    >
      {attachedCards.map((card, index) => (
        <div
          key={card.id}
          className="absolute"
          style={{
            top: index * offset,
            left: leftOffset,
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
            dimensions={scaledDims}
            tapped={attachedTappedIds.has(card.id)}
            counters={attachedCounters[card.id]}
            selected={card.id === selectedCardId}
            onClick={() => onCardClick?.(card)}
            onDoubleClick={() => onCardDoubleClick?.(card)}
            upgraded={upgradedCardIds.has(card.id)}
            appliedUpgrades={upgradesByCardId?.get(card.id)}
          />
        </div>
      ))}
      <div
        className="absolute"
        style={{
          top: n * offset,
          left: leftOffset,
          zIndex: n,
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onCardContextMenu?.(e, parentCard)
        }}
      >
        <Card
          card={parentCard}
          dimensions={scaledDims}
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
