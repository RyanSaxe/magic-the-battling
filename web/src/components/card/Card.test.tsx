// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import type { Card as CardType } from '../../types'
import { Card } from './Card'
import { CardPreviewContext } from './CardPreviewContext'
import { CardPreviewModal } from './CardPreviewModal'

// A touch screen: utils/inputMode reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
})

const ANCIENT_TOMB: CardType = {
  id: 'ancient-tomb',
  name: 'Ancient Tomb',
  image_url: 'ancient-tomb.png',
  flip_image_url: null,
  png_url: null,
  flip_png_url: null,
  type_line: 'Land',
  tokens: [],
  elo: null,
  upgrade_target: null,
  oracle_text: null,
  colors: [],
  cmc: 0,
}

function BattlefieldCard({ onTap, onPreview }: { onTap: () => void; onPreview: () => void }) {
  const [selected, setSelected] = useState(false)
  return (
    <CardPreviewContext.Provider value={{ setPreviewCard: onPreview }}>
      <Card card={ANCIENT_TOMB} selected={selected} onClick={() => setSelected(!selected)} onDoubleClick={onTap} />
    </CardPreviewContext.Provider>
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it("taps a card on a double tap whose second tap lands on the magnifier the first tap revealed", () => {
  const onTap = vi.fn()
  const onPreview = vi.fn()
  const { container } = render(<BattlefieldCard onTap={onTap} onPreview={onPreview} />)
  const card = container.querySelector<HTMLElement>('[data-guide-card-id="ancient-tomb"]')!

  fireEvent.touchEnd(card)
  fireEvent.click(card)
  const magnifier = screen.getByTitle('Preview card')
  const browserMayClick = fireEvent.touchEnd(magnifier)

  expect(browserMayClick).toBe(false)
  expect(onTap).toHaveBeenCalledTimes(1)
  expect(card.classList.contains('selected')).toBe(false)
  expect(onPreview).not.toHaveBeenCalled()
})

function CardWithItsZoom({ counters }: { counters: Record<string, number> }) {
  const [zoomed, setZoomed] = useState<{ card: CardType; counters?: Record<string, number> } | null>(null)
  return (
    <CardPreviewContext.Provider value={{ setPreviewCard: (card, _upgrades, counters) => setZoomed(card && { card, counters }) }}>
      <Card card={ANCIENT_TOMB} dimensions={{ width: 40, height: 56 }} selected counters={counters} />
      {zoomed && <CardPreviewModal {...zoomed} appliedUpgrades={[]} onClose={() => setZoomed(null)} />}
    </CardPreviewContext.Provider>
  )
}

it("shows a name too long for the card as its number, and every counter in full in the zoom", () => {
  // jsdom has no canvas, so every character here is half as wide as the text is tall.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '',
    measureText(this: { font: string }, text: string) {
      return { width: (text.length * parseFloat(this.font.replace(/^600 /, ''))) / 2 }
    },
  } as unknown as CanvasRenderingContext2D)
  render(<CardWithItsZoom counters={{ '-1/-1': 1, 'Indestructible Shield': 3 }} />)

  expect(screen.queryByText('3')).not.toBeNull()
  expect(screen.queryByText('3 Indestructible Shield')).toBeNull()
  expect(screen.getAllByText('\u22121/\u22121')).toHaveLength(1)

  fireEvent.click(screen.getByTitle('Preview card'))
  expect(screen.getAllByText('\u22121/\u22121')).toHaveLength(2)
  expect(screen.queryByText('3 Indestructible Shield')).not.toBeNull()
})
