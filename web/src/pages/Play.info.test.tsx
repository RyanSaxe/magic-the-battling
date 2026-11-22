// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installMemoryLocalStorage } from '../test/memoryStorage'
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
vi.mock('../contexts', () => ({ useToast: () => ({ addToast: () => {} }) }))
vi.mock('../contexts/authState', () => ({ useAuth: () => ({ user: null, loading: false }) }))
vi.mock('../utils/prefetchName', () => ({ getLegendaryName: async () => 'Tester', prefetchLegendaryName: () => {} }))

beforeEach(installMemoryLocalStorage)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('takes the whole tap that closes the Guided Mode note, so it never presses Start Game', async () => {
  await act(async () => {
    render(
      <MemoryRouter>
        <Play />
      </MemoryRouter>,
    )
  })
  const info = screen.getByRole('button', { name: 'What guided mode does' })
  fireEvent.click(info)

  const tapTarget = document.querySelector('.board-backdrop')
  expect(tapTarget).not.toBeNull()
  fireEvent.pointerDown(tapTarget!)
  expect(info.getAttribute('aria-expanded')).toBe('true')

  fireEvent.click(tapTarget!)
  expect(info.getAttribute('aria-expanded')).toBe('false')
})
