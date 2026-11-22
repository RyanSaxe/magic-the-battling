// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { Card } from '../../types'
import { RevealBeforeSubmitModal } from './RevealBeforeSubmitModal'

// utils/inputMode reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it("leaves Enter to the dialog's own tabbed-to button, and reveals after a click or over a covered one", () => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  const reveal = vi.fn()
  const upgrade = { id: 'upgrade', name: 'Upgrade', type_line: 'Conspiracy', image_url: '', upgrade_target: null } as Card
  render(
    <>
      <button>Submit Result</button>
      <RevealBeforeSubmitModal upgrades={[upgrade]} onRevealAndSubmit={reveal} onSkip={vi.fn()} onClose={vi.fn()} />
    </>,
  )
  const skip = screen.getByRole('button', { name: 'Submit Without Revealing' })
  const covered = screen.getByRole('button', { name: 'Submit Result' })
  // True when nothing took the key, so the browser presses the button.
  const enterPresses = (button: HTMLElement) => fireEvent.keyDown(button, { key: 'Enter' })

  fireEvent.keyDown(document.body, { key: 'Tab' })
  expect(enterPresses(skip)).toBe(true)
  expect(reveal).not.toHaveBeenCalled()

  expect(enterPresses(covered)).toBe(false)
  expect(reveal).toHaveBeenCalledTimes(1)

  fireEvent.pointerDown(skip)
  expect(enterPresses(skip)).toBe(false)
  expect(reveal).toHaveBeenCalledTimes(2)
})
