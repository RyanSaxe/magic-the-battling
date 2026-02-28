import { useCallback } from 'react'
import { useWebSocket } from './useWebSocket'
import type { CardDestination, BuildSource, ZoneName, CardStateAction } from '../types'
import type { ZoneOwner } from '../dnd/types'

interface SpectatorConfig {
  spectatePlayer: string
  requestId: string
}

export function useGame(
  gameId: string | null,
  sessionId: string | null,
  spectatorConfig?: SpectatorConfig | null,
  onServerError?: (message: string) => void
) {
  const { isConnected, gameState, lobbyState, send, pendingSpectateRequest, clearSpectateRequest, kicked } = useWebSocket(gameId, sessionId, spectatorConfig, onServerError)

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

  const buildReady = useCallback((basics: string[], playDrawPreference: 'play' | 'draw', handOrder?: string[]) => {
    send('build_ready', { basics, play_draw_preference: playDrawPreference, hand_order: handOrder })
  }, [send])

  const buildUnready = useCallback(() => {
    send('build_unready')
  }, [send])

  const buildApplyUpgrade = useCallback((upgradeId: string, targetCardId: string) => {
    send('build_apply_upgrade', { upgrade_id: upgradeId, target_card_id: targetCardId })
  }, [send])

  const buildSetCompanion = useCallback((cardId: string) => {
    send('build_set_companion', { card_id: cardId })
  }, [send])

  const buildRemoveCompanion = useCallback(() => {
    send('build_remove_companion')
  }, [send])

  const battleMove = useCallback((cardId: string, fromZone: ZoneName, toZone: ZoneName, fromOwner: ZoneOwner, toOwner: ZoneOwner) => {
    send('battle_move', { card_id: cardId, from_zone: fromZone, to_zone: toZone, from_owner: fromOwner, to_owner: toOwner })
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

  const battlePassTurn = useCallback(() => {
    send('battle_pass_turn')
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

  const addPuppet = useCallback(() => {
    send('add_puppet')
  }, [send])

  const removePuppet = useCallback(() => {
    send('remove_puppet')
  }, [send])

  const kickPlayer = useCallback((targetPlayerId: string) => {
    send('kick_player', { target_player_id: targetPlayerId })
  }, [send])

  const spectateResponse = useCallback((requestId: string, allowed: boolean) => {
    send('spectate_response', { request_id: requestId, allowed })
    clearSpectateRequest()
  }, [send, clearSpectateRequest])

  return {
    isConnected,
    gameState,
    lobbyState,
    pendingSpectateRequest,
    kicked,
    actions: {
      startGame,
      setReady,
      addPuppet,
      removePuppet,
      kickPlayer,
      draftSwap,
      draftRoll,
      draftDone,
      buildMove,
      buildSwap,
      buildReady,
      buildUnready,
      buildApplyUpgrade,
      buildSetCompanion,
      buildRemoveCompanion,
      battleMove,
      battleSubmitResult,
      battleUpdateCardState,
      battleUpdateLife,
      battlePassTurn,
      rewardPickUpgrade,
      rewardApplyUpgrade,
      rewardDone,
      spectateResponse,
    },
  }
}
