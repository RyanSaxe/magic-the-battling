import type { Card as CardType } from '../../types'
import { Card } from './Card'

interface AttachedCardStackProps {
  parentCard: CardType
  attachedCards: CardType[]
  size?: 'sm' | 'md' | 'lg'
  parentTapped?: boolean
  parentFlipped?: boolean
  parentFaceDown?: boolean
  parentCounters?: Record<string, number>
  attachedTappedIds?: Set<string>
  attachedFlippedIds?: Set<string>
  attachedFaceDownIds?: Set<string>
  attachedCounters?: Record<string, Record<string, number>>
  selectedCardId?: string
  onCardClick?: (card: CardType) => void
  onCardDoubleClick?: (card: CardType) => void
  onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void
}

const ATTACHMENT_OFFSET = 20

export function AttachedCardStack({
  parentCard,
  attachedCards,
  size = 'md',
  parentTapped = false,
  _parentFlipped = false,
  parentFaceDown = false,
  parentCounters,
  attachedTappedIds = new Set(),
  _attachedFlippedIds = new Set(),
  attachedFaceDownIds = new Set(),
  attachedCounters = {},
  selectedCardId,
  onCardClick,
  onCardDoubleClick,
  onCardContextMenu,
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
              tapped={attachedTappedIds.has(card.id)}
              faceDown={attachedFaceDownIds.has(card.id)}
              counters={attachedCounters[card.id]}
              selected={card.id === selectedCardId}
              onClick={() => onCardClick?.(card)}
              onDoubleClick={() => onCardDoubleClick?.(card)}
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
          tapped={parentTapped}
          faceDown={parentFaceDown}
          counters={parentCounters}
          selected={parentCard.id === selectedCardId}
          onClick={() => onCardClick?.(parentCard)}
          onDoubleClick={() => onCardDoubleClick?.(parentCard)}
        />
      </div>
    </div>
  )
}
