import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Card as CardType, ZoneName } from '../types'
import { Card } from '../components/card'
import type { DragData } from './types'

interface DraggableCardProps {
  card: CardType
  zone: ZoneName
  onClick?: () => void
  onDoubleClick?: () => void
  selected?: boolean
  size?: 'sm' | 'md' | 'lg'
  tapped?: boolean
  counters?: Record<string, number>
  glow?: 'none' | 'gold' | 'green' | 'red'
  disabled?: boolean
}

export function DraggableCard({
  card,
  zone,
  onClick,
  onDoubleClick,
  selected,
  size = 'md',
  tapped,
  counters,
  glow,
  disabled = false,
}: DraggableCardProps) {
  const dragData: DragData = { card, fromZone: zone }

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${zone}-${card.id}`,
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
    >
      <Card
        card={card}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        selected={selected}
        size={size}
        tapped={tapped}
        counters={counters}
        glow={glow}
        dragging={isDragging}
      />
    </div>
  )
}
