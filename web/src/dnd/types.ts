import type { Card, ZoneName } from '../types'

export interface DragData {
  card: Card
  fromZone: ZoneName
  isOpponent?: boolean
}

export interface DropData {
  zone: ZoneName
}
