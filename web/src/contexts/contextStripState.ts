import { createContext, useContext } from 'react'
import type { Card } from '../types'

export type RevealedPlayerTab = 'seen' | 'overview'

export interface ContextStripState {
  previewCard: Card | null
  previewAppliedUpgrades: Card[]
  revealedPlayerName: string | null
  revealedPlayerTab: RevealedPlayerTab
}

export interface ContextStripContextValue {
  state: ContextStripState
  setPreviewCard: (card: Card | null, appliedUpgrades?: Card[]) => void
  setRevealedPlayerName: (name: string | null, tab?: RevealedPlayerTab) => void
  setRevealedPlayerTab: (tab: RevealedPlayerTab) => void
}

export const ContextStripContext = createContext<ContextStripContextValue | null>(null)

export function useContextStrip() {
  const context = useContext(ContextStripContext)
  if (!context) {
    throw new Error('useContextStrip must be used within a ContextStripProvider')
  }
  return context
}
