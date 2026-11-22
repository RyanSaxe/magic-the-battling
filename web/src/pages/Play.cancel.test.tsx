// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createGame } from '../api/client'
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
