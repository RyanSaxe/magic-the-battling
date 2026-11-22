// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { joinGame } from '../api/client'
import { installMemoryLocalStorage } from '../test/memoryStorage'
import { joinLobbyByCode } from './joinLobby'

vi.mock('../api/client', () => ({
  joinGame: vi.fn(async () => ({ game_id: 'game-1', session_id: 'session-1', player_id: 'player-1', seat_token: 'token-1' })),
}))

it('takes a code typed with spaces, to join and to find the seat already held', async () => {
  installMemoryLocalStorage()

  expect(await joinLobbyByCode('mnl vyg', 'Riley')).toBe('/game/game-1/lobby')
  expect(joinGame).toHaveBeenCalledExactlyOnceWith('MNLVYG', 'Riley')

  expect(await joinLobbyByCode('MNLVYG', 'Riley')).toBe('/game/game-1/lobby')
  expect(await joinLobbyByCode('MN LV YG', 'Riley')).toBe('/game/game-1/lobby')
  expect(joinGame).toHaveBeenCalledOnce()
})
