// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { gameBootstrap } from '../../e2e/gameStates'
import { closeSeat, createGame } from '../api/client'
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

vi.mock('../api/client', () => ({
  createGame: vi.fn(),
  warmCubeCache: vi.fn(),
  closeSeat: vi.fn(async () => {}),
  getResumableGames: vi.fn(async () => []),
  getCubeSummary: vi.fn(async () => ({ cube_name: 'Crucible', cube_image_uri: null })),
}))
vi.mock('../contexts', () => ({ useToast: () => ({ addToast: vi.fn() }) }))
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

beforeEach(() => {
  installMemoryLocalStorage()
  vi.stubGlobal('WebSocket', FakeWebSocket)
  FakeWebSocket.instances = []
  vi.mocked(closeSeat).mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it.each([
  ['a Goldfish game', null, 'Start Game'],
  ['a lobby', 'Play with Friends', 'Create Lobby'],
])('drops %s that the server answers after Cancel', async (_, mode, start) => {
  let answer!: (game: Awaited<ReturnType<typeof createGame>>) => void
  vi.mocked(createGame).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
  render(
    <MemoryRouter>
      <Play />
    </MemoryRouter>,
  )
  await settle()
  if (mode) fireEvent.click(screen.getByText(mode))
  fireEvent.click(screen.getByRole('button', { name: start }))

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await act(async () =>
    answer({ game_id: 'late', join_code: 'ABC123', session_id: 's', player_id: 'p', seat_token: 't' }),
  )
  await settle()

  expect(getRememberedSeat('late')).toBeNull()
  expect(FakeWebSocket.instances).toHaveLength(0)
})

const { catalog, state } = gameBootstrap({ phase: 'build', counts: {} })

it.each([
  ['Goldfish', null, 'Start Game', { type: 'game_bootstrap', payload: { catalog, state: { ...state, game_id: 'game' } } }],
  [
    'Play with Friends',
    'Play with Friends',
    'Create Lobby',
    { type: 'lobby_state', payload: { game_id: 'game', players: [], cube_loading_status: 'ready' } },
  ],
])('%s gives up a start left by Home, and keeps one that completes', async (_, mode, start, completed) => {
  const startFromPlay = async () => {
    vi.mocked(createGame).mockResolvedValueOnce({
      game_id: 'game', join_code: 'ABC123', session_id: 's', player_id: 'p', seat_token: 't',
    })
    render(
      <MemoryRouter initialEntries={['/play']}>
        <Routes>
          <Route path="/play" element={<Play />} />
          <Route path="*" element={<p>Left Play</p>} />
        </Routes>
      </MemoryRouter>,
    )
    await settle()
    if (mode) fireEvent.click(screen.getByText(mode))
    await act(async () => screen.getByRole('button', { name: start }).click())
    await settle()
    act(() => FakeWebSocket.latest().serverOpen())
  }

  await startFromPlay()
  act(() => FakeWebSocket.latest().serverMessage(completed))
  await settle()
  expect(screen.getByText('Left Play')).toBeTruthy()
  expect(closeSeat).not.toHaveBeenCalled()
  cleanup()

  await startFromPlay()
  fireEvent.click(screen.getByRole('button', { name: 'Home' }))
  await settle()

  expect(screen.getByText('Left Play')).toBeTruthy()
  expect(closeSeat).toHaveBeenCalledWith('game', expect.any(String), 't')
  expect(getRememberedSeat('game')).toBeNull()
})
