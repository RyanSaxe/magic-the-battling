import { useCallback } from 'react'
import type { Card, ZoneName, Phase, BuildSource } from '../types'

type BattleMoveAction = (cardId: string, fromZone: ZoneName, toZone: ZoneName) => void
type BuildMoveAction = (cardId: string, source: BuildSource, destination: BuildSource) => void

interface UseDndActionsOptions {
  phase: Phase
  battleMove?: BattleMoveAction
  buildMove?: BuildMoveAction
}

const BATTLE_VALID_ZONES: Record<ZoneName, ZoneName[]> = {
  hand: ['battlefield', 'graveyard', 'exile'],
  battlefield: ['hand', 'graveyard', 'exile'],
  graveyard: ['hand', 'battlefield', 'exile'],
  exile: ['hand', 'battlefield', 'graveyard'],
  sideboard: ['hand'],
  upgrades: [],
  command_zone: [],
  library: [],
}

const BUILD_VALID_ZONES: Record<ZoneName, ZoneName[]> = {
  hand: ['sideboard'],
  sideboard: ['hand'],
  battlefield: [],
  graveyard: [],
  exile: [],
  upgrades: [],
  command_zone: [],
  library: [],
}

export function useDndActions({ phase, battleMove, buildMove }: UseDndActionsOptions) {
  const handleCardMove = useCallback(
    (card: Card, fromZone: ZoneName, toZone: ZoneName) => {
      if (phase === 'battle' && battleMove) {
        battleMove(card.id, fromZone, toZone)
      } else if (phase === 'build' && buildMove) {
        const source: BuildSource = fromZone === 'hand' ? 'hand' : 'sideboard'
        const destination: BuildSource = toZone === 'hand' ? 'hand' : 'sideboard'
        buildMove(card.id, source, destination)
      }
    },
    [phase, battleMove, buildMove]
  )

  const getValidDropZones = useCallback(
    (fromZone: ZoneName): ZoneName[] => {
      if (phase === 'battle') {
        return BATTLE_VALID_ZONES[fromZone] || []
      } else if (phase === 'build') {
        return BUILD_VALID_ZONES[fromZone] || []
      }
      return []
    },
    [phase]
  )

  return {
    handleCardMove,
    getValidDropZones,
  }
}
