import { useEffect, useState } from 'react'
import { getResumableGames } from '../api/client'
import type { PlayMode } from '../types'
import { listReclaimableSeats } from '../utils/deviceIdentity'

/** A lobby or game this browser can go back to, with the details its resume card shows. */
export interface ResumableSeat {
  gameId: string
  playerName: string
  kind: 'lobby' | 'game'
  lastActiveAt: string | null
  joinCode: string | null
  cubeId: string
  cubeName: string | null
  cubeImageUri: string | null
  playMode: PlayMode
  useUpgrades: boolean
  playerCount: number
  canClose: boolean
  stage: number | null
  round: number | null
  poison: number | null
}

const SEATS_TO_CHECK = 10

export function useResumableGames(limit: number = SEATS_TO_CHECK): ResumableSeat[] {
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
            cubeId: game.cube_id,
            cubeName: game.cube_name,
            cubeImageUri: game.cube_image_uri,
            playMode: game.play_mode,
            useUpgrades: game.use_upgrades,
            playerCount: game.player_count,
            canClose: game.can_close === true,
            stage: game.stage,
            round: game.round,
            poison: game.poison,
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
