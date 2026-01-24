import type { Card, ZoneName } from '../types'

export interface DragData {
  card: Card
  fromZone: ZoneName
}

export interface DropData {
  zone: ZoneName
}
