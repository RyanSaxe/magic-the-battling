import { useState } from 'react'
import type { Card as CardType, ZoneName } from '../../types'
import type { ZoneOwner } from '../../dnd/types'
import { DraggableCard, DroppableZone, useGameDnd } from '../../dnd'
import { Card } from '../card'
import { ZoneModal } from '../sidebar/DroppableZoneDisplay'
import { makeDraggableId } from '../../dnd/types'
import { canInteractWithBattleCard, canInteractWithBattleZone } from '../../utils/battleInteraction'

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
  upgradedCardIds?: Set<string>
  upgradesByCardId?: Map<string, CardType[]>
  hiddenUpgradesByCardId?: Map<string, CardType[]>
  onRevealHiddenUpgrades?: (cardId: string) => void
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
  upgradedCardIds,
  upgradesByCardId,
  hiddenUpgradesByCardId,
  onRevealHiddenUpgrades,
}: CompactZoneDisplayProps) {
  const [uncontrolledModalOpen, setUncontrolledModalOpen] = useState(false)
  const zoneOwner = isOpponent ? 'opponent' : 'player' as const
  const allowZoneInteraction = canInteractWithBattleZone({
    owner: zoneOwner,
    zone,
    canManipulateOpponent,
  })
  const showModal = isModalOpen ?? uncontrolledModalOpen
  const setShowModal = onModalOpenChange ?? setUncontrolledModalOpen

  const { activeDraggableId } = useGameDnd()
  const topCard = cards[cards.length - 1]
  const topCardDraggableId = topCard
    ? makeDraggableId(zone, zoneOwner, topCard.id, 'compact')
    : null
  const isDraggingTopCard = activeDraggableId !== null && activeDraggableId === topCardDraggableId
  const nextCard = isDraggingTopCard ? cards[cards.length - 2] : null
  const allowCardInteraction = canInteractWithBattleCard({
    owner: zoneOwner,
    zone,
    canManipulateOpponent,
    isFaceDown: forceFaceDown,
  })

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
        disabled={!allowZoneInteraction}
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
                  upgraded={upgradedCardIds?.has(nextCard.id)}
                  appliedUpgrades={upgradesByCardId?.get(nextCard.id)}
                  hiddenUpgradeCount={(hiddenUpgradesByCardId?.get(nextCard.id) ?? []).length}
                  onRevealHiddenUpgrades={onRevealHiddenUpgrades ? () => onRevealHiddenUpgrades(nextCard.id) : undefined}
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
                disabled={!allowCardInteraction}
                isOpponent={isOpponent}
                onCardHover={allowCardInteraction ? onCardHover : undefined}
                onCardHoverEnd={allowCardInteraction ? onCardHoverEnd : undefined}
                faceDown={forceFaceDown}
                canPeekFaceDown={forceFaceDown ? false : canPeekFaceDown}
                upgraded={upgradedCardIds?.has(topCard.id)}
                appliedUpgrades={upgradesByCardId?.get(topCard.id)}
                hiddenUpgradeCount={(hiddenUpgradesByCardId?.get(topCard.id) ?? []).length}
                onRevealHiddenUpgrades={onRevealHiddenUpgrades ? () => onRevealHiddenUpgrades(topCard.id) : undefined}
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
          allowZoneInteraction={allowZoneInteraction}
          allowCardInteraction={allowCardInteraction}
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
          upgradedCardIds={upgradedCardIds}
          appliedUpgradesByCardId={upgradesByCardId}
          hiddenUpgradesByCardId={hiddenUpgradesByCardId}
          onRevealHiddenUpgrades={onRevealHiddenUpgrades}
        />
      )}
    </>
  )
}
