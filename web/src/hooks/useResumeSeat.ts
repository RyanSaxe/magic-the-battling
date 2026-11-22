import { useNavigate } from 'react-router-dom'
import { getRememberedSeat, rememberPlayerForGame } from '../utils/deviceIdentity'
import { clearTabSession } from '../utils/tabSession'
import type { ResumableSeat } from './useResumableGames'

/**
 * Goes back to a seat. It may have been taken on another device, so this browser remembers its name first. A session
 * this tab kept from a seat the browser forgot is dropped before that, so it can't come back as this seat's.
 */
export function useResumeSeat(): (seat: ResumableSeat) => void {
  const navigate = useNavigate()
  return (seat) => {
    if (!getRememberedSeat(seat.gameId)) clearTabSession(seat.gameId)
    rememberPlayerForGame(seat.gameId, seat.playerName)
    navigate(`/game/${seat.gameId}/${seat.kind === 'lobby' ? 'lobby' : 'play'}`)
  }
}
