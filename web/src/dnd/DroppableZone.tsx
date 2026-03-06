import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import type { ZoneName } from '../types'
import { useGameDnd } from './useGameDnd'
import { makeZoneId, parseZoneId, type ZoneOwner } from './types'

interface DroppableZoneProps {
  zone: ZoneName
  zoneOwner?: ZoneOwner
  children: ReactNode
  className?: string
  style?: React.CSSProperties
  validFromZones?: ZoneName[]
  disabled?: boolean
  idPrefix?: string
}

export function DroppableZone({
  zone,
  zoneOwner = 'player',
  children,
  className = '',
  style,
  validFromZones,
  disabled = false,
  idPrefix,
}: DroppableZoneProps) {
  const { activeFromZone, activeFromZoneId } = useGameDnd()

  const zoneId = makeZoneId(zone, zoneOwner, idPrefix)
  const baseZoneId = makeZoneId(zone, zoneOwner)
  const { setNodeRef, isOver } = useDroppable({
    id: zoneId,
    disabled,
  })

  const activeBaseZoneId = activeFromZoneId ? makeZoneId(parseZoneId(activeFromZoneId).zone, parseZoneId(activeFromZoneId).owner) : null
  const isSameZone = activeBaseZoneId === baseZoneId

  const isValidDrop = activeFromZone !== null && (
    !validFromZones || validFromZones.includes(activeFromZone)
  ) && !isSameZone

  const isInvalidDrop = activeFromZone !== null && !isValidDrop && !isSameZone

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
      style={style}
      data-zone={zone}
      data-zone-owner={zoneOwner}
    >
      {children}
    </div>
  )
}
