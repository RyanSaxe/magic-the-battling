// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { gameBootstrap } from '../../../e2e/gameStates'
import type { PlayerView } from '../../types'
import { Sidebar, type Scouting } from './Sidebar'

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
})

function showPlayers(phase: 'build' | 'battle', scouting: Scouting | null = null) {
  const [alice, bob] = gameBootstrap({ phase, counts: {} }).state.players as unknown as PlayerView[]
  // The server sends 0 for everyone's odds during a Fight.
  const opponent = { ...bob, pairing_probability: phase === 'battle' ? 0 : 0.4 }
  cleanup()
  render(
    <Sidebar
      players={[alice, opponent]}
      currentPlayer={alice}
      renderFight={phase === 'battle' ? (viewSwitch) => <>{viewSwitch}</> : undefined}
      fightView="players"
      onFightViewChange={() => {}}
      scoutInline
      scouting={scouting}
      onScout={() => {}}
      onStopScouting={() => {}}
    />,
  )
}

it("hides opponents' poison, treasure, Seen in Fight and odds during a Fight, and not in Build", () => {
  showPlayers('build')
  expect(screen.getAllByTitle('Poison')).toHaveLength(2)
  expect(screen.getAllByTitle('Treasures')).toHaveLength(2)
  expect(screen.getByText('40%')).toBeTruthy()
  showPlayers('build', { player: 'Bob', tab: 'seen' })
  expect(screen.getAllByText('Seen in Fight').length).toBeGreaterThan(0)

  showPlayers('battle')
  expect(screen.getAllByTitle('Poison')).toHaveLength(1)
  expect(screen.getAllByTitle('Treasures')).toHaveLength(1)
  expect(screen.queryByText('0%')).toBeNull()
  expect(screen.getByText('Bob')).toBeTruthy()
  expect(screen.getAllByTitle(/place$/)).toHaveLength(2)

  showPlayers('battle', { player: 'Bob', tab: 'seen' })
  expect(screen.queryByText('Seen in Fight')).toBeNull()
  expect(screen.queryByText('Poison')).toBeNull()
  expect(screen.queryByText('Treasure')).toBeNull()

  showPlayers('battle', { player: 'Alice', tab: 'overview' })
  expect(screen.getByText('Poison')).toBeTruthy()
})
