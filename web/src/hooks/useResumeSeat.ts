import { useNavigate } from 'react-router-dom'
import { rememberPlayerForGame } from '../utils/deviceIdentity'
import type { ResumableSeat } from './useResumableGames'

/** Goes back to a seat. It may have been taken on another device, so this browser remembers its name first. */
export function useResumeSeat(): (seat: ResumableSeat) => void {
  const navigate = useNavigate()
  return (seat) => {
    rememberPlayerForGame(seat.gameId, seat.playerName)
    navigate(`/game/${seat.gameId}/${seat.kind === 'lobby' ? 'lobby' : 'play'}`)
  }
}
