import { useState, useCallback, type ReactNode } from 'react'
import type { Card } from '../types'
import { ContextStripContext } from './contextStripState'

export function ContextStripProvider({ children }: { children: ReactNode }) {
  const [previewCard, setPreviewCardState] = useState<Card | null>(null)
  const [previewAppliedUpgrades, setPreviewAppliedUpgrades] = useState<Card[]>([])
  const [previewCounters, setPreviewCounters] = useState<Record<string, number>>()

  const setPreviewCard = useCallback((card: Card | null, appliedUpgrades?: Card[], counters?: Record<string, number>) => {
    setPreviewCardState(card)
    setPreviewAppliedUpgrades(appliedUpgrades ?? [])
    setPreviewCounters(counters)
  }, [])

  return (
    <ContextStripContext.Provider
      value={{
        state: { previewCard, previewAppliedUpgrades, previewCounters },
        setPreviewCard,
      }}
    >
      {children}
    </ContextStripContext.Provider>
  )
}
