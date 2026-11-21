import { useEffect, useState } from 'react'
import { getResumableGames } from '../api/client'
import { listReclaimableSeats } from '../utils/deviceIdentity'

/** A lobby or game this browser can go back to, with the details its resume card shows. */
export interface ResumableSeat {
  gameId: string
  playerName: string
  kind: 'lobby' | 'game'
  lastActiveAt: string | null
  joinCode: string | null
}

const SEATS_TO_CHECK = 10

export function useResumableGames(limit: number): ResumableSeat[] {
  const [games, setGames] = useState<ResumableSeat[]>([])

  useEffect(() => {
    const seats = listReclaimableSeats(SEATS_TO_CHECK)
    if (seats.length === 0) return
    let cancelled = false
    const joinCodes = new Map(seats.map((seat) => [seat.gameId, seat.joinCode]))
    getResumableGames(
      seats.map((seat) => ({ game_id: seat.gameId, player_name: seat.name, seat_token: seat.seatToken ?? '' })),
    )
      .then((found) => {
        if (cancelled) return
        setGames(
          found.slice(0, limit).map((game) => ({
            gameId: game.game_id,
            playerName: game.player_name,
            kind: game.kind,
            lastActiveAt: game.last_active_at,
            joinCode: joinCodes.get(game.game_id) ?? null,
          })),
        )
      })
      .catch(() => {
        // The resume card is a shortcut; when the check fails the page simply shows none.
      })
    return () => {
      cancelled = true
    }
  }, [limit])

  return games
}
