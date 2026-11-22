// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelSpectateRequest } from '../api/client'
import { FakeWebSocket } from '../test/fakeWebSocket'
import { installMemoryLocalStorage } from '../test/memoryStorage'
import { readTabSpectate, saveTabSpectate } from '../utils/tabSession'
import { Game } from './Game'

// The game shell reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
})

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  getGameStatus: vi.fn(async () => ({
    game_id: 'game-1',
    phase: 'build',
    is_started: true,
    auto_approve_spectators: false,
    players: [
      { name: 'Alice', is_connected: true, is_puppet: false, phase: 'build' },
      { name: 'Bob', is_connected: false, is_puppet: false, phase: 'build' },
    ],
  })),
  getSpectateRequestStatus: vi.fn(async () => ({ status: 'pending' })),
  cancelSpectateRequest: vi.fn(async () => ({ status: 'cancelled' })),
}))
const cancelRequest = vi.mocked(cancelSpectateRequest)
vi.mock('../contexts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../contexts')>()),
  useToast: () => ({ addToast: () => {} }),
}))
const auth = vi.hoisted(() => ({ loading: false }))
vi.mock('../contexts/authState', () => ({
  useAuth: () => ({ user: auth.loading ? null : { username: 'Bob' }, loading: auth.loading }),
}))

function HomePage() {
  const navigate = useNavigate()
  return <button onClick={() => navigate('/game/game-1/play')}>Open the game link</button>
}

function renderGame() {
  render(
    <MemoryRouter initialEntries={['/game/game-1/play']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/game/:gameId/play" element={<Game />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
}

describe('Game: leaving a game you watch', () => {
  beforeEach(() => {
    installMemoryLocalStorage()
    sessionStorage.clear()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    cancelRequest.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('takes a player who watched back to their seat after they go Home', async () => {
    saveTabSpectate('game-1', { target: 'Alice', requestId: 'request-1', sessionId: 'spectator-session' })
    renderGame()
    await settle()
    act(() => FakeWebSocket.latest().serverOpen())
    expect(screen.getByText("Waiting for Alice's game to start...")).toBeTruthy()

    await act(async () => screen.getByRole('button', { name: 'Home' }).click())
    await act(async () => screen.getByRole('button', { name: 'Open the game link' }).click())
    await settle()

    expect(await screen.findByRole('button', { name: 'Reconnect' })).toBeTruthy()
    expect(readTabSpectate('game-1')).toBeNull()
  })

  it('withdraws a waiting request when the spectator leaves through Home', async () => {
    saveTabSpectate('game-1', { target: 'Alice', requestId: 'request-1', sessionId: null })
    renderGame()
    expect(await screen.findByText('Waiting for Alice')).toBeTruthy()

    await act(async () => screen.getByRole('button', { name: 'Home' }).click())

    expect(cancelRequest).toHaveBeenCalledWith('game-1', 'request-1')
    expect(screen.getByRole('button', { name: 'Open the game link' })).toBeTruthy()
  })
})

describe('Game: opening a game link', () => {
  beforeEach(() => {
    installMemoryLocalStorage()
    sessionStorage.clear()
    auth.loading = true
  })

  afterEach(() => {
    cleanup()
    auth.loading = false
  })

  it('waits for the login check before it decides whether the visitor has a seat', async () => {
    renderGame()
    await settle()

    expect(screen.queryByText('Watch a game')).toBeNull()
    expect(screen.getByText('Loading game...')).toBeTruthy()
  })
})
