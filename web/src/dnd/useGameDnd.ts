import { createContext, useContext } from 'react'
import type { Card, ZoneName } from '../types'

export interface GameDndContextValue {
  activeCard: Card | null
  activeFromZone: ZoneName | null
  activeFromZoneId: string | null
  activeDraggableId: string | null
}

export const GameDndContext = createContext<GameDndContextValue>({
  activeCard: null,
  activeFromZone: null,
  activeFromZoneId: null,
  activeDraggableId: null,
})

export function useGameDnd() {
  return useContext(GameDndContext)
}
