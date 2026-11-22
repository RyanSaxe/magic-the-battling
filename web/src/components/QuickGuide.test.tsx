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
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
  // jsdom has no layout or animations, so the list starts at 100 and the Treasures heading 300 below it.
  Element.prototype.getAnimations = () => []
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(2000)
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(500)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return new DOMRect(0, this.tagName === 'H2' && this.textContent === 'Treasures' ? 400 : 100, 300, 20)
  })
  render(<QuickGuide />)

  fireEvent.click(screen.getByRole('radio', { name: 'Tips' }))
  fireEvent.click(screen.getAllByText('treasures', { selector: 'button' })[0])

  const list = document.getElementById('guide-panel-guide-game-pieces')!.closest('.overflow-y-auto')!
  await vi.waitFor(() => expect(list.scrollTop).toBe(300))
})
