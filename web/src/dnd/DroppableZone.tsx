import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import type { ZoneName } from '../types'
import { useGameDnd } from './useGameDnd'

interface DroppableZoneProps {
  zone: ZoneName
  children: ReactNode
  className?: string
  validFromZones?: ZoneName[]
  disabled?: boolean
}

export function DroppableZone({
  zone,
  children,
  className = '',
  validFromZones,
  disabled = false,
}: DroppableZoneProps) {
  const { activeFromZone } = useGameDnd()

  const { setNodeRef, isOver } = useDroppable({
    id: zone,
    disabled,
  })

  const isValidDrop = activeFromZone !== null && (
    !validFromZones || validFromZones.includes(activeFromZone)
  ) && activeFromZone !== zone

  const isInvalidDrop = activeFromZone !== null && !isValidDrop && activeFromZone !== zone

  const dropStateClass = isOver
    ? isValidDrop
      ? 'drop-valid'
      : isInvalidDrop
        ? 'drop-invalid'
        : ''
    : ''

  return (
    <div
      ref={setNodeRef}
      className={`zone ${dropStateClass} ${className}`}
    >
      {children}
    </div>
  )
}
