import { useState, useCallback, type ReactNode } from 'react'
import type { Card } from '../types'
import { ContextStripContext } from './contextStripState'
import type { RevealedPlayerTab } from './contextStripState'

export function ContextStripProvider({ children }: { children: ReactNode }) {
  const [previewCard, setPreviewCardState] = useState<Card | null>(null)
  const [previewAppliedUpgrades, setPreviewAppliedUpgrades] = useState<Card[]>([])
  const [revealedPlayerName, setRevealedPlayerName] = useState<string | null>(null)
  const [revealedPlayerTab, setRevealedPlayerTab] = useState<RevealedPlayerTab>('seen')

  const setPreviewCard = useCallback((card: Card | null, appliedUpgrades?: Card[]) => {
    setPreviewCardState(card)
    setPreviewAppliedUpgrades(appliedUpgrades ?? [])
  }, [])

  const setRevealedPlayer = useCallback((name: string | null, tab: RevealedPlayerTab = 'seen') => {
    setRevealedPlayerName(name)
    setRevealedPlayerTab(tab)
  }, [])

  return (
    <ContextStripContext.Provider
      value={{
        state: { previewCard, previewAppliedUpgrades, revealedPlayerName, revealedPlayerTab },
        setPreviewCard,
        setRevealedPlayerName: setRevealedPlayer,
        setRevealedPlayerTab,
      }}
    >
      {children}
    </ContextStripContext.Provider>
  )
}
