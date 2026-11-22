// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import type { UserBattler } from '../types'
import { BattlerView } from './BattlerView'

// utils/inputMode reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
})

const preset = vi.hoisted(() => ({
  id: 7,
  cube_id: 'vintage',
  cube_name: 'Powered Cube',
  display_name: 'Vintage Pod',
  play_mode: 'limited',
  puppet_count: 3,
}))

vi.mock('../api/client', () => ({
  getBattler: async () => preset,
  getBattlerGames: async () => ({ games: [], has_more: false, total_games: 0 }),
  // Like the server, a null leaves a field as it was.
  updateBattler: async (_id: number, updates: Partial<UserBattler>) => ({
    ...preset,
    ...Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== null)),
  }),
}))
vi.mock('../contexts', () => ({ useToast: () => ({ addToast: () => {} }) }))
vi.mock('../contexts/authState', () => ({ useAuth: () => ({ user: { username: 'tester' }, loading: false }) }))

afterEach(cleanup)

it('saves an emptied Display Name as no name', async () => {
  render(
    <MemoryRouter initialEntries={['/dashboard/list/7']}>
      <Routes>
        <Route path="/dashboard/list/:listId" element={<BattlerView />} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
  const settings = screen.getByRole('dialog', { name: 'Settings' })
  fireEvent.change(within(settings).getByDisplayValue('Vintage Pod'), { target: { value: '' } })

  fireEvent.click(within(settings).getByRole('button', { name: 'Save' }))

  expect(await screen.findByRole('heading', { name: 'Powered Cube' })).toBeTruthy()
})
