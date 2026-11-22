// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useHotkeys } from './useHotkeys'

afterEach(cleanup)

function Page({ advance }: { advance: () => void }) {
  useHotkeys({ Enter: advance })
  return <button>Unready</button>
}

it('leaves Enter to a button reached with Tab, and advances on one that was clicked', () => {
  const advance = vi.fn()
  render(<Page advance={advance} />)
  const button = screen.getByRole('button')
  // False when the hotkey took the key, so the browser won't press the button.
  const enterPressesButton = () => fireEvent.keyDown(button, { key: 'Enter' })

  fireEvent.keyDown(document.body, { key: 'Tab' })
  button.focus()
  expect(enterPressesButton()).toBe(true)
  expect(advance).not.toHaveBeenCalled()

  fireEvent.pointerDown(button)
  expect(enterPressesButton()).toBe(false)
  expect(advance).toHaveBeenCalledOnce()

  fireEvent.keyDown(button, { key: 'Tab' })
  expect(enterPressesButton()).toBe(true)
  expect(advance).toHaveBeenCalledOnce()
})
