import { useCallback, useEffect, useState } from 'react'
import { cancelSpectateRequest, createSpectateRequest, getSpectateRequestStatus } from '../api/client'
import { type AppError, unknownToAppError } from '../utils/appError'
import { clearTabSpectate, readTabSpectate, saveTabSpectate } from '../utils/tabSession'

/**
 * This tab's request to watch a player in one game.
 * - choosing: no request. `error` says why the last one could not go on.
 * - sending: the request is on its way to the server.
 * - waiting: the player has not answered yet.
 * - watching: the player allowed it, or the game lets anyone watch, and the tab connects as a spectator.
 * - denied, expired: the request ended without approval.
 *
 * Waiting and watching survive a reload of the tab. Leaving the page within the app, such as through Home, ends
 * them, so the tab can go back to choosing, or to its own seat.
 */
export type SpectateState =
  | { kind: 'choosing'; error?: AppError }
  | { kind: 'sending'; target: string }
  | { kind: 'waiting'; target: string; requestId: string }
  | { kind: 'watching'; target: string; requestId: string; sessionId: string }
  | { kind: 'denied'; target: string }
  | { kind: 'expired'; target: string }

export const SPECTATE_POLL_INTERVAL_MS = 1000

function initialSpectateState(gameId: string): SpectateState {
  const saved = readTabSpectate(gameId)
  if (!saved) return { kind: 'choosing' }
  if (saved.sessionId) {
    return { kind: 'watching', target: saved.target, requestId: saved.requestId, sessionId: saved.sessionId }
  }
  return { kind: 'waiting', target: saved.target, requestId: saved.requestId }
}

export function useSpectateRequest(gameId: string) {
  const [stored, setStored] = useState(() => ({ gameId, state: initialSpectateState(gameId) }))
  const state = stored.gameId === gameId ? stored.state : initialSpectateState(gameId)

  const setState = useCallback((next: SpectateState) => setStored({ gameId, state: next }), [gameId])

  const saved = state.kind === 'waiting' || state.kind === 'watching' ? state : null
  const savedTarget = saved?.target ?? null
  const savedRequestId = saved?.requestId ?? null
  const savedSessionId = state.kind === 'watching' ? state.sessionId : null
  useEffect(() => {
    if (!savedTarget || !savedRequestId) {
      clearTabSpectate(gameId)
      return
    }
    saveTabSpectate(gameId, { target: savedTarget, requestId: savedRequestId, sessionId: savedSessionId })
    // A reload never unmounts the page, so only leaving it within the app clears what it saved.
    return () => clearTabSpectate(gameId)
  }, [gameId, savedTarget, savedRequestId, savedSessionId])

  const request = useCallback(
    async (target: string, spectatorName: string) => {
      if (state.kind !== 'choosing') return
      setState({ kind: 'sending', target })
      try {
        const { request_id } = await createSpectateRequest(gameId, target, spectatorName)
        setState({ kind: 'waiting', target, requestId: request_id })
      } catch (err) {
        setState({ kind: 'choosing', error: unknownToAppError(err, 'spectate-request', 'Failed to send watch request') })
      }
    },
    [gameId, state.kind, setState],
  )

  const waitingFor = state.kind === 'waiting' ? state : null
  const waitingTarget = waitingFor?.target
  const waitingRequestId = waitingFor?.requestId
  useEffect(() => {
    if (!waitingTarget || !waitingRequestId) return
    let stopped = false
    let timeout: number | null = null

    const poll = async () => {
      try {
        const result = await getSpectateRequestStatus(gameId, waitingRequestId)
        if (stopped) return
        if ((result.status === 'approved' || result.status === 'watching') && result.session_id) {
          setState({ kind: 'watching', target: waitingTarget, requestId: waitingRequestId, sessionId: result.session_id })
        } else if (result.status === 'denied' || result.status === 'expired') {
          setState({ kind: result.status, target: waitingTarget })
        } else if (result.status === 'cancelled') {
          setState({ kind: 'choosing' })
        } else {
          timeout = window.setTimeout(poll, SPECTATE_POLL_INTERVAL_MS)
        }
      } catch (err) {
        if (stopped) return
        setState({ kind: 'choosing', error: unknownToAppError(err, 'spectate-status', 'Failed to check request status') })
      }
    }
    void poll()

    return () => {
      stopped = true
      if (timeout != null) clearTimeout(timeout)
    }
  }, [gameId, waitingTarget, waitingRequestId, setState])

  /** Withdraw the request while the player has not answered it. */
  const cancel = useCallback(() => {
    if (state.kind !== 'waiting') return
    setState({ kind: 'choosing' })
    // The request leaves this tab either way; a failed cancel only leaves it to expire on the server.
    cancelSpectateRequest(gameId, state.requestId).catch(() => {})
  }, [gameId, state, setState])

  /** Go back to choosing a player after a request ended. */
  const dismiss = useCallback(() => {
    if (state.kind === 'denied' || state.kind === 'expired') {
      setState({ kind: 'choosing' })
    }
  }, [state.kind, setState])

  return { state, request, cancel, dismiss }
}

export type SpectateRequestControls = ReturnType<typeof useSpectateRequest>
