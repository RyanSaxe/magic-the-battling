import { useCallback } from 'react'
import { useWebSocket } from './useWebSocket'
import type { CardDestination, BuildSource, ZoneName, CardStateAction } from '../types'

export function useGame(gameId: string | null, sessionId: string | null) {
  const { isConnected, gameState, lobbyState, error, send } = useWebSocket(gameId, sessionId)

  const startGame = useCallback(() => {
    send('start_game')
  }, [send])

  const setReady = useCallback((isReady: boolean) => {
    send('set_ready', { is_ready: isReady })
  }, [send])

  const draftSwap = useCallback((packCardId: string, playerCardId: string, destination: CardDestination) => {
    send('draft_swap', { pack_card_id: packCardId, player_card_id: playerCardId, destination })
  }, [send])

  const draftRoll = useCallback(() => {
    send('draft_roll')
  }, [send])

  const draftDone = useCallback(() => {
    send('draft_done')
  }, [send])

  const buildMove = useCallback((cardId: string, source: BuildSource, destination: BuildSource) => {
    send('build_move', { card_id: cardId, source, destination })
  }, [send])

  const buildSwap = useCallback((
    cardAId: string,
    sourceA: BuildSource,
    cardBId: string,
    sourceB: BuildSource,
  ) => {
    send('build_swap', { card_a_id: cardAId, source_a: sourceA, card_b_id: cardBId, source_b: sourceB })
  }, [send])

  const buildSubmit = useCallback((basics: string[]) => {
    send('build_submit', { basics })
  }, [send])

  const buildReady = useCallback((basics: string[]) => {
    send('build_ready', { basics })
  }, [send])

  const buildUnready = useCallback(() => {
    send('build_unready')
  }, [send])

  const buildApplyUpgrade = useCallback((upgradeId: string, targetCardId: string) => {
    send('build_apply_upgrade', { upgrade_id: upgradeId, target_card_id: targetCardId })
  }, [send])

  const battleMove = useCallback((cardId: string, fromZone: ZoneName, toZone: ZoneName) => {
    send('battle_move', { card_id: cardId, from_zone: fromZone, to_zone: toZone })
  }, [send])

  const battleSubmitResult = useCallback((result: string) => {
    send('battle_submit_result', { result })
  }, [send])

  const battleUpdateCardState = useCallback((
    actionType: CardStateAction,
    cardId: string,
    data?: Record<string, unknown>
  ) => {
    send('battle_update_card_state', { action_type: actionType, card_id: cardId, data })
  }, [send])

  const battleUpdateLife = useCallback((target: 'you' | 'opponent', life: number) => {
    send('battle_update_life', { target, life })
  }, [send])

  const rewardPickUpgrade = useCallback((upgradeId: string) => {
    send('reward_pick_upgrade', { upgrade_id: upgradeId })
  }, [send])

  const rewardApplyUpgrade = useCallback((upgradeId: string, targetCardId: string) => {
    send('reward_apply_upgrade', { upgrade_id: upgradeId, target_card_id: targetCardId })
  }, [send])

  const rewardDone = useCallback((upgradeId?: string) => {
    send('reward_done', upgradeId ? { upgrade_id: upgradeId } : {})
  }, [send])

  return {
    isConnected,
    gameState,
    lobbyState,
    error,
    actions: {
      startGame,
      setReady,
      draftSwap,
      draftRoll,
      draftDone,
      buildMove,
      buildSwap,
      buildSubmit,
      buildReady,
      buildUnready,
      buildApplyUpgrade,
      battleMove,
      battleSubmitResult,
      battleUpdateCardState,
      battleUpdateLife,
      rewardPickUpgrade,
      rewardApplyUpgrade,
      rewardDone,
    },
  }
}
