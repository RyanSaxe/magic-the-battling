import { joinGame } from '../api/client'
import { findRememberedSeatByJoinCode, rememberPlayerForGame } from './deviceIdentity'
import { saveTabSession } from './tabSession'

/** Takes a seat in the lobby with this join code and returns the lobby's path. */
export async function joinLobbyByCode(joinCode: string, playerName: string): Promise<string> {
  // This browser already holds that seat: the lobby page takes it back with the seat token.
  const heldSeat = findRememberedSeatByJoinCode(joinCode)
  if (heldSeat && heldSeat.name === playerName) return `/game/${heldSeat.gameId}/lobby`

  const response = await joinGame(joinCode, playerName)
  saveTabSession(response.game_id, { sessionId: response.session_id, playerId: response.player_id })
  rememberPlayerForGame(response.game_id, playerName, { seatToken: response.seat_token, joinCode: joinCode.toUpperCase() })
  return `/game/${response.game_id}/lobby`
}
