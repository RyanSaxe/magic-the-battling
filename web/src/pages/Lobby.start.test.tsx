// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeWebSocket } from '../test/fakeWebSocket'
import { installMemoryLocalStorage } from '../test/memoryStorage'
import type { LobbyState } from '../types'
import { saveTabSession } from '../utils/tabSession'
import { Lobby } from './Lobby'

// utils/inputMode reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
})

const toasts: string[] = []

vi.mock('../api/client', () => ({
  rejoinGame: vi.fn(),
  getServerStatus: vi.fn(async () => null),
  getCubeSummary: vi.fn(async () => ({ cube_name: 'Crucible', cube_image_uri: null })),
}))
vi.mock('../contexts', () => ({ useToast: () => ({ addToast: (message: string) => toasts.push(message) }) }))
vi.mock('../contexts/authState', () => ({ useAuth: () => ({ user: null, loading: false }) }))

function lobby(overrides: Partial<LobbyState> = {}): LobbyState {
  return {
    game_id: 'game-1',
    join_code: 'ABC123',
    cube_id: 'auto',
    players: [
      { player_id: 'host', name: 'Anya', is_ready: true, is_host: true, is_connected: true, battler_id: null, battler_status: null, battler_error: null },
      { player_id: 'guest', name: 'Boris', is_ready: true, is_host: false, is_connected: true, battler_id: null, battler_status: null, battler_error: null },
    ],
    can_start: true,
    is_started: false,
    start_status: 'open',
    start_error: null,
    target_player_count: 2,
    puppet_count: 0,
    cube_loading_status: 'ready',
    cube_loading_error: null,
    available_puppet_count: 0,
    use_upgrades: true,
    guided_mode_default: false,
    voice_chat_enabled: false,
    play_mode: 'limited',
    ...overrides,
  }
}

async function openLobbyAs(playerId: string): Promise<FakeWebSocket> {
  saveTabSession('game-1', { sessionId: `session-${playerId}`, playerId })
  render(
    <MemoryRouter initialEntries={['/game/game-1/lobby']}>
      <Routes>
        <Route path="/game/:gameId/lobby" element={<Lobby />} />
      </Routes>
    </MemoryRouter>,
  )
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  const socket = FakeWebSocket.latest()
  act(() => socket.serverOpen())
  return socket
}

function send(socket: FakeWebSocket, message: unknown) {
  act(() => socket.serverMessage(message))
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement
}

function sentActions(socket: FakeWebSocket): string[] {
  return socket.sent.map((data) => JSON.parse(data).action)
}

describe('Lobby: starting the game', () => {
  beforeEach(() => {
    installMemoryLocalStorage()
    sessionStorage.clear()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    toasts.length = 0
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('gives the host the Start button back when the server refuses the start', async () => {
    const socket = await openLobbyAs('host')
    send(socket, { type: 'lobby_state', payload: lobby() })

    act(() => button('Start Game').click())
    expect(sentActions(socket)).toContain('start_game')
    send(socket, { type: 'error', payload: { code: 'USER_MESSAGE', detail: 'Not all players are ready', message: 'Not all players are ready' } })

    expect(toasts).toEqual(['Not all players are ready'])
    expect(button('Start Game').disabled).toBe(false)
  })

  it('shows guests that the game is starting, and keeps them from changing the lobby meanwhile', async () => {
    const socket = await openLobbyAs('guest')
    send(socket, { type: 'lobby_state', payload: lobby({ start_status: 'starting', can_start: false }) })

    expect(button('Starting...').disabled).toBe(true)
  })

  it('tells everyone why a start failed and lets the host start again', async () => {
    const socket = await openLobbyAs('host')
    send(socket, { type: 'lobby_state', payload: lobby() })

    act(() => {
      socket.serverMessage({ type: 'lobby_state', payload: lobby({ start_status: 'starting', can_start: false }) })
      socket.serverMessage({
        type: 'lobby_state',
        payload: lobby({ start_status: 'failed', start_error: 'Server is at game capacity. Please try again shortly.' }),
      })
    })

    expect(toasts).toEqual(['Server is at game capacity. Please try again shortly.'])
    expect(button('Start Game').disabled).toBe(false)
  })
})
