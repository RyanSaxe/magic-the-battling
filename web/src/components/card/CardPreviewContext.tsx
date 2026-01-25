import { createContext } from 'react'
import type { Card as CardType } from '../../types'

export interface CardPreviewContextValue {
  setPreviewCard: (card: CardType | null) => void
}

export const CardPreviewContext = createContext<CardPreviewContextValue | null>(null)
