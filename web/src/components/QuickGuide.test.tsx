// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { QuickGuide } from './QuickGuide'

vi.hoisted(() => {
  // inputMode reads matchMedia as it's imported, and jsdom has none.
  window.matchMedia = () => ({ matches: false }) as MediaQueryList
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('scrolls to the heading a link points to on another tab', async () => {
  // jsdom has no layout, so the page starts at 100 and the Treasures heading 300 below it.
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(2000)
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(500)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return new DOMRect(0, this.tagName === 'H2' && this.textContent === 'Treasures' ? 400 : 100, 300, 20)
  })
  render(<QuickGuide />)

  fireEvent.click(screen.getByRole('radio', { name: 'Tips' }))
  fireEvent.click(screen.getAllByText('treasures', { selector: 'button' })[0])

  await vi.waitFor(() => expect(document.querySelector('.guide-book-page')!.scrollTop).toBe(300))
})

it('turns to a section from the contents or the next section link, each at its top', () => {
  render(<QuickGuide />)
  const page = () => document.querySelector('.guide-book-page')!
  const contents = () => document.querySelector('.guide-book-switch')!
  const current = () => document.querySelector('[aria-current="page"]')!.textContent

  page().scrollTop = 200
  fireEvent.click(contents())
  fireEvent.click(screen.getByText('Game Pieces', { selector: '.guide-book-item' }))
  expect(current()).toBe('Game Pieces')
  expect(contents().getAttribute('aria-expanded')).toBe('false')
  expect(page().scrollTop).toBe(0)

  page().scrollTop = 200
  fireEvent.click(document.querySelector('.guide-book-next')!)
  expect(current()).toBe('Draft Phase')
  expect(page().scrollTop).toBe(0)
})
