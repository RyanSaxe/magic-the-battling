// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useHotkeys } from './useHotkeys'

afterEach(cleanup)

function Page({ advance }: { advance: () => void }) {
  useHotkeys({ Enter: advance })
  return <button>Unready</button>
}

it('leaves Enter to the outlined button, and advances when nothing was outlined', () => {
  const advance = vi.fn()
  render(<Page advance={advance} />)
  const button = screen.getByRole('button')
  // False when the hotkey took the key, so the browser won't press the button.
  const enterPressesButton = () => fireEvent.keyDown(button, { key: 'Enter' })

  // jsdom outlines whatever has focus. A browser outlines a clicked button only once a key goes down.
  let outlined = false
  const matches = button.matches.bind(button)
  button.matches = (selector: string) => (selector === ':focus-visible' ? outlined : matches(selector))

  fireEvent.pointerDown(button)
  button.focus()
  expect(enterPressesButton()).toBe(false)
  expect(advance).toHaveBeenCalledOnce()

  // Another key draws the outline before the page hears it.
  outlined = true
  fireEvent.keyDown(button, { key: 'Escape' })
  expect(enterPressesButton()).toBe(true)
  expect(advance).toHaveBeenCalledOnce()
})
