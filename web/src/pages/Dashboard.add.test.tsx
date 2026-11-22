// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { createBattler, getBattlers } from '../api/client'
import type { UserBattler } from '../types'
import { Dashboard } from './Dashboard'

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
  createBattler: vi.fn(),
  getBattlers: vi.fn(),
  getFollowing: async () => ({ following: [], has_more: false }),
  getMyGames: async () => ({ games: [], total_games: 0, total_wins: 0 }),
}))
vi.mock('../contexts', () => ({ useToast: () => ({ addToast: () => {} }) }))
vi.mock('../contexts/authState', () => ({ useAuth: () => ({ user: { username: 'tester' }, loading: false }) }))
vi.mock('../hooks/useResumableGames', () => ({ useResumableGames: () => [] }))

afterEach(cleanup)

const preset = (id: number) =>
  ({ id, cube_id: `cube-${id}`, display_name: `Preset ${id}`, play_mode: 'limited', puppet_count: 3 }) as UserBattler

function held() {
  let release = () => {}
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  return { release: () => act(async () => release()), released }
}

it('keeps every preset when an Add sent during the first load returns while Load more runs', async () => {
  const firstLoad = held()
  const save = held()
  const morePage = held()
  let saved = Array.from({ length: 21 }, (_, index) => preset(index + 1))
  vi.mocked(getBattlers).mockImplementation(async (offset = 0) => {
    const page = { battlers: saved.slice(offset, offset + 20), has_more: offset + 20 < saved.length }
    await (offset ? morePage : firstLoad).released
    return page
  })
  vi.mocked(createBattler).mockImplementation(async () => {
    await save.released
    saved = [preset(22), ...saved]
    return preset(22)
  })
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  )

  fireEvent.click(screen.getByText('+ Add Cube / Deck'))
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getAllByRole('textbox')[0], { target: { value: 'cube-22' } })
  fireEvent.submit(dialog)
  fireEvent.click(screen.getByLabelText('Close Add Cube / Deck'))
  await firstLoad.release()
  fireEvent.click(screen.getByText('Load more'))
  await save.release()
  await morePage.release()

  const titles = [...document.querySelectorAll('h3')].map((title) => title.textContent).filter((title) => title?.startsWith('Preset '))
  expect(titles).toEqual(saved.map((shown) => shown.display_name))
})
