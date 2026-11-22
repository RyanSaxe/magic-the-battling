// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { gameBootstrap } from '../../../e2e/gameStates'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { hydrateGameState } from '../../utils/catalogHydration'
import { BuildPhase } from './Build'

// utils/inputMode reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('shows a pill reached with the keyboard, and not one that kept focus from a click', () => {
  installMemoryLocalStorage()
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  const { state, catalog } = gameBootstrap({ phase: 'build', counts: { hand: 1, handSize: 1, upgrades: 1 } })
  const actions = {
    buildMove: vi.fn(), buildSwap: vi.fn(), buildSetBasics: vi.fn(), buildReady: vi.fn(),
    buildUnready: vi.fn(), buildApplyUpgrade: vi.fn(), buildSetCompanion: vi.fn(), buildRemoveCompanion: vi.fn(),
  }
  render(
    <BuildPhase
      gameState={hydrateGameState(state, catalog)}
      actions={actions}
      selectedBasics={['Forest', 'Island', 'Plains']}
      onBasicsChange={vi.fn()}
      onQuickUpgrade={vi.fn()}
    />,
  )
  const pill = screen.getByRole('button', { name: /^Upgrade / })
  // jsdom can't tell how focus arrived, so say whether the browser would show a ring.
  const matches = pill.matches.bind(pill)
  let ring = false
  pill.matches = (selector: string) => (selector === ':focus-visible' ? ring : matches(selector))
  const hidden = () => pill.classList.contains('opacity-0')

  fireEvent.focusIn(pill)
  expect(hidden()).toBe(true)
  fireEvent.focusOut(pill)

  ring = true
  fireEvent.focusIn(pill)
  expect(hidden()).toBe(false)

  fireEvent.focusOut(pill)
  expect(hidden()).toBe(true)
})
