// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GAME_ID, gameBootstrap } from '../../e2e/gameStates'
import { FakeWebSocket } from '../test/fakeWebSocket'
import { installMemoryLocalStorage } from '../test/memoryStorage'
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

vi.mock('../contexts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../contexts')>()),
  useToast: () => ({ addToast: () => {} }),
}))
vi.mock('../contexts/authState', () => ({ useAuth: () => ({ user: null, loading: false }) }))

beforeEach(() => {
  installMemoryLocalStorage().setItem('mtb_guided_mode_preference', '0')
  saveTabSession(GAME_ID, { sessionId: 'session-1', playerId: 'player-1' })
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('innerWidth', 1280)
  FakeWebSocket.instances = []
  // jsdom has no animations, so a closing panel has none to wait for.
  Element.prototype.getAnimations = () => []
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function draftWith(treasures: number) {
  const bootstrap = gameBootstrap({ phase: 'draft', counts: { pack: 2, sideboard: 2 } })
  bootstrap.state.self_player.treasures = treasures
  return bootstrap
}

const receive = (treasures: number) => act(async () => {
  FakeWebSocket.latest().serverMessage({ type: 'game_bootstrap', payload: draftWith(treasures) })
})

async function openDraft() {
  render(
    <MemoryRouter initialEntries={[`/game/${GAME_ID}/play`]}>
      <Routes>
        <Route path="/game/:gameId/play" element={<Game />} />
      </Routes>
    </MemoryRouter>,
  )
  await vi.waitFor(() => FakeWebSocket.latest())
  await act(async () => FakeWebSocket.latest().serverOpen())
  await receive(1)
}

const draftsEnded = () => FakeWebSocket.latest().sent.filter((message) => message.includes('"draft_done"')).length
const pressEnter = (target: HTMLElement = document.body, repeat = false) => fireEvent.keyDown(target, { key: 'Enter', repeat })

it('never ends Draft from Enter under an open panel, and gives Enter back when it closes', async () => {
  await openDraft()
  fireEvent.click(screen.getByRole('button', { name: /Bob/ }))

  pressEnter()
  expect(draftsEnded()).toBe(0)

  const goToBuild = screen.getByRole('button', { name: 'Go to Build' })
  goToBuild.focus()
  // False when the page took the key, so the browser won't press the outlined button.
  expect(pressEnter(goToBuild)).toBe(false)

  fireEvent.keyDown(goToBuild, { key: 'Escape' })
  expect(pressEnter(goToBuild)).toBe(true)
  goToBuild.blur()
  pressEnter()
  expect(draftsEnded()).toBe(1)
})
