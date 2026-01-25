import { useState, useCallback, type ReactNode } from 'react'
import type { Card, PlayerView } from '../types'
import { ContextStripContext } from './contextStripState'

export function ContextStripProvider({ children }: { children: ReactNode }) {
  const [previewCard, setPreviewCardState] = useState<Card | null>(null)
  const [previewUpgradeTarget, setPreviewUpgradeTarget] = useState<Card | null>(null)
  const [revealedPlayer, setRevealedPlayer] = useState<PlayerView | null>(null)

  const setPreviewCard = useCallback((card: Card | null, upgradeTarget?: Card | null) => {
    setPreviewCardState(card)
    setPreviewUpgradeTarget(upgradeTarget ?? null)
  }, [])

  return (
    <ContextStripContext.Provider
      value={{
        state: { previewCard, previewUpgradeTarget, revealedPlayer },
        setPreviewCard,
        setRevealedPlayer,
      }}
    >
      {children}
    </ContextStripContext.Provider>
  )
}
