import { useState } from 'react'
import type { Card as CardType, ZoneName } from '../../types'
import type { ZoneOwner } from '../../dnd/types'
import { DraggableCard, DroppableZone, useGameDnd } from '../../dnd'
import { Card } from '../card'
import { ZoneModal } from '../sidebar/DroppableZoneDisplay'
import { makeDraggableId } from '../../dnd/types'

const CARD_ASPECT = 5 / 7
const LABEL_HEIGHT = 18

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
  selectedCardId?: string
  onZoneClick?: () => void
  onCardClick?: (card: CardType, zone: ZoneName, owner: ZoneOwner) => void
  containerClassName?: string
  forceFaceDown?: boolean
  isModalOpen?: boolean
  onModalOpenChange?: (open: boolean) => void
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void
  modalHeaderActions?: React.ReactNode
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
  selectedCardId,
  onZoneClick,
  onCardClick,
  containerClassName,
  forceFaceDown = false,
  isModalOpen,
  onModalOpenChange,
  onContextMenu,
  modalHeaderActions,
}: CompactZoneDisplayProps) {
  const [uncontrolledModalOpen, setUncontrolledModalOpen] = useState(false)
  const allowInteraction = !isOpponent || canManipulateOpponent
  const zoneOwner = isOpponent ? 'opponent' : 'player' as const
  const showModal = isModalOpen ?? uncontrolledModalOpen
  const setShowModal = onModalOpenChange ?? setUncontrolledModalOpen

  const { activeDraggableId } = useGameDnd()
  const topCard = cards[cards.length - 1]
  const topCardDraggableId = topCard
    ? makeDraggableId(zone, zoneOwner, topCard.id, 'compact')
    : null
  const isDraggingTopCard = activeDraggableId !== null && activeDraggableId === topCardDraggableId
  const nextCard = isDraggingTopCard ? cards[cards.length - 2] : null

  const availW = width - 4
  const availH = height - LABEL_HEIGHT
  const cardW = Math.floor(Math.min(availW, availH * CARD_ASPECT))
  const cardH = Math.floor(cardW / CARD_ASPECT)

  const label = (
    <div className="flex items-center justify-center gap-0 px-0.5 shrink-0" style={{ height: LABEL_HEIGHT }}>
      <span className="battle-side-label truncate">{title}</span>
    </div>
  )

  return (
    <>
      <DroppableZone
        zone={zone}
        zoneOwner={zoneOwner}
        validFromZones={validFromZones}
        disabled={!allowInteraction}
        className="box-border shrink-0 battle-side-dropzone"
        style={{ width, height }}
      >
        <div
          onContextMenu={onContextMenu}
          onClick={(e) => {
            if (selectedCardId && onZoneClick) {
              e.stopPropagation()
              onZoneClick()
              return
            }
            if (cards.length > 0) setShowModal(true)
          }}
          className={`flex flex-col items-center overflow-hidden ${
            cards.length > 0
              ? 'cursor-pointer'
              : 'cursor-default'
          } ${containerClassName ?? ''} w-full h-full`}
        >
          {label}
          <div className="flex-1 flex items-center justify-center min-h-0 relative">
            {nextCard && (
              <div className="absolute">
                <Card
                  card={nextCard}
                  dimensions={{ width: cardW, height: cardH }}
                  faceDown={forceFaceDown}
                />
              </div>
            )}
            {topCard && (
              <DraggableCard
                card={topCard}
                zone={zone}
                zoneOwner={zoneOwner}
                dragInstanceKey="compact"
                dimensions={{ width: cardW, height: cardH }}
                disabled={!allowInteraction}
                isOpponent={isOpponent}
                onCardHover={allowInteraction ? onCardHover : undefined}
                onCardHoverEnd={allowInteraction ? onCardHoverEnd : undefined}
                faceDown={forceFaceDown}
                canPeekFaceDown={forceFaceDown ? false : canPeekFaceDown}
              />
            )}
          </div>
        </div>
      </DroppableZone>

      {showModal && (
        <ZoneModal
          title={title}
          zone={zone}
          cards={cards}
          allowInteraction={allowInteraction}
          isOpponent={isOpponent}
          tone="battle"
          hideTitle
          headerActions={modalHeaderActions}
          onClose={() => setShowModal(false)}
          onCardHover={onCardHover}
          onCardHoverEnd={onCardHoverEnd}
          onCardClick={onCardClick}
          selectedCardId={selectedCardId}
          forceFaceDown={forceFaceDown}
        />
      )}
    </>
  )
}
