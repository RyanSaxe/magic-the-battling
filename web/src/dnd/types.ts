import type { Card, ZoneName } from '../types'

export type ZoneOwner = 'player' | 'opponent'

export function makeZoneId(zone: ZoneName, owner: ZoneOwner = 'player'): string {
  return `${owner}-${zone}`
}

export function parseZoneId(zoneId: string): { zone: ZoneName; owner: ZoneOwner } {
  const [owner, ...zoneParts] = zoneId.split('-')
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
}

export interface DropData {
  zone: ZoneName
}
