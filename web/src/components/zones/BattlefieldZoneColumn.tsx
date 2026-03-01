import type { Zones, Card as CardType, ZoneName } from '../../types'
import type { ZoneOwner } from '../../dnd/types'
import { CompactZoneDisplay } from './CompactZoneDisplay'

const VALID_FROM_ZONES: ZoneName[] = [
  'hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone',
]

interface BattlefieldZoneColumnProps {
  zones: Zones
  isOpponent?: boolean
  canManipulateOpponent?: boolean
  rowHeight: number
  columnWidth: number
  onCardHover?: (cardId: string, zone: ZoneName) => void
  onCardHoverEnd?: () => void
  canPeekFaceDown?: boolean
  selectedCardId?: string
  onZoneClick?: (toZone: ZoneName, toOwner: ZoneOwner) => void
  onCardClick?: (card: CardType, zone: ZoneName, owner: ZoneOwner) => void
}

export function BattlefieldZoneColumn({
  zones,
  isOpponent = false,
  canManipulateOpponent = false,
  rowHeight,
  columnWidth,
  onCardHover,
  onCardHoverEnd,
  canPeekFaceDown,
  selectedCardId,
  onZoneClick,
  onCardClick,
}: BattlefieldZoneColumnProps) {
  const zoneOwner = isOpponent ? 'opponent' : 'player' as const
  return (
    <div
      className={`flex shrink-0 ${isOpponent ? 'flex-col-reverse' : 'flex-col'}`}
      style={{ width: columnWidth }}
    >
      <CompactZoneDisplay
        title="Graveyard"
        zone="graveyard"
        cards={zones.graveyard}
        height={rowHeight}
        width={columnWidth}
        isOpponent={isOpponent}
        canManipulateOpponent={canManipulateOpponent}
        validFromZones={VALID_FROM_ZONES}
        onCardHover={onCardHover}
        onCardHoverEnd={onCardHoverEnd}
        canPeekFaceDown={canPeekFaceDown}
        selectedCardId={selectedCardId}
        onZoneClick={onZoneClick ? () => onZoneClick('graveyard', zoneOwner) : undefined}
        onCardClick={onCardClick}
      />
      <CompactZoneDisplay
        title="Exile"
        zone="exile"
        cards={zones.exile}
        height={rowHeight}
        width={columnWidth}
        isOpponent={isOpponent}
        canManipulateOpponent={canManipulateOpponent}
        validFromZones={VALID_FROM_ZONES}
        onCardHover={onCardHover}
        onCardHoverEnd={onCardHoverEnd}
        canPeekFaceDown={canPeekFaceDown}
        selectedCardId={selectedCardId}
        onZoneClick={onZoneClick ? () => onZoneClick('exile', zoneOwner) : undefined}
        onCardClick={onCardClick}
      />
    </div>
  )
}
