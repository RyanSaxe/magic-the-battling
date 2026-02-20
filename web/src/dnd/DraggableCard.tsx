import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Card as CardType, ZoneName } from '../types'
import { Card } from '../components/card'
import { makeZoneId, type DragData, type ZoneOwner } from './types'

interface DraggableCardProps {
  card: CardType
  zone: ZoneName
  zoneOwner?: ZoneOwner
  onClick?: () => void
  onDoubleClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  onCardHover?: (cardId: string, zone: ZoneName) => void
  onCardHoverEnd?: () => void
  selected?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
  dimensions?: { width: number; height: number }
  tapped?: boolean
  faceDown?: boolean
  counters?: Record<string, number>
  glow?: 'none' | 'gold' | 'green' | 'red'
  disabled?: boolean
  isOpponent?: boolean
  isCompanion?: boolean
  upgraded?: boolean
  appliedUpgrades?: CardType[]
  style?: React.CSSProperties
}

export function DraggableCard({
  card,
  zone,
  zoneOwner = 'player',
  onClick,
  onDoubleClick,
  onContextMenu,
  onCardHover,
  onCardHoverEnd,
  selected,
  size = 'md',
  dimensions,
  tapped,
  faceDown,
  counters,
  glow,
  disabled = false,
  isOpponent = false,
  isCompanion = false,
  upgraded = false,
  appliedUpgrades,
  style: externalStyle,
}: DraggableCardProps) {
  const zoneId = makeZoneId(zone, zoneOwner)
  const dragData: DragData = { card, fromZone: zone, fromZoneId: zoneId, isOpponent }

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${zoneId}-${card.id}`,
    data: dragData,
    disabled,
  })

  const style = {
    ...externalStyle,
    ...(transform ? { transform: CSS.Translate.toString(transform) } : undefined),
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button')) {
          onClick?.()
        }
      }}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onCardHover ? () => onCardHover(card.id, zone) : undefined}
      onMouseLeave={onCardHoverEnd}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu?.(e)
      }}
    >
      <Card
        card={card}
        selected={selected}
        size={size}
        dimensions={dimensions}
        tapped={tapped}
        faceDown={faceDown}
        counters={counters}
        glow={glow}
        dragging={isDragging}
        isCompanion={isCompanion}
        upgraded={upgraded}
        appliedUpgrades={appliedUpgrades}
      />
    </div>
  )
}
