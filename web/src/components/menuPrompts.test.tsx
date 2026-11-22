// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import type { Card } from '../types'
import { ActionMenu } from './ActionMenu'
import { CardActionMenu } from './card/CardActionMenu'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const card = { id: 'card', name: 'Wurmcoil Engine', tokens: [], flip_image_url: null } as unknown as Card
const zones = { battlefield: [card], library: [], tapped_card_ids: [], face_down_card_ids: [], counters: {}, attachments: {} }

function withoutPromptBox() {
  const promptBox = vi.fn(() => null)
  vi.stubGlobal('prompt', promptBox)
  return promptBox
}

function typeInMenu(value: string, action: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: action }))
}

it("adds a custom counter from a field in a card's menu", () => {
  const promptBox = withoutPromptBox()
  const onAction = vi.fn()
  render(
    <CardActionMenu
      card={card}
      position={{ x: 0, y: 0 }}
      zone="battlefield"
      isTapped={false}
      isFlipped={false}
      counters={{}}
      isAttached={false}
      battlefieldCards={[card]}
      onAction={onAction}
      onMove={() => {}}
      onClose={() => {}}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /Add Counter/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Custom...' }))
  expect(promptBox).not.toHaveBeenCalled()
  typeInMenu('Oil', 'Add')

  expect(onAction).toHaveBeenCalledWith('counter', { counter_type: 'Oil', delta: 1 })
})

it('rolls a custom die from a field in the Actions menu', () => {
  const promptBox = withoutPromptBox()
  const onRollDie = vi.fn()
  const props = {
    selectedCard: null,
    battle: { your_zones: zones, opponent_zones: zones, current_turn_name: 'Alice', can_manipulate_opponent: false },
    playerName: 'Alice',
    sideboardCount: 0,
    opponentSideboardCount: 0,
    onRollDie,
    onClose: () => {},
  } as unknown as ComponentProps<typeof ActionMenu>
  render(<ActionMenu {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Roll a Die/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Custom…' }))
  expect(promptBox).not.toHaveBeenCalled()
  typeInMenu('100', 'Roll')

  expect(onRollDie).toHaveBeenCalledWith(100)
})
