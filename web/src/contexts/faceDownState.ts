import { createContext, useContext } from 'react'

interface FaceDownContextValue {
  faceDownCardIds: Set<string>
}

export const FaceDownContext = createContext<FaceDownContextValue>({ faceDownCardIds: new Set() })

export function useFaceDown(cardId: string): boolean {
  const { faceDownCardIds } = useContext(FaceDownContext)
  return faceDownCardIds.has(cardId)
}
