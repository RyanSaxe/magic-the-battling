// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CardsView } from './CardsView'

// utils/inputMode reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
})

const card = vi.hoisted(() => (name: string) => ({ id: name, name, image_url: 'image', type_line: 'Creature', colors: [], cmc: 1 }))

vi.mock('../api/client', () => ({
  getGameCards: async () => ({ cards: [card('Lórien Revealed'), card('troll of khazad-dum')], upgrades: [] }),
}))

afterEach(cleanup)

it('finds a card by its name with or without accents', async () => {
  render(<CardsView gameId="game-1" which="cards" />)
  const name = await screen.findByPlaceholderText('Name...')
  const shown = () => screen.queryAllByRole('img').map((image) => image.getAttribute('alt'))

  fireEvent.change(name, { target: { value: 'lorien' } })
  expect(shown()).toEqual(['Lórien Revealed'])
  fireEvent.change(name, { target: { value: 'Khazad-dûm' } })
  expect(shown()).toEqual(['troll of khazad-dum'])
})
