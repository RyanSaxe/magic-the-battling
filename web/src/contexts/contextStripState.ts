import { createContext, useContext } from 'react'
import type { Card, PlayerView } from '../types'

export interface ContextStripState {
  previewCard: Card | null
  revealedPlayer: PlayerView | null
}

export interface ContextStripContextValue {
  state: ContextStripState
  setPreviewCard: (card: Card | null) => void
  setRevealedPlayer: (player: PlayerView | null) => void
}

export const ContextStripContext = createContext<ContextStripContextValue | null>(null)

export function useContextStrip() {
  const context = useContext(ContextStripContext)
  if (!context) {
    throw new Error('useContextStrip must be used within a ContextStripProvider')
  }
  return context
}
