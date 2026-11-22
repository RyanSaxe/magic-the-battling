// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Card } from '../../types'
import { UpgradesModal } from './UpgradesModal'

// utils/inputMode reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
})

beforeEach(() => {
  // jsdom has no layout to observe.
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('applies on a press of Enter, and never from holding it', () => {
  const onApply = vi.fn()
  const upgrade = { id: 'upgrade', name: 'Upgrade', upgrade_target: null } as Card
  const target = { id: 'target', name: 'Target', upgrade_target: null } as Card
  render(
    <>
      <button>Upgrade Target</button>
      <UpgradesModal
        upgrades={[upgrade]}
        mode="apply"
        targets={[target]}
        initialTargetId={target.id}
        onApply={onApply}
        onClose={vi.fn()}
      />
    </>,
  )
  const opener = screen.getByRole('button', { name: 'Upgrade Target' })
  const confirm = screen.getByRole('button', { name: 'Confirm' })

  fireEvent.keyDown(opener, { key: 'Enter', repeat: true })
  expect(onApply).not.toHaveBeenCalled()

  confirm.focus()
  // False when the dialog took the key, so the browser won't press Confirm either.
  expect(fireEvent.keyDown(confirm, { key: 'Enter', repeat: true })).toBe(false)

  opener.focus()
  fireEvent.keyDown(opener, { key: 'Enter' })
  expect(onApply).toHaveBeenCalledOnce()
})
