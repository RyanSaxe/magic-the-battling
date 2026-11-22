// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { InfoTip } from './InfoTip'
import { SidePanelHostContext } from './sidePanelHost'

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
})

it('takes the whole tap that closes it, so nothing underneath gets the click', () => {
  const feltCover = document.body.appendChild(document.createElement('div'))
  render(
    <SidePanelHostContext.Provider value={feltCover}>
      <InfoTip label="About this" text="What it does" />
    </SidePanelHostContext.Provider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'About this' }))

  const tapTarget = feltCover.firstElementChild
  expect(tapTarget).not.toBeNull()
  fireEvent.pointerDown(tapTarget!)
  expect(screen.getByRole('tooltip')).toBeTruthy()

  fireEvent.click(tapTarget!)
  expect(screen.queryByRole('tooltip')).toBeNull()
  expect(feltCover.childElementCount).toBe(0)
})
