import { useCallback, useEffect, useRef, useState } from 'react'
import { rejoinGame } from '../api/client'
import { type AppError, unknownToAppError } from '../utils/appError'
import { forgetSeatForGame, getRememberedSeat, rememberPlayerForGame } from '../utils/deviceIdentity'
import { type TabSession, clearTabSession, readTabSession, saveTabSession } from '../utils/tabSession'

/**
 * This tab's hold on its seat in one game.
 * - held: the tab has a session for the seat and connects with it.
 * - claiming: the tab is exchanging the browser's seat token (or its login) for a fresh session. A remembered
 *   seat has no token when its player resumed it from their account's list.
 * - none: this browser has no seat here to take back. `refused` says why, when the player asked to reconnect.
 * - lost: the seat is out of reach for the reason in `error`: released, removed by the host, opened in another
 *   tab, or the game is gone.
 */
export type SeatState =
  | { kind: 'held'; session: TabSession }
  | { kind: 'claiming' }
  | { kind: 'none'; refused?: AppError }
  | { kind: 'lost'; error: AppError }

export interface SeatGrant {
  session_id: string
  player_id: string
  seat_token: string
}

const SESSION_REJECTED_CODES = new Set(['INVALID_SESSION', 'PLAYER_NOT_IN_GAME'])

function initialSeatState(gameId: string, claimAutomatically: boolean): SeatState {
  const session = readTabSession(gameId)
  if (session) return { kind: 'held', session }
  return claimAutomatically && getRememberedSeat(gameId) ? { kind: 'claiming' } : { kind: 'none' }
}

/** With claimAutomatically false (a tab opened only to watch), the tab claims its seat only when asked. */
export function useGameSeat(gameId: string, { claimAutomatically = true }: { claimAutomatically?: boolean } = {}) {
  const [stored, setStored] = useState(() => ({ gameId, seat: initialSeatState(gameId, claimAutomatically) }))
  const seat = stored.gameId === gameId ? stored.seat : initialSeatState(gameId, claimAutomatically)
  const claimInFlight = useRef<string | null>(null)
  // After the server refuses a session, the tab claims once on its own. If the session from that claim is refused
  // before it ever connects, the player decides; once it connects, a later refusal (another restart) claims again.
  const autoClaimedAfterRejection = useRef(false)

  const setSeat = useCallback(
    (next: SeatState) => setStored({ gameId, seat: next }),
    [gameId],
  )

  const claim = useCallback(
    async (playerName?: string) => {
      const remembered = getRememberedSeat(gameId)
      const name = playerName ?? remembered?.name
      if (!name) {
        setSeat({ kind: 'none' })
        return
      }
      if (claimInFlight.current === gameId) return
      claimInFlight.current = gameId
      setSeat({ kind: 'claiming' })
      const seatToken = remembered?.name === name ? remembered.seatToken : null
      try {
        const granted = await rejoinGame(gameId, name, seatToken)
        const session = { sessionId: granted.session_id, playerId: granted.player_id }
        saveTabSession(gameId, session)
        rememberPlayerForGame(gameId, name, { seatToken: granted.seat_token })
        setSeat({ kind: 'held', session })
      } catch (err) {
        const error = unknownToAppError(err, 'rejoin-game', 'Failed to reconnect')
        const notOurs = error.code === 'SEAT_CLAIM_REQUIRED' || error.code === 'NOT_AUTHENTICATED'
        if (!notOurs) setSeat({ kind: 'lost', error })
        else setSeat(playerName ? { kind: 'none', refused: error } : { kind: 'none' })
      } finally {
        claimInFlight.current = null
      }
    },
    [gameId, setSeat],
  )

  useEffect(() => {
    if (seat.kind === 'claiming' && claimInFlight.current !== gameId) {
      void claim()
    }
  }, [seat.kind, gameId, claim])

  /** Take a seat this tab just joined, created or reclaimed through its own form. */
  const adopt = useCallback(
    (grant: SeatGrant, playerName: string, joinCode?: string) => {
      const session = { sessionId: grant.session_id, playerId: grant.player_id }
      saveTabSession(gameId, session)
      rememberPlayerForGame(gameId, playerName, { seatToken: grant.seat_token, joinCode })
      autoClaimedAfterRejection.current = false
      setSeat({ kind: 'held', session })
    },
    [gameId, setSeat],
  )

  /** Note that the session this tab holds has connected. */
  const connectionOpened = useCallback(
    (sessionId: string) => {
      if (seat.kind === 'held' && seat.session.sessionId === sessionId) {
        autoClaimedAfterRejection.current = false
      }
    },
    [seat],
  )

  /** React to the server ending the connection for the session this tab held. */
  const connectionEnded = useCallback(
    (sessionId: string, error: AppError) => {
      if (seat.kind !== 'held' || seat.session.sessionId !== sessionId) return
      if (error.code === 'SEAT_MOVED') {
        setSeat({ kind: 'lost', error })
        return
      }
      clearTabSession(gameId)
      if (error.code === 'KICKED') {
        forgetSeatForGame(gameId)
        setSeat({ kind: 'lost', error })
        return
      }
      if (SESSION_REJECTED_CODES.has(error.code) && !autoClaimedAfterRejection.current) {
        autoClaimedAfterRejection.current = true
        void claim()
        return
      }
      setSeat({ kind: 'lost', error })
    },
    [seat, gameId, setSeat, claim],
  )

  /** Bring the seat back to this tab after it was opened elsewhere. */
  const takeBack = useCallback(() => {
    clearTabSession(gameId)
    void claim()
  }, [gameId, claim])

  return { seat, claim, adopt, connectionOpened, connectionEnded, takeBack }
}
