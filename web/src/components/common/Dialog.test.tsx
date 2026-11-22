// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Dialog } from './Dialog'

afterEach(cleanup)

it('closes on Escape from its field, and marks the key handled so nothing under it closes too', () => {
  const onClose = vi.fn()
  render(
    <Dialog title="Settings" onClose={onClose}>
      <input aria-label="Name" />
    </Dialog>,
  )

  const notHandled = fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Escape' })

  expect(onClose).toHaveBeenCalledOnce()
  expect(notHandled).toBe(false)
})
