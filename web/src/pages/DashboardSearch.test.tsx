// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { DashboardDiscover } from './DashboardDiscover'
import { DashboardGames } from './DashboardGames'

// utils/inputMode reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
})

vi.mock('../contexts', () => ({ useToast: () => ({ addToast: () => {} }) }))
// One user for every render, since the pages search again when the user changes.
vi.mock('../contexts/authState', () => {
  const user = { username: 'tester' }
  return { useAuth: () => ({ user, loading: false }) }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const SEARCH_DELAY_MS = 300
const EMPTY_PAGE = { results: [], following: [], games: [], has_more: false, total: 0, total_games: 0, total_wins: 0 }

it.each<[string, ComponentType, string, string]>([
  ['Discover', DashboardDiscover, 'Search cubes', '/api/discover'],
  ['Games', DashboardGames, 'Search games', '/api/battlers/my-games'],
])('%s sends what was typed once typing stops', async (_, Page, label, path) => {
  vi.useFakeTimers()
  const searches: string[] = []
  vi.stubGlobal('fetch', async (input: string) => {
    const url = new URL(input, 'http://localhost')
    if (url.pathname === path) searches.push(url.searchParams.get('q') ?? '')
    return new Response(JSON.stringify(EMPTY_PAGE))
  })
  const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))
  render(
    <MemoryRouter>
      <Page />
    </MemoryRouter>,
  )
  await wait(0)

  const box = screen.getByLabelText(label)
  fireEvent.change(box, { target: { value: 'pau' } })
  await wait(SEARCH_DELAY_MS - 1)
  fireEvent.change(box, { target: { value: 'pauper ' } })
  await wait(SEARCH_DELAY_MS - 1)
  expect(searches).toEqual([''])
  await wait(1)
  expect(searches).toEqual(['', 'pauper'])
})
