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
  selected?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
  tapped?: boolean
  faceDown?: boolean
  counters?: Record<string, number>
  glow?: 'none' | 'gold' | 'green' | 'red'
  disabled?: boolean
  isOpponent?: boolean
  isCompanion?: boolean
}

export function DraggableCard({
  card,
  zone,
  zoneOwner = 'player',
  onClick,
  onDoubleClick,
  onContextMenu,
  selected,
  size = 'md',
  tapped,
  faceDown,
  counters,
  glow,
  disabled = false,
  isOpponent = false,
  isCompanion = false,
}: DraggableCardProps) {
  const zoneId = makeZoneId(zone, zoneOwner)
  const dragData: DragData = { card, fromZone: zone, fromZoneId: zoneId, isOpponent }

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${zoneId}-${card.id}`,
    data: dragData,
    disabled,
  })

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
      }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu?.(e)
      }}
    >
      <Card
        card={card}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        selected={selected}
        size={size}
        tapped={tapped}
        faceDown={faceDown}
        counters={counters}
        glow={glow}
        dragging={isDragging}
        isCompanion={isCompanion}
      />
    </div>
  )
}
