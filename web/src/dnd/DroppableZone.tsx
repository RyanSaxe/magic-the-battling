import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import type { ZoneName } from '../types'
import { useGameDnd } from './useGameDnd'
import { makeZoneId, type ZoneOwner } from './types'

interface DroppableZoneProps {
  zone: ZoneName
  zoneOwner?: ZoneOwner
  children: ReactNode
  className?: string
  validFromZones?: ZoneName[]
  disabled?: boolean
}

export function DroppableZone({
  zone,
  zoneOwner = 'player',
  children,
  className = '',
  validFromZones,
  disabled = false,
}: DroppableZoneProps) {
  const { activeFromZone } = useGameDnd()

  const zoneId = makeZoneId(zone, zoneOwner)
  const { setNodeRef, isOver } = useDroppable({
    id: zoneId,
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
