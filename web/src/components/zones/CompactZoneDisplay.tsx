import { useState } from 'react'
import type { Card as CardType, ZoneName } from '../../types'
import { DraggableCard, DroppableZone, useGameDnd } from '../../dnd'
import { Card } from '../card'
import { ZoneModal } from '../sidebar/DroppableZoneDisplay'
import { makeZoneId } from '../../dnd/types'

const CARD_ASPECT = 5 / 7
const LABEL_HEIGHT = 16

interface CompactZoneDisplayProps {
  title: string
  zone: ZoneName
  cards: CardType[]
  height: number
  width: number
  isOpponent?: boolean
  canManipulateOpponent?: boolean
  validFromZones: ZoneName[]
  onCardHover?: (cardId: string, zone: ZoneName) => void
  onCardHoverEnd?: () => void
  canPeekFaceDown?: boolean
}

export function CompactZoneDisplay({
  title,
  zone,
  cards,
  height,
  width,
  isOpponent = false,
  canManipulateOpponent = false,
  validFromZones,
  onCardHover,
  onCardHoverEnd,
  canPeekFaceDown,
}: CompactZoneDisplayProps) {
  const [showModal, setShowModal] = useState(false)
  const allowInteraction = !isOpponent || canManipulateOpponent
  const zoneOwner = isOpponent ? 'opponent' : 'player' as const

  const { activeCard, activeFromZoneId } = useGameDnd()
  const thisZoneId = makeZoneId(zone, zoneOwner)
  const topCard = cards[cards.length - 1]
  const isDraggingTopCard = activeCard?.id === topCard?.id && activeFromZoneId === thisZoneId
  const nextCard = isDraggingTopCard ? cards[cards.length - 2] : null

  const availW = width - 4
  const availH = height - LABEL_HEIGHT
  const cardW = Math.floor(Math.min(availW, availH * CARD_ASPECT))
  const cardH = Math.floor(cardW / CARD_ASPECT)

  const label = (
    <div className="flex items-center justify-center gap-0.5 bg-black/70 rounded px-1 shrink-0" style={{ height: LABEL_HEIGHT }}>
      <span className="text-[7px] uppercase text-gray-300 font-medium leading-none">{title}</span>
      {cards.length >= 2 && (
        <span className="text-[9px] font-bold text-white leading-none">{cards.length}</span>
      )}
    </div>
  )

  return (
    <>
      <DroppableZone
        zone={zone}
        zoneOwner={zoneOwner}
        validFromZones={validFromZones}
        disabled={!allowInteraction}
      >
        <div
          onClick={() => cards.length > 0 && setShowModal(true)}
          className={`flex flex-col items-center overflow-hidden rounded border border-gray-700 ${
            cards.length > 0
              ? 'hover:border-gray-500 cursor-pointer'
              : 'border-dashed cursor-default'
          }`}
          style={{ width, height }}
        >
          {!isOpponent && label}
          <div className="flex-1 flex items-center justify-center min-h-0 relative">
            {nextCard && (
              <div className="absolute">
                <Card card={nextCard} dimensions={{ width: cardW, height: cardH }} />
              </div>
            )}
            {topCard && (
              <DraggableCard
                card={topCard}
                zone={zone}
                zoneOwner={zoneOwner}
                dimensions={{ width: cardW, height: cardH }}
                disabled={!allowInteraction}
                isOpponent={isOpponent}
                onCardHover={allowInteraction ? onCardHover : undefined}
                onCardHoverEnd={allowInteraction ? onCardHoverEnd : undefined}
                canPeekFaceDown={canPeekFaceDown}
              />
            )}
          </div>
          {isOpponent && label}
        </div>
      </DroppableZone>

      {showModal && (
        <ZoneModal
          title={title}
          zone={zone}
          cards={cards}
          allowInteraction={allowInteraction}
          isOpponent={isOpponent}
          onClose={() => setShowModal(false)}
          onCardHover={onCardHover}
          onCardHoverEnd={onCardHoverEnd}
        />
      )}
    </>
  )
}
