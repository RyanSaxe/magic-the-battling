// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FakeWebSocket } from '../test/fakeWebSocket'
import { installMemoryLocalStorage } from '../test/memoryStorage'
import type { CompactGameState, CompactPlayerView } from '../types'
import { saveTabSession } from '../utils/tabSession'
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
  getServerStatus: async () => null,
}))
vi.mock('../contexts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../contexts')>()),
  useToast: () => ({ addToast: () => {} }),
}))
vi.mock('../contexts/authState', () => ({ useAuth: () => ({ user: null, loading: false }) }))

beforeEach(() => {
  installMemoryLocalStorage().setItem('mtb_guided_mode_preference', '0')
  sessionStorage.clear()
  vi.stubGlobal('WebSocket', FakeWebSocket)
  // The board measures itself, and jsdom has no ResizeObserver.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  FakeWebSocket.instances = []
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function player(name: string, overrides: Partial<CompactPlayerView> = {}): CompactPlayerView {
  return {
    name,
    treasures: 0,
    poison: 0,
    phase: 'build',
    round: 1,
    stage: 3,
    vanquishers: 0,
    is_ghost: false,
    is_puppet: false,
    time_of_death: null,
    hand_count: 0,
    sideboard_count: 0,
    hand_size: 0,
    is_stage_increasing: false,
    upgrades: [],
    vanguard: null,
    chosen_basics: ['Forest', 'Island', 'Plains'],
    most_recently_revealed_cards: [],
    last_result: null,
    pairing_probability: null,
    is_most_recent_ghost: false,
    full_sideboard: [],
    command_zone: [],
    placement: 0,
    in_sudden_death: false,
    build_ready: false,
    ...overrides,
  }
}

function buildState(bob: Partial<CompactPlayerView> = {}): CompactGameState {
  const alice = {
    ...player('Alice'),
    hand: [],
    hand_slots: [],
    sideboard: [],
    command_zone: [],
    current_pack: null,
    last_battle_result: null,
  }
  return {
    game_id: 'game-1',
    phase: 'build',
    starting_life: 20,
    players: [alice, player('Bob', bob)],
    self_player: alice,
    available_upgrades: [],
    current_battle: null,
    battle_resolution: null,
    use_upgrades: true,
    voice_chat_enabled: false,
    cube_id: 'auto',
    play_mode: 'limited',
    catalog_delta: {},
  }
}

it('keeps Submit Hand disabled when another player updates before the server confirms it', async () => {
  saveTabSession('game-1', { sessionId: 'session-1', playerId: 'player-1' })
  render(
    <MemoryRouter initialEntries={['/game/game-1/play']}>
      <Routes>
        <Route path="/game/:gameId/play" element={<Game />} />
      </Routes>
    </MemoryRouter>,
  )
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  const socket = FakeWebSocket.latest()
  act(() => socket.serverOpen())
  act(() => socket.serverMessage({ type: 'game_bootstrap', payload: { catalog: {}, state: buildState() } }))

  fireEvent.click(await screen.findByText('Submit Hand', { selector: 'button' }))
  fireEvent.click(screen.getByText('Play', { selector: 'button' }))
  act(() => socket.serverMessage({ type: 'game_state', payload: buildState({ build_ready: true, poison: 8 }) }))

  expect(screen.getByText<HTMLButtonElement>('Submitting...', { selector: 'button' }).disabled).toBe(true)
  expect(socket.sent.filter((message) => message.includes('"build_ready"'))).toHaveLength(1)
})
