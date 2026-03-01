import type { Card, ZoneName } from '../types'

export type ZoneOwner = 'player' | 'opponent'

export function makeZoneId(zone: ZoneName, owner: ZoneOwner = 'player', prefix?: string): string {
  const base = `${owner}-${zone}`
  return prefix ? `${prefix}:${base}` : base
}

export function parseZoneId(zoneId: string): { zone: ZoneName; owner: ZoneOwner } {
  const raw = zoneId.includes(':') ? zoneId.split(':')[1] : zoneId
  const [owner, ...zoneParts] = raw.split('-')
  return {
    owner: owner as ZoneOwner,
    zone: zoneParts.join('-') as ZoneName,
  }
}

export interface DragData {
  card: Card
  fromZone: ZoneName
  fromZoneId: string
  isOpponent?: boolean
  faceDown?: boolean
}

export interface DropData {
  zone: ZoneName
}
