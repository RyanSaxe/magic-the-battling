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

it('closes Apply Upgrade on one Escape with an upgrade and a card selected', () => {
  const onClose = vi.fn()
  const onApply = vi.fn()
  const upgrade = { id: 'upgrade', name: 'Upgrade', upgrade_target: null } as Card
  const target = { id: 'target', name: 'Target', upgrade_target: null } as Card
  render(
    <UpgradesModal
      upgrades={[upgrade]}
      mode="apply"
      targets={[target]}
      initialTargetId={target.id}
      onApply={onApply}
      onClose={onClose}
    />,
  )
  // Confirm shows only with both selected, as the Upgrade pill opens the dialog.
  screen.getByRole('button', { name: 'Confirm' })

  fireEvent.keyDown(document.body, { key: 'Escape' })

  expect(onClose).toHaveBeenCalledOnce()
  expect(onApply).not.toHaveBeenCalled()
})
