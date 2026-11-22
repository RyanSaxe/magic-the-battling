// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const find = (selector: string) => document.querySelector<HTMLElement>(selector)!

async function openGameOnPhone(bootstrap: ReturnType<typeof gameBootstrap>) {
  render(
    <MemoryRouter initialEntries={[`/game/${GAME_ID}/play`]}>
      <Routes>
        <Route path="/game/:gameId/play" element={<Game />} />
      </Routes>
    </MemoryRouter>,
  )
  await vi.waitFor(() => FakeWebSocket.latest())
  await act(async () => {
    FakeWebSocket.latest().serverOpen()
    FakeWebSocket.latest().serverMessage({ type: 'game_bootstrap', payload: bootstrap })
  })
}

describe('Game: what is open over the board', () => {
  beforeEach(() => {
    installMemoryLocalStorage()
    localStorage.setItem('mtb_guided_mode_preference', '0')
    saveTabSession(GAME_ID, { sessionId: 'session-1', playerId: 'player-1' })
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    vi.stubGlobal('innerWidth', 390)
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    // jsdom has no animations, so a closing panel has none to wait for.
    Element.prototype.getAnimations = () => []
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('forgets a card selected in a panel once the panel is gone, and still moves it from the panel or Actions', async () => {
    const bootstrap = gameBootstrap({ phase: 'battle', counts: { hand: 2, lands: 1 } })
    const zones = bootstrap.state.current_battle!.your_zones
    zones.sideboard = [{ ...zones.hand[0], id: 'sideboard-card' }]
    await openGameOnPhone(bootstrap)

    const selectInSideboard = () => {
      fireEvent.keyDown(document.body, { key: 's' })
      fireEvent.click(find('[data-guide-card-id="sideboard-card"]'))
    }
    const tapFelt = () => fireEvent.click(find('[data-zone="battlefield"][data-zone-owner="player"]'))
    const moves = () => FakeWebSocket.latest().sent.filter((message) => message.includes('"battle_move"')).length

    const pressEscape = () => fireEvent.keyDown(document.body, { key: 'Escape' })
    const openActions = () => fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    const ways = {
      '×': () => fireEvent.click(screen.getByRole('button', { name: 'Close Your Sideboard' })),
      Escape: pressEscape,
      'its key': () => fireEvent.keyDown(document.body, { key: 's' }),
      'the Guide': () => {
        fireEvent.click(find('[data-guide-target="guide-button"]'))
        pressEscape()
      },
      'Submit Result': () => {
        fireEvent.click(screen.getByRole('button', { name: 'Submit Result' }))
        pressEscape()
      },
      "another pile's key": () => {
        fireEvent.keyDown(document.body, { key: 'e' })
        pressEscape()
      },
      'Actions, dismissed': () => {
        openActions()
        pressEscape()
      },
      '☰': () => fireEvent.click(find('[data-guide-target="sidebar-toggle"]')),
    }
    const movedAfter: string[] = []
    for (const [how, leavePanel] of Object.entries(ways)) {
      selectInSideboard()
      leavePanel()
      const before = moves()
      tapFelt()
      if (moves() > before) movedAfter.push(how)
    }
    expect(movedAfter).toEqual([])

    selectInSideboard()
    tapFelt()
    expect(moves()).toBe(1)

    // The card is out of sight in Actions, and still the one Move To moves.
    fireEvent.click(find('[data-guide-card-id="sideboard-card"]'))
    openActions()
    fireEvent.click(screen.getByRole('button', { name: /^Move To/ }))
    fireEvent.click(find('.menu-submenu button'))
    expect(moves()).toBe(2)
  })

  it('forgets a selected card once it is dragged to another zone', async () => {
    // jsdom lays nothing out, so the graveyard gets a place of its own to be dropped on.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const at = this.matches('[data-zone="graveyard"][data-zone-owner="player"]') ? 200 : 0
      return { x: at, y: at, left: at, top: at, right: at + 50, bottom: at + 50, width: 50, height: 50 } as DOMRect
    })
    await openGameOnPhone(gameBootstrap({ phase: 'battle', counts: { lands: 1 } }))
    const land = find('[data-guide-card-id="your-land-0"]')
    fireEvent.click(land)

    fireEvent.mouseDown(land, { clientX: 10, clientY: 10, button: 0 })
    for (const at of [30, 220, 225]) {
      await act(async () => {
        fireEvent.mouseMove(document, { clientX: at, clientY: at, buttons: 1 })
      })
    }
    await act(async () => {
      fireEvent.mouseUp(document, { clientX: 225, clientY: 225 })
      // A drag swallows clicks for 50ms after it ends.
      await new Promise((resolve) => setTimeout(resolve, 60))
    })
    fireEvent.click(find('.battle-side-dropzone[data-zone="exile"][data-zone-owner="player"] > div'))

    const moves = FakeWebSocket.latest().sent.filter((message) => message.includes('"battle_move"'))
    expect(moves.map((message) => JSON.parse(message).payload.to_zone)).toEqual(['graveyard'])
  })

  it('leaves a minimized Guide and its place alone while Players and Scouting open and close', async () => {
    await openGameOnPhone(gameBootstrap({ phase: 'build', counts: { hand: 2, sideboard: 2 } }))
    fireEvent.click(find('[data-guide-target="guide-button"]'))
    fireEvent.click(screen.getByRole('radio', { name: 'FAQ' }))
    fireEvent.click(screen.getByRole('button', { name: 'Minimize guide' }))

    fireEvent.click(find('[data-guide-target="sidebar-toggle"]'))
    fireEvent.click(screen.getByRole('button', { name: /Bob/ }))
    expect(screen.getByRole('button', { name: 'Open guide' })).toBeTruthy()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(document.querySelector('.side-panel--open')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Open guide' }))
    expect(screen.getByRole('radio', { name: 'FAQ' }).getAttribute('aria-checked')).toBe('true')
  })

  it('closes a card menu on Escape and leaves the minimized Guide', async () => {
    await openGameOnPhone(gameBootstrap({ phase: 'battle', counts: { lands: 1 } }))
    fireEvent.click(find('[data-guide-target="guide-button"]'))
    fireEvent.click(screen.getByRole('button', { name: 'Minimize guide' }))
    fireEvent.contextMenu(find('[data-guide-card-id="your-land-0"]'))

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Open guide' })).toBeTruthy()
  })
})
