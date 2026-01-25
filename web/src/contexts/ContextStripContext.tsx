import { useState, type ReactNode } from 'react'
import type { Card, PlayerView } from '../types'
import { ContextStripContext } from './contextStripState'

export function ContextStripProvider({ children }: { children: ReactNode }) {
  const [previewCard, setPreviewCard] = useState<Card | null>(null)
  const [revealedPlayer, setRevealedPlayer] = useState<PlayerView | null>(null)

  return (
    <ContextStripContext.Provider
      value={{
        state: { previewCard, revealedPlayer },
        setPreviewCard,
        setRevealedPlayer,
      }}
    >
      {children}
    </ContextStripContext.Provider>
  )
}
