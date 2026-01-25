import { createContext, useContext } from 'react'
import type { Card, ZoneName } from '../types'

export interface GameDndContextValue {
  activeCard: Card | null
  activeFromZone: ZoneName | null
}

export const GameDndContext = createContext<GameDndContextValue>({
  activeCard: null,
  activeFromZone: null,
})

export function useGameDnd() {
  return useContext(GameDndContext)
}
