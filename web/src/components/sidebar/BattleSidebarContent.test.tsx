// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { gameBootstrap } from '../../../e2e/gameStates'
import type { BattleView } from '../../types'
import { BattleSidebarContent } from './BattleSidebarContent'

// Cards read matchMedia when they're imported, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
})

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('selects the whole life total as its field opens, so typing replaces it', () => {
  // jsdom keeps no selection in a number field, so this records what's selected.
  const selected: string[] = []
  vi.spyOn(HTMLInputElement.prototype, 'select').mockImplementation(function (this: HTMLInputElement) {
    selected.push(this.value)
  })
  render(
    <BattleSidebarContent
      currentBattle={gameBootstrap({ phase: 'battle', counts: {} }).state.current_battle as unknown as BattleView}
      selfUpgrades={[]}
      yourLife={17}
      opponentLife={20}
      onYourLifeChange={() => {}}
      onOpponentLifeChange={() => {}}
      playerName="Alice"
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: '17' }))
  expect(selected).toEqual(['17'])
})
