// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeWebSocket } from '../test/fakeWebSocket'
import { installMemoryLocalStorage } from '../test/memoryStorage'
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

describe('Play: starting a Goldfish game', () => {
  beforeEach(() => {
    installMemoryLocalStorage()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    toasts.length = 0
    gamesCreated = 0
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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
