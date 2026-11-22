// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeWebSocket } from '../test/fakeWebSocket'
import { installMemoryLocalStorage } from '../test/memoryStorage'
import { createGame } from '../api/client'
import { getRememberedSeat } from '../utils/deviceIdentity'
import { Play } from './Play'

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
let gamesCreated = 0

vi.mock('../api/client', () => ({
  createGame: vi.fn(async () => {
    gamesCreated += 1
    return {
      game_id: `game-${gamesCreated}`,
      join_code: 'ABC123',
      session_id: `session-${gamesCreated}`,
      player_id: `player-${gamesCreated}`,
      seat_token: `token-${gamesCreated}`,
    }
  }),
  warmCubeCache: vi.fn(),
  getResumableGames: vi.fn(async () => []),
}))
vi.mock('../contexts', () => ({ useToast: () => ({ addToast: (message: string) => toasts.push(message) }) }))
vi.mock('../contexts/authState', () => ({ useAuth: () => ({ user: null, loading: false }) }))
vi.mock('../utils/prefetchName', () => ({
  getLegendaryName: async () => 'Tester',
  prefetchLegendaryName: () => {},
}))

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
}

async function startGoldfishUntilTheStartIsSent() {
  render(
    <MemoryRouter>
      <Play />
    </MemoryRouter>,
  )
  await settle()
  await act(async () => screen.getByRole('button', { name: 'Start Game' }).click())
  await settle()
  const socket = FakeWebSocket.latest()
  const lobby = {
    game_id: 'game-1',
    join_code: 'ABC123',
    cube_id: 'auto',
    players: [{ player_id: 'player-1', name: 'Tester', is_ready: false, is_host: true, is_connected: true }],
    can_start: false,
    is_started: false,
    start_status: 'open',
    start_error: null,
    target_player_count: 8,
    puppet_count: 7,
    cube_loading_status: 'ready',
    cube_loading_error: null,
    available_puppet_count: 7,
    play_mode: 'limited',
  }
  act(() => {
    socket.serverOpen()
    socket.serverMessage({ type: 'lobby_state', payload: lobby })
  })
  await settle()
  act(() => socket.serverMessage({ type: 'lobby_state', payload: { ...lobby, can_start: true } }))
  await settle()
  expect(socket.sent.map((data) => JSON.parse(data).action)).toContain('start_game')
  return { socket, lobby }
}

describe('Play: starting a Goldfish game', () => {
  beforeEach(() => {
    installMemoryLocalStorage()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    toasts.length = 0
    gamesCreated = 0
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('starts Goldfish once on Enter in the name field', async () => {
    render(
      <MemoryRouter>
        <Play />
      </MemoryRouter>,
    )
    await settle()
    const name = screen.getByPlaceholderText('Enter your name')

    await act(async () => {
      fireEvent.keyDown(name, { key: 'Enter' })
    })
    await act(async () => {
      fireEvent.keyDown(name, { key: 'Enter' })
    })

    expect(gamesCreated).toBe(1)
    expect(createGame).toHaveBeenLastCalledWith('Tester', expect.objectContaining({ puppetCount: 3 }))
  })

  it('lets the player start again after a failed start', async () => {
    render(
      <MemoryRouter>
        <Play />
      </MemoryRouter>,
    )
    await settle()

    await act(async () => screen.getByRole('button', { name: 'Start Game' }).click())
    await settle()
    const firstSocket = FakeWebSocket.latest()
    act(() => {
      firstSocket.serverOpen()
      firstSocket.serverMessage({ type: 'connection_error', payload: { code: 'WS_CAPACITY', message: 'busy' } })
      firstSocket.serverClose(1013)
    })
    await settle()
    expect(toasts).toHaveLength(1)

    await act(async () => screen.getByRole('button', { name: 'Start Game' }).click())
    await settle()
    const secondSocket = FakeWebSocket.latest()

    expect(secondSocket).not.toBe(firstSocket)
    expect(secondSocket.url).toContain('/ws/game-2')
    expect(secondSocket.readyState).not.toBe(FakeWebSocket.CLOSED)
    expect(toasts).toHaveLength(1)
  })

  it('comes back to Start Game with the reason when the game fails to start', async () => {
    const { socket, lobby } = await startGoldfishUntilTheStartIsSent()

    act(() => {
      socket.serverMessage({ type: 'lobby_state', payload: { ...lobby, start_status: 'starting' } })
      socket.serverMessage({
        type: 'lobby_state',
        payload: { ...lobby, can_start: true, start_status: 'failed', start_error: 'Server is at game capacity.' },
      })
    })
    await settle()

    expect(toasts).toEqual(['Server is at game capacity.'])
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeTruthy()
    expect(getRememberedSeat('game-1')).toBeNull()
  })

  it('comes back to Start Game with the reason when the server refuses the start', async () => {
    const { socket } = await startGoldfishUntilTheStartIsSent()

    act(() => {
      socket.serverMessage({
        type: 'error',
        payload: { code: 'SERVER_UPDATING', detail: 'Server is updating.', message: 'Server is updating.' },
      })
    })
    await settle()

    expect(toasts).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeTruthy()
    expect(getRememberedSeat('game-1')).toBeNull()
  })

  it('does not offer a failed start for resuming', async () => {
    render(
      <MemoryRouter>
        <Play />
      </MemoryRouter>,
    )
    await settle()

    await act(async () => screen.getByRole('button', { name: 'Start Game' }).click())
    await settle()
    expect(getRememberedSeat('game-1')).not.toBeNull()
    const socket = FakeWebSocket.latest()
    act(() => {
      socket.serverOpen()
      socket.serverMessage({ type: 'connection_error', payload: { code: 'WS_CAPACITY', message: 'busy' } })
      socket.serverClose(1013)
    })
    await settle()

    expect(getRememberedSeat('game-1')).toBeNull()
  })
})
