import type { Zones, ZoneName } from '../../types'
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
}: BattlefieldZoneColumnProps) {
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
      />
    </div>
  )
}
