// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PhasePopover } from './PhasePopover'

afterEach(cleanup)

it('takes the whole tap that closes it, so nothing underneath gets the click', () => {
  const onClose = vi.fn()
  render(
    <PhasePopover
      phase="draft"
      anchorRect={{ top: 0, bottom: 20, left: 0, width: 40 } as DOMRect}
      useUpgrades
      onClose={onClose}
      onOpenDetails={() => {}}
      onOpenControls={() => {}}
    />,
  )

  const cover = document.body.lastElementChild!.previousElementSibling!
  fireEvent.mouseDown(cover)
  expect(onClose).not.toHaveBeenCalled()

  fireEvent.click(cover)
  expect(onClose).toHaveBeenCalledOnce()
})
