// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SidePanelHostContext } from './common/sidePanelHost'
import { PhasePopover } from './PhasePopover'

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
})

it('takes the whole tap that closes it over the board, and lets a bar button act on that tap', () => {
  const board = document.body.appendChild(document.createElement('div'))
  const barButton = document.body.appendChild(document.createElement('button'))
  const onClose = vi.fn()
  render(
    <SidePanelHostContext.Provider value={board}>
      <PhasePopover
        phase="draft"
        anchorRect={{ top: 0, bottom: 20, left: 0, width: 40 } as DOMRect}
        useUpgrades
        onClose={onClose}
        onOpenDetails={() => {}}
        onOpenControls={() => {}}
      />
    </SidePanelHostContext.Provider>,
  )

  const boardTap = board.firstElementChild ?? board
  fireEvent.mouseDown(boardTap)
  expect(onClose).not.toHaveBeenCalled()
  fireEvent.click(boardTap)
  expect(onClose).toHaveBeenCalledTimes(1)

  fireEvent.mouseDown(barButton)
  expect(onClose).toHaveBeenCalledTimes(2)
})
